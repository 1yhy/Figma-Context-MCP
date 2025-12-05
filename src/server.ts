import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FigmaService, type FigmaError } from "./services/figma.js";
import express, { type Request, type Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { type IncomingMessage, type ServerResponse } from "http";
import { type Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { SimplifiedDesign } from "./types/index.js";

// ==================== Logging Utilities ====================

export const Logger = {
  log: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
};

// ==================== Error Formatting ====================

/**
 * Check if error is a Figma API error
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
 * Format error information for AI understanding
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

// ==================== MCP Server ====================

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
    // Tool: Get Figma data
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

          // Serialize in segments to handle large files
          const nodesJson = `[${nodes.map((node) => JSON.stringify(node, null, 2)).join(",")}]`;
          const metadataJson = JSON.stringify(metadata, null, 2);
          const resultJson = `{ "metadata": ${metadataJson}, "nodes": ${nodesJson} }`;

          // Add cache status information
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
          const errorMessage = formatErrorForAI(
            error,
            `Failed to fetch Figma data for file ${fileKey}`,
          );
          return {
            isError: true,
            content: [{ type: "text", text: errorMessage }],
          };
        }
      },
    );

    // Tool: Download images
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
            fileName: z
              .string()
              .describe("The local filename to save as (e.g., 'icon.svg', 'photo.png')"),
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
          // Classify processing: image fills vs rendered nodes
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
              fileType: fileName.toLowerCase().endsWith(".svg")
                ? ("svg" as const)
                : ("png" as const),
            }));

          // Execute sequentially to reduce rate limit risk
          const fillResults = await this.figmaService.getImageFills(fileKey, imageFills, localPath);
          const renderResults = await this.figmaService.getImages(
            fileKey,
            renderRequests,
            localPath,
          );

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
          const errorMessage = formatErrorForAI(
            error,
            `Failed to download images from file ${fileKey}`,
          );
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
