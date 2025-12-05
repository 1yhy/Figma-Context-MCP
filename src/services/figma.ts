import fs from "fs";
import path from "path";
import { parseFigmaResponse, SimplifiedDesign } from "./simplify-node-response.js";
import { cacheManager } from "./cache.js";
import type {
  GetImagesResponse,
  GetFileResponse,
  GetFileNodesResponse,
  GetImageFillsResponse,
} from "@figma/rest-api-spec";
import { Logger } from "~/server.js";

// ==================== 类型定义 ====================

/**
 * Figma API 错误
 */
export interface FigmaError {
  status: number;
  err: string;
  rateLimitInfo?: RateLimitInfo;
}

/**
 * Rate Limit 信息
 */
export interface RateLimitInfo {
  /** 剩余请求数 */
  remaining: number | null;
  /** 重置时间（秒） */
  resetAfter: number | null;
  /** 重试等待时间（秒） */
  retryAfter: number | null;
}

/**
 * 图片下载参数
 */
export interface FetchImageParams {
  /** Figma 节点 ID */
  nodeId: string;
  /** 本地保存的文件名 */
  fileName: string;
  /** 文件格式 */
  fileType: "png" | "svg";
}

/**
 * 图片填充下载参数
 */
export interface FetchImageFillParams {
  /** 节点 ID */
  nodeId: string;
  /** 本地保存的文件名 */
  fileName: string;
  /** 图片引用 ID */
  imageRef: string;
}

/**
 * API 响应结果
 */
interface ApiResponse<T> {
  data: T;
  rateLimitInfo: RateLimitInfo;
}

// ==================== 工具函数 ====================

/**
 * 验证 fileKey 格式
 */
function validateFileKey(fileKey: string): void {
  if (!fileKey || typeof fileKey !== "string") {
    throw createFigmaError(400, "fileKey is required");
  }
  // Figma fileKey 通常是字母数字组合
  if (!/^[a-zA-Z0-9_-]+$/.test(fileKey)) {
    throw createFigmaError(400, `Invalid fileKey format: ${fileKey}`);
  }
}

/**
 * 验证 nodeId 格式
 */
function validateNodeId(nodeId: string): void {
  if (!nodeId || typeof nodeId !== "string") {
    throw createFigmaError(400, "nodeId is required");
  }
  // Figma nodeId 格式通常是 数字:数字 或 数字-数字
  if (!/^[\d:_-]+$/.test(nodeId)) {
    throw createFigmaError(400, `Invalid nodeId format: ${nodeId}`);
  }
}

/**
 * 验证 depth 参数
 */
function validateDepth(depth?: number): void {
  if (depth !== undefined) {
    if (typeof depth !== "number" || depth < 1 || depth > 100) {
      throw createFigmaError(400, "depth must be a number between 1 and 100");
    }
  }
}

/**
 * 验证本地路径安全性
 */
function validateLocalPath(localPath: string, fileName: string): string {
  const normalizedPath = path.resolve(localPath, fileName);
  const resolvedLocalPath = path.resolve(localPath);

  if (!normalizedPath.startsWith(resolvedLocalPath)) {
    throw createFigmaError(400, "Invalid file path: path traversal detected");
  }

  return normalizedPath;
}

/**
 * 创建 Figma 错误
 */
function createFigmaError(status: number, message: string, rateLimitInfo?: RateLimitInfo): FigmaError {
  return {
    status,
    err: message,
    rateLimitInfo,
  };
}

/**
 * 从响应头提取 Rate Limit 信息
 */
function extractRateLimitInfo(headers: Headers): RateLimitInfo {
  return {
    remaining: headers.has("x-rate-limit-remaining")
      ? parseInt(headers.get("x-rate-limit-remaining")!, 10)
      : null,
    resetAfter: headers.has("x-rate-limit-reset")
      ? parseInt(headers.get("x-rate-limit-reset")!, 10)
      : null,
    retryAfter: headers.has("retry-after") ? parseInt(headers.get("retry-after")!, 10) : null,
  };
}

/**
 * 格式化 Rate Limit 错误信息
 */
function formatRateLimitError(rateLimitInfo: RateLimitInfo): string {
  const parts: string[] = ["Figma API rate limit exceeded (429 Too Many Requests)."];

  if (rateLimitInfo.retryAfter !== null) {
    const minutes = Math.ceil(rateLimitInfo.retryAfter / 60);
    const hours = Math.ceil(rateLimitInfo.retryAfter / 3600);
    const days = Math.ceil(rateLimitInfo.retryAfter / 86400);

    if (days > 1) {
      parts.push(`Please retry after ${days} days.`);
    } else if (hours > 1) {
      parts.push(`Please retry after ${hours} hours.`);
    } else {
      parts.push(`Please retry after ${minutes} minutes.`);
    }
  }

  parts.push(
    "\nThis is likely due to Figma's November 2025 rate limit update.",
    "Starter plan: 6 requests/month. Professional plan: 10 requests/minute.",
    "\nSuggestions:",
    "1. Check if the design file belongs to a Starter plan workspace",
    "2. Duplicate the file to your own Professional workspace",
    "3. Wait for the rate limit to reset",
  );

  return parts.join(" ");
}

