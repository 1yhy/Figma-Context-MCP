import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FigmaService, FigmaError } from "./services/figma.js";
import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { IncomingMessage, ServerResponse } from "http";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SimplifiedDesign } from "./services/simplify-node-response.js";

// ==================== 日志工具 ====================

export const Logger = {
  log: (...args: unknown[]) => {},
  error: (...args: unknown[]) => {},
};

// ==================== 错误格式化 ====================

/**
 * 检查错误是否为 Figma API 错误
 */
function isFigmaError(error: unknown): error is FigmaError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as FigmaError).status === "number"
  );
}

/**
 * 格式化错误信息供 AI 理解
 */
function formatErrorForAI(error: unknown, context: string): string {
  if (isFigmaError(error)) {
    const parts: string[] = [`[Figma API Error] ${context}`];
    parts.push(`Status: ${error.status}`);
    parts.push(`Message: ${error.err}`);

    if (error.rateLimitInfo) {
      const { remaining, resetAfter, retryAfter } = error.rateLimitInfo;
      if (remaining !== null) parts.push(`Rate Limit Remaining: ${remaining}`);
      if (retryAfter !== null) parts.push(`Retry After: ${retryAfter} seconds`);
      if (resetAfter !== null) parts.push(`Reset After: ${resetAfter} seconds`);
    }

    return parts.join("\n");
  }

  if (error instanceof Error) {
    return `[Error] ${context}: ${error.message}`;
  }

  return `[Error] ${context}: ${String(error)}`;
}

// ==================== MCP 服务器 ====================

export class FigmaMcpServer {
  private readonly server: McpServer;
  private readonly figmaService: FigmaService;
  private sseTransport: SSEServerTransport | null = null;

  constructor(figmaApiKey: string) {
    this.figmaService = new FigmaService(figmaApiKey);
    this.server = new McpServer(
      {
        name: "Figma MCP Server",
        version: "1.0.2",
      },
      {
        capabilities: {
          logging: {},
          tools: {},
        },
      },
    );

    this.registerTools();
  }

