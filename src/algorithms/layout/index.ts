/**
 * Layout Detection Algorithm Module
 *
 * Exports spatial analysis utilities for detecting layout patterns
 * in Figma designs, including row/column grouping and containment analysis.
 *
 * @module algorithms/layout
 */

// Spatial analysis utilities
export {
  RectUtils,
  SpatialProjectionAnalyzer,
  NodeRelationship,
  type Rect,
  type ProjectionLine,
} from "./spatial.js";

// Layout detection algorithm
export {
  // Types
  type BoundingBox,
  type ElementRect,
  type LayoutGroup,
  type LayoutAnalysisResult,
  type LayoutNode,
  // Bounding box utilities
  extractBoundingBox,
  toElementRect,
  calculateBounds,
  // Overlap detection
  isOverlappingY,
  isOverlappingX,
  isFullyOverlapping,
  // Grouping
  groupIntoRows,
  groupIntoColumns,
  findOverlappingElements,
  // Gap analysis
  calculateGaps,
  analyzeGaps,
  roundToCommonValue,
  // Alignment
  areValuesAligned,
  analyzeAlignment,
  toJustifyContent,
  toAlignItems,
  // Layout detection
  detectLayoutDirection,
  analyzeLayout,
  buildLayoutTree,
  generateLayoutReport,
} from "./detector.js";