/**
 * 下载图片到本地
 */
async function downloadImage(
  url: string,
  localPath: string,
  fileName: string,
  fileKey: string,
  nodeId: string,
  format: string,
): Promise<string> {
  // 验证路径安全性
  const fullPath = validateLocalPath(localPath, fileName);

  // 检查图片缓存
  const cachedPath = await cacheManager.hasImage(fileKey, nodeId, format);
  if (cachedPath) {
    // 从缓存复制到目标路径
    const copied = await cacheManager.copyImageFromCache(fileKey, nodeId, format, fullPath);
    if (copied) {
      Logger.log(`Image loaded from cache: ${fileName}`);
      return fullPath;
    }
  }

  // 确保目录存在
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 下载图片
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(30000), // 30秒超时
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  // 使用 arrayBuffer 替代流式处理，更可靠
  const buffer = await response.arrayBuffer();
  await fs.promises.writeFile(fullPath, Buffer.from(buffer));

  // 缓存图片
  await cacheManager.cacheImage(fullPath, fileKey, nodeId, format);

  return fullPath;
}

// ==================== 日志工具 ====================

/**
 * 写入开发日志
 */
function writeLogs(name: string, value: unknown): void {
  try {
    if (process.env.NODE_ENV !== "development") return;

    const logsDir = "logs";

    try {
      fs.accessSync(process.cwd(), fs.constants.W_OK);
    } catch {
      return;
    }

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }
    fs.writeFileSync(`${logsDir}/${name}`, JSON.stringify(value, null, 2));
  } catch {
    // 忽略日志写入错误
  }
}

// ==================== Figma 服务类 ====================

/**
 * Figma API 服务
 */