  private registerTools(): void {
    // Tool: 获取 Figma 数据
    this.server.tool(
      "get_figma_data",
      "Get layout and style information from a Figma file or specific node. " +
        "Returns simplified design data including CSS styles, text content, and export info. " +
        "Results are cached for 24 hours to reduce API calls.",
      {
        fileKey: z
          .string()
          .describe(
            "The key of the Figma file to fetch, found in URL like figma.com/(file|design)/<fileKey>/...",
          ),
        nodeId: z
          .string()
          .optional()
          .describe(
            "The ID of a specific node to fetch (e.g., '1234:5678'), found as URL parameter node-id=<nodeId>. Use this for better performance with large files.",
          ),
        depth: z
          .number()
          .optional()
          .describe(
            "How many levels deep to traverse the node tree (1-100). Only use if explicitly needed.",
          ),
      },
      async ({ fileKey, nodeId, depth }) => {
        try {
          Logger.log(
            `Fetching ${depth ? `${depth} layers deep` : "all layers"} of ${
              nodeId ? `node ${nodeId} from file` : `full file`
            } ${fileKey}`,
          );

          let file: SimplifiedDesign;
          if (nodeId) {
            file = await this.figmaService.getNode(fileKey, nodeId, depth);
          } else {
            file = await this.figmaService.getFile(fileKey, depth);
          }

          Logger.log(`Successfully fetched file: ${file.name}`);
          const { nodes, ...metadata } = file;

          // 分段序列化以处理大文件
          const nodesJson = `[${nodes.map((node) => JSON.stringify(node, null, 2)).join(",")}]`;
          const metadataJson = JSON.stringify(metadata, null, 2);
          const resultJson = `{ "metadata": ${metadataJson}, "nodes": ${nodesJson} }`;

          // 添加缓存状态信息
          const rateLimitInfo = this.figmaService.getRateLimitInfo();
          let statusNote = "";
          if (rateLimitInfo && rateLimitInfo.remaining !== null) {
            statusNote = `\n\n[API Status] Rate limit remaining: ${rateLimitInfo.remaining}`;
          }

          return {
            content: [{ type: "text", text: resultJson + statusNote }],
          };
        } catch (error) {
          Logger.error(`Error fetching file ${fileKey}:`, error);
          const errorMessage = formatErrorForAI(error, `Failed to fetch Figma data for file ${fileKey}`);
          return {
            isError: true,
            content: [{ type: "text", text: errorMessage }],
          };
        }
      },
    );

    // Tool: 下载图片
    this.server.tool(
      "download_figma_images",
      "Download SVG and PNG images from a Figma file. " +
        "Supports both rendered node images and image fills. " +
        "Images are cached locally to avoid repeated downloads.",
      {
        fileKey: z.string().describe("The key of the Figma file containing the images"),
        nodes: z
          .object({
            nodeId: z
              .string()
              .describe("The ID of the Figma image node to fetch (e.g., '1234:5678')"),
            imageRef: z
              .string()
              .optional()
              .describe(
                "Required for image fills (background images). Leave blank for vector/icon SVGs.",
              ),
            fileName: z.string().describe("The local filename to save as (e.g., 'icon.svg', 'photo.png')"),
          })
          .array()
          .describe("Array of image nodes to download"),
        localPath: z
          .string()
          .describe(
            "Absolute path to the directory where images should be saved. Directories will be created if needed.",
          ),
      },
      async ({ fileKey, nodes, localPath }) => {
        try {
          // 分类处理：图片填充 vs 渲染节点
          const imageFills = nodes.filter(({ imageRef }) => !!imageRef) as {
            nodeId: string;
            imageRef: string;
            fileName: string;
          }[];

          const renderRequests = nodes
            .filter(({ imageRef }) => !imageRef)
            .map(({ nodeId, fileName }) => ({
              nodeId,
              fileName,
              fileType: fileName.toLowerCase().endsWith(".svg") ? ("svg" as const) : ("png" as const),
            }));

          // 顺序执行以减少 Rate Limit 风险
          const fillResults = await this.figmaService.getImageFills(fileKey, imageFills, localPath);
          const renderResults = await this.figmaService.getImages(fileKey, renderRequests, localPath);

          const allDownloads = [...fillResults, ...renderResults];
          const successfulDownloads = allDownloads.filter((path) => path && path.length > 0);
          const failedCount = allDownloads.length - successfulDownloads.length;

          let resultMessage: string;
          if (successfulDownloads.length === allDownloads.length) {
            resultMessage = `Successfully downloaded ${successfulDownloads.length} images:\n${successfulDownloads.join("\n")}`;
          } else if (successfulDownloads.length > 0) {
            resultMessage = `Downloaded ${successfulDownloads.length}/${allDownloads.length} images (${failedCount} failed):\n${successfulDownloads.join("\n")}`;
          } else {
            resultMessage = `Failed to download any images. Please check the node IDs and try again.`;
          }

          return {
            content: [{ type: "text", text: resultMessage }],
          };
        } catch (error) {
          Logger.error(`Error downloading images from file ${fileKey}:`, error);
          const errorMessage = formatErrorForAI(error, `Failed to download images from file ${fileKey}`);
          return {
            isError: true,
            content: [{ type: "text", text: errorMessage }],
          };
        }
      },
    );
  }

  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);

    Logger.log = (...args: unknown[]) => {
      this.server.server.sendLoggingMessage({
        level: "info",
        data: args,
      });
    };
    Logger.error = (...args: unknown[]) => {
      this.server.server.sendLoggingMessage({
        level: "error",
        data: args,
      });
    };

    Logger.log("Server connected and ready to process requests");
  }

  async startHttpServer(port: number): Promise<void> {
    const app = express();

    app.get("/sse", async (req: Request, res: Response) => {
      console.log("New SSE connection established");
      this.sseTransport = new SSEServerTransport(
        "/messages",
        res as unknown as ServerResponse<IncomingMessage>,
      );
      await this.server.connect(this.sseTransport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      if (!this.sseTransport) {
        res.sendStatus(400);
        return;
      }
      await this.sseTransport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>,
      );
    });

    Logger.log = console.log;
    Logger.error = console.error;

    app.listen(port, () => {
      Logger.log(`HTTP server listening on port ${port}`);
      Logger.log(`SSE endpoint available at http://localhost:${port}/sse`);
      Logger.log(`Message endpoint available at http://localhost:${port}/messages`);
    });
  }
}
