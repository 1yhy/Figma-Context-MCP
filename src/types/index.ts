/**
 * Figma Context MCP - Type Definitions
 *
 * This module contains all shared type definitions for the project.
 * Types are organized by domain: CSS, Figma, Simplified output.
 */

// ==================== CSS Types ====================

/** CSS hex color format */
export type CSSHexColor = `#${string}`;

/** CSS rgba color format */
export type CSSRGBAColor = `rgba(${number}, ${number}, ${number}, ${number})`;

/**
 * CSS style object containing all supported CSS properties
 */
export type CSSStyle = {
  // Text styles
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string | number;
  textAlign?: string;
  verticalAlign?: string;
  lineHeight?: string;

  // Colors and backgrounds
  color?: string;
  backgroundColor?: string;
  background?: string;
  backgroundImage?: string;

  // Layout
  width?: string;
  height?: string;
  margin?: string;
  padding?: string;
  position?: string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string;

  // Borders and radius
  border?: string;
  borderRadius?: string;
  borderWidth?: string;
  borderStyle?: string;
  borderColor?: string;
  borderImage?: string;
  borderImageSlice?: string;

  // Effects
  boxShadow?: string;
  filter?: string;
  backdropFilter?: string;
  opacity?: string;

  // Webkit specific
  webkitBackgroundClip?: string;
  webkitTextFillColor?: string;
  backgroundClip?: string;

  // Allow additional properties
  [key: string]: string | number | undefined;
};

/**
 * Text style properties (legacy, for backward compatibility)
 */
export type TextStyle = Partial<{
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  textAlignHorizontal: string;
  textAlignVertical: string;
  lineHeightPx: number;
}>;

// ==================== Figma Types ====================

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

// ==================== Simplified Output Types ====================

/**
 * Fill type for simplified nodes
 */
export interface SimplifiedFill {
  type:
    | "SOLID"
    | "GRADIENT_LINEAR"
    | "GRADIENT_RADIAL"
    | "GRADIENT_ANGULAR"
    | "GRADIENT_DIAMOND"
    | "IMAGE";
  /** Hex color string */
  color?: string;
  /** RGBA color object */
  rgba?: {
    r: number;
    g: number;
    b: number;
    a: number;
  };
  opacity?: number;
  /** Gradient handle positions */
  gradientHandlePositions?: Array<{ x: number; y: number }>;
  /** Gradient color stops */
  gradientStops?: Array<{
    position: number;
    color: string;
  }>;
  /** Image reference ID */
  imageRef?: string;
}

/**
 * Simplified node structure
 * This is the main output type for the MCP response
 */
export interface SimplifiedNode {
  /** Node ID */
  id: string;
  /** Node name */
  name: string;
  /** Node type (FRAME, TEXT, VECTOR, etc.) */
  type: string;
  /** Text content (for TEXT nodes) */
  text?: string;
  /** Legacy text style (for backward compatibility) */
  style?: TextStyle;
  /** CSS styles */
  cssStyles?: CSSStyle;
  /** Fill information */
  fills?: SimplifiedFill[];
  /** Export information (for image nodes) */
  exportInfo?: ExportInfo;
  /** Child nodes */
  children?: SimplifiedNode[];
  /** Internal: absolute X coordinate */
  _absoluteX?: number;
  /** Internal: absolute Y coordinate */
  _absoluteY?: number;
}

/**
 * Simplified design output
 * Top-level structure returned by the MCP
 */
export interface SimplifiedDesign {
  /** Design file name */
  name: string;
  /** Last modified timestamp */
  lastModified: string;
  /** Thumbnail URL */
  thumbnailUrl: string;
  /** Root nodes */
  nodes: SimplifiedNode[];
}

// ==================== Algorithm Types ====================

/**
 * Icon detection result
 */
export interface IconDetectionResult {
  nodeId: string;
  nodeName: string;
  shouldMerge: boolean;
  exportFormat: "SVG" | "PNG";
  reason: string;
  size?: { width: number; height: number };
  childCount?: number;
}

/**
 * Icon detection configuration
 */
export interface IconDetectionConfig {
  /** Maximum icon size in pixels */
  maxIconSize: number;
  /** Minimum icon size in pixels */
  minIconSize: number;
  /** Minimum ratio of mergeable types */
  mergeableRatio: number;
  /** Maximum nesting depth */
  maxDepth: number;
  /** Maximum child count */
  maxChildren: number;
  /** Maximum size to respect exportSettings */
  respectExportSettingsMaxSize: number;
}

/**
 * Layout detection result
 */
export interface LayoutInfo {
  type: "flex" | "absolute" | "grid";
  direction?: "row" | "column";
  gap?: number;
  justifyContent?: string;
  alignItems?: string;
}

// ==================== Service Types ====================

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
