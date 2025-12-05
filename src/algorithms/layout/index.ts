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

// Layout optimizer
export { LayoutOptimizer } from "./optimizer.js";

// Layout detection algorithm
export {
  // Types
  type BoundingBox,
  type ElementRect,
  type LayoutGroup,
  type LayoutAnalysisResult,
  type LayoutNode,
  type GridAnalysisResult,
  type OverlapType,
  type OverlapDetectionResult,
  // Bounding box utilities
  extractBoundingBox,
  toElementRect,
  calculateBounds,
  // Overlap detection
  isOverlappingY,
  isOverlappingX,
  isFullyOverlapping,
  calculateIoU,
  classifyOverlap,
  detectOverlappingElements,
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
  // Grid detection
  clusterValues,
  detectGridLayout,
} from "./detector.js";
