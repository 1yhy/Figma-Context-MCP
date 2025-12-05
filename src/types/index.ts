/**
 * Figma Context MCP - Type Definitions
 *
 * Central export point for all type definitions.
 * Types are organized into separate modules by domain.
 *
 * @module types
 */

// Figma API types
export type {
  FigmaNodeType,
  ImageResource,
  ExportFormat,
  ExportInfo,
  FigmaError,
  RateLimitInfo,
  FetchImageParams,
  FetchImageFillParams,
} from "./figma.js";

// Simplified output types
export type {
  CSSHexColor,
  CSSRGBAColor,
  CSSStyle,
  TextStyle,
  SimplifiedFill,
  SimplifiedNode,
  SimplifiedDesign,
  IconDetectionResult,
  IconDetectionConfig,
  LayoutInfo,
} from "./simplified.js";
