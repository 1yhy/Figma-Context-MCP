/**
 * Simplified Node Response Service
 *
 * This module re-exports the core parser functionality for backward compatibility.
 * The actual parsing logic has been moved to ~/core/parser.ts.
 *
 * @module services/simplify-node-response
 */

// Re-export parser function
export { parseFigmaResponse } from "~/core/parser.js";

// Re-export types for backward compatibility
export type {
  CSSStyle,
  TextStyle,
  SimplifiedDesign,
  SimplifiedNode,
  SimplifiedFill,
  ExportInfo,
  ImageResource,
  FigmaNodeType,
} from "~/types/index.js";