export class FigmaService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.figma.com/v1";

  /** 最近的 Rate Limit 信息 */
  private lastRateLimitInfo: RateLimitInfo | null = null;

  constructor(apiKey: string) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new Error("Figma API key is required");
    }
    this.apiKey = apiKey;
  }

  /**
   * 获取最近的 Rate Limit 信息
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.lastRateLimitInfo;
  }

  /**
   * 发起 API 请求
   */
  private async request<T>(endpoint: string): Promise<ApiResponse<T>> {
    if (typeof fetch !== "function") {
      throw new Error(
        "The MCP server requires Node.js 18+ with fetch support.\n" +
          "Please upgrade your Node.js version to continue.",
      );
    }

    Logger.log(`Calling ${this.baseUrl}${endpoint}`);

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        "X-Figma-Token": this.apiKey,
      },
    });

    // 提取 Rate Limit 信息
    const rateLimitInfo = extractRateLimitInfo(response.headers);
    this.lastRateLimitInfo = rateLimitInfo;

    // 处理错误响应
    if (!response.ok) {
      const status = response.status;
      let errorMessage = response.statusText || "Unknown error";

      // 特殊处理 429 错误
      if (status === 429) {
        errorMessage = formatRateLimitError(rateLimitInfo);
      } else if (status === 403) {
        errorMessage =
          "Access denied. Please check your Figma API key and file permissions.";
      } else if (status === 404) {
        errorMessage =
          "File or node not found. Please verify the fileKey and nodeId are correct.";
      }

      throw createFigmaError(status, errorMessage, rateLimitInfo);
    }

    const data = (await response.json()) as T;
    return { data, rateLimitInfo };
  }

  /**
   * 获取图片填充的 URL 并下载
   */
  async getImageFills(
    fileKey: string,
    nodes: FetchImageFillParams[],
    localPath: string,
  ): Promise<string[]> {
    if (nodes.length === 0) return [];

    // 验证参数
    validateFileKey(fileKey);
    nodes.forEach((node) => {
      validateNodeId(node.nodeId);
    });

    const endpoint = `/files/${fileKey}/images`;
    const { data } = await this.request<GetImageFillsResponse>(endpoint);
    const { images = {} } = data.meta;

    const downloads = nodes.map(async ({ imageRef, fileName, nodeId }) => {
      const imageUrl = images[imageRef];
      if (!imageUrl) {
        Logger.log(`Image not found for ref: ${imageRef}`);
        return "";
      }

      try {
        const format = fileName.toLowerCase().endsWith(".svg") ? "svg" : "png";
        return await downloadImage(imageUrl, localPath, fileName, fileKey, nodeId, format);
      } catch (error) {
        Logger.error(`Failed to download image ${fileName}:`, error);
        return "";
      }
    });

    return Promise.all(downloads);
  }

  /**
   * 渲染节点为图片并下载
   */
  async getImages(
    fileKey: string,
    nodes: FetchImageParams[],
    localPath: string,
  ): Promise<string[]> {
    if (nodes.length === 0) return [];

    // 验证参数
    validateFileKey(fileKey);
    nodes.forEach((node) => validateNodeId(node.nodeId));

    // 分类获取 PNG 和 SVG
    const pngNodes = nodes.filter(({ fileType }) => fileType === "png");
    const svgNodes = nodes.filter(({ fileType }) => fileType === "svg");

    // 获取图片 URL（顺序执行以减少 Rate Limit 风险）
    const imageUrls: Record<string, string> = {};

    if (pngNodes.length > 0) {
      const pngIds = pngNodes.map(({ nodeId }) => nodeId).join(",");
      const { data } = await this.request<GetImagesResponse>(
        `/images/${fileKey}?ids=${pngIds}&scale=2&format=png`,
      );
      Object.assign(imageUrls, data.images || {});
    }

    if (svgNodes.length > 0) {
      const svgIds = svgNodes.map(({ nodeId }) => nodeId).join(",");
      const { data } = await this.request<GetImagesResponse>(
        `/images/${fileKey}?ids=${svgIds}&scale=2&format=svg`,
      );
      Object.assign(imageUrls, data.images || {});
    }

    // 下载图片
    const downloads = nodes.map(async ({ nodeId, fileName, fileType }) => {
      const imageUrl = imageUrls[nodeId];
      if (!imageUrl) {
        Logger.log(`Image URL not found for node: ${nodeId}`);
        return "";
      }

      try {
        return await downloadImage(imageUrl, localPath, fileName, fileKey, nodeId, fileType);
      } catch (error) {
        Logger.error(`Failed to download image ${fileName}:`, error);
        return "";
      }
    });

    return Promise.all(downloads);
  }

  /**
   * 获取整个 Figma 文件
   */
  async getFile(fileKey: string, depth?: number): Promise<SimplifiedDesign> {
    // 验证参数
    validateFileKey(fileKey);
    validateDepth(depth);

    // 尝试从缓存获取
    const cached = await cacheManager.getNodeData<SimplifiedDesign>(fileKey, undefined, depth);
    if (cached) {
      Logger.log(`File loaded from cache: ${fileKey}`);
      return cached;
    }

    try {
      const endpoint = `/files/${fileKey}${depth ? `?depth=${depth}` : ""}`;
      Logger.log(`Retrieving Figma file: ${fileKey} (depth: ${depth ?? "default"})`);

      const { data: response } = await this.request<GetFileResponse>(endpoint);
      Logger.log("Got response");

      const simplifiedResponse = parseFigmaResponse(response);

      // 写入开发日志
      writeLogs("figma-raw.json", response);
      writeLogs("figma-simplified.json", simplifiedResponse);

      // 写入缓存
      await cacheManager.setNodeData(simplifiedResponse, fileKey, undefined, depth);

      return simplifiedResponse;
    } catch (error) {
      // 重新抛出 Figma 错误以保留详细信息
      if ((error as FigmaError).status) {
        throw error;
      }
      Logger.error("Failed to get file:", error);
      throw error;
    }
  }

  /**
   * 获取特定节点
   */
  async getNode(fileKey: string, nodeId: string, depth?: number): Promise<SimplifiedDesign> {
    // 验证参数
    validateFileKey(fileKey);
    validateNodeId(nodeId);
    validateDepth(depth);

    // 尝试从缓存获取
    const cached = await cacheManager.getNodeData<SimplifiedDesign>(fileKey, nodeId, depth);
    if (cached) {
      Logger.log(`Node loaded from cache: ${fileKey}/${nodeId}`);
      return cached;
    }

    const endpoint = `/files/${fileKey}/nodes?ids=${nodeId}${depth ? `&depth=${depth}` : ""}`;
    const { data: response } = await this.request<GetFileNodesResponse>(endpoint);

    Logger.log("Got response from getNode, now parsing.");
    writeLogs("figma-raw.json", response);

    const simplifiedResponse = parseFigmaResponse(response);
    writeLogs("figma-simplified.json", simplifiedResponse);

    // 写入缓存
    await cacheManager.setNodeData(simplifiedResponse, fileKey, nodeId, depth);

    return simplifiedResponse;
  }
}
