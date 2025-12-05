import fs from "fs";
import path from "path";
import { parseFigmaResponse } from "~/core/parser.js";
import type { SimplifiedDesign } from "~/types/index.js";
import { cacheManager } from "./cache.js";
import type {
  GetImagesResponse,
  GetFileResponse,
  GetFileNodesResponse,
  GetImageFillsResponse,
} from "@figma/rest-api-spec";
import { Logger } from "~/server.js";
import type {
  FigmaError,
  RateLimitInfo,
  FetchImageParams,
  FetchImageFillParams,
} from "~/types/index.js";

// Re-export types for backward compatibility
export type { FigmaError, RateLimitInfo, FetchImageParams, FetchImageFillParams };

// ==================== Internal Types ====================

/**
 * API Response Result (internal use only)
 */
interface ApiResponse<T> {
  data: T;
  rateLimitInfo: RateLimitInfo;
}

// ==================== Utility Functions ====================

/**
 * Validate fileKey format
 */
function validateFileKey(fileKey: string): void {
  if (!fileKey || typeof fileKey !== "string") {
    throw createFigmaError(400, "fileKey is required");
  }
  // Figma fileKey is typically alphanumeric
  if (!/^[a-zA-Z0-9_-]+$/.test(fileKey)) {
    throw createFigmaError(400, `Invalid fileKey format: ${fileKey}`);
  }
}

/**
 * Validate nodeId format
 */
function validateNodeId(nodeId: string): void {
  if (!nodeId || typeof nodeId !== "string") {
    throw createFigmaError(400, "nodeId is required");
  }
  // Figma nodeId format is typically number:number or number-number
  if (!/^[\d:_-]+$/.test(nodeId)) {
    throw createFigmaError(400, `Invalid nodeId format: ${nodeId}`);
  }
}

/**
 * Validate depth parameter
 */
function validateDepth(depth?: number): void {
  if (depth !== undefined) {
    if (typeof depth !== "number" || depth < 1 || depth > 100) {
      throw createFigmaError(400, "depth must be a number between 1 and 100");
    }
  }
}

/**
 * Validate local path security
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
 * Create Figma error
 */
function createFigmaError(
  status: number,
  message: string,
  rateLimitInfo?: RateLimitInfo,
): FigmaError {
  return {
    status,
    err: message,
    rateLimitInfo,
  };
}

/**
 * Extract Rate Limit information from response headers
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
 * Format Rate Limit error message
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
 * Download image to local filesystem
 */
async function downloadImage(
  url: string,
  localPath: string,
  fileName: string,
  fileKey: string,
  nodeId: string,
  format: string,
): Promise<string> {
  // Validate path security
  const fullPath = validateLocalPath(localPath, fileName);

  // Check image cache
  const cachedPath = await cacheManager.hasImage(fileKey, nodeId, format);
  if (cachedPath) {
    // Copy from cache to target path
    const copied = await cacheManager.copyImageFromCache(fileKey, nodeId, format, fullPath);
    if (copied) {
      Logger.log(`Image loaded from cache: ${fileName}`);
      return fullPath;
    }
  }

  // Ensure directory exists
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Download image
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(30000), // 30 second timeout
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  // Use arrayBuffer instead of streaming for better reliability
  const buffer = await response.arrayBuffer();
  await fs.promises.writeFile(fullPath, Buffer.from(buffer));

  // Cache image
  await cacheManager.cacheImage(fullPath, fileKey, nodeId, format);

  return fullPath;
}

// ==================== Logging Utilities ====================

/**
 * Write development logs
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
    // Ignore log write errors
  }
}

// ==================== Figma Service Class ====================

/**
 * Figma API Service
 */
export class FigmaService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.figma.com/v1";

  /** Most recent Rate Limit information */
  private lastRateLimitInfo: RateLimitInfo | null = null;

  constructor(apiKey: string) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new Error("Figma API key is required");
    }
    this.apiKey = apiKey;
  }

  /**
   * Get most recent Rate Limit information
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.lastRateLimitInfo;
  }

  /**
   * Make API request
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

    // Extract Rate Limit information
    const rateLimitInfo = extractRateLimitInfo(response.headers);
    this.lastRateLimitInfo = rateLimitInfo;

    // Handle error responses
    if (!response.ok) {
      const status = response.status;
      let errorMessage = response.statusText || "Unknown error";

      // Special handling for 429 errors
      if (status === 429) {
        errorMessage = formatRateLimitError(rateLimitInfo);
      } else if (status === 403) {
        errorMessage = "Access denied. Please check your Figma API key and file permissions.";
      } else if (status === 404) {
        errorMessage = "File or node not found. Please verify the fileKey and nodeId are correct.";
      }

      throw createFigmaError(status, errorMessage, rateLimitInfo);
    }

    const data = (await response.json()) as T;
    return { data, rateLimitInfo };
  }

  /**
   * Get image fill URLs and download
   */
  async getImageFills(
    fileKey: string,
    nodes: FetchImageFillParams[],
    localPath: string,
  ): Promise<string[]> {
    if (nodes.length === 0) return [];

    // Validate parameters
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
   * Render nodes as images and download
   */
  async getImages(
    fileKey: string,
    nodes: FetchImageParams[],
    localPath: string,
  ): Promise<string[]> {
    if (nodes.length === 0) return [];

    // Validate parameters
    validateFileKey(fileKey);
    nodes.forEach((node) => validateNodeId(node.nodeId));

    // Categorize PNG and SVG nodes
    const pngNodes = nodes.filter(({ fileType }) => fileType === "png");
    const svgNodes = nodes.filter(({ fileType }) => fileType === "svg");

    // Get image URLs (sequential execution to reduce Rate Limit risk)
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

    // Download images
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
   * Get entire Figma file
   */
  async getFile(fileKey: string, depth?: number): Promise<SimplifiedDesign> {
    // Validate parameters
    validateFileKey(fileKey);
    validateDepth(depth);

    // Try to get from cache
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

      // Write development logs
      writeLogs("figma-raw.json", response);
      writeLogs("figma-simplified.json", simplifiedResponse);

      // Write to cache
      await cacheManager.setNodeData(simplifiedResponse, fileKey, undefined, depth);

      return simplifiedResponse;
    } catch (error) {
      // Re-throw Figma errors to preserve details
      if ((error as FigmaError).status) {
        throw error;
      }
      Logger.error("Failed to get file:", error);
      throw error;
    }
  }

  /**
   * Get specific node
   */
  async getNode(fileKey: string, nodeId: string, depth?: number): Promise<SimplifiedDesign> {
    // Validate parameters
    validateFileKey(fileKey);
    validateNodeId(nodeId);
    validateDepth(depth);

    // Try to get from cache
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

    // Write to cache
    await cacheManager.setNodeData(simplifiedResponse, fileKey, nodeId, depth);

    return simplifiedResponse;
  }
}
