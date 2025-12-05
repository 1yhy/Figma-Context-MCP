/**
 * Figma API Type Definitions
 *
 * Types related to Figma API interactions, including node types,
 * export formats, and API response structures.
 *
 * @module types/figma
 */

// ==================== Node Types ====================

/** Figma node types */
export type FigmaNodeType =
  | "DOCUMENT"
  | "CANVAS"
  | "FRAME"
  | "GROUP"
  | "TEXT"
  | "VECTOR"
  | "RECTANGLE"
  | "ELLIPSE"
  | "LINE"
  | "POLYGON"
  | "STAR"
  | "BOOLEAN_OPERATION"
  | "REGULAR_POLYGON"
  | "INSTANCE"
  | "COMPONENT"
  | string;

/**
 * Image resource reference
 */
export interface ImageResource {
  /** Image reference ID for downloading */
  imageRef: string;
}

// ==================== Export Types ====================

/**
 * Export format options
 */
export type ExportFormat = "PNG" | "JPG" | "SVG";

/**
 * Export information for image nodes
 */
export interface ExportInfo {
  /** Export type (single image or image group) */
  type: "IMAGE" | "IMAGE_GROUP";
  /** Recommended export format */
  format: ExportFormat;
  /** Node ID for API calls (optional, defaults to node.id) */
  nodeId?: string;
  /** Suggested file name */
  fileName?: string;
}

// ==================== API Types ====================

/**
 * Figma API error
 */
export interface FigmaError {
  status: number;
  err: string;
  rateLimitInfo?: RateLimitInfo;
}

/**
 * Rate limit information from Figma API
 */
export interface RateLimitInfo {
  /** Remaining requests */
  remaining: number | null;
  /** Reset time in seconds */
  resetAfter: number | null;
  /** Retry wait time in seconds */
  retryAfter: number | null;
}

/**
 * Image download parameters
 */
export interface FetchImageParams {
  /** Figma node ID */
  nodeId: string;
  /** Local file name */
  fileName: string;
  /** File format */
  fileType: "png" | "svg";
}

/**
 * Image fill download parameters
 */
export interface FetchImageFillParams {
  /** Node ID */
  nodeId: string;
  /** Local file name */
  fileName: string;
  /** Image reference ID */
  imageRef: string;
}
