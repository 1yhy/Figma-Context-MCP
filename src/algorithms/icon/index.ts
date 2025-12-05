/**
 * Icon Detection Algorithm Module
 *
 * Exports the icon detection algorithm for identifying and merging
 * fragmented icon layers in Figma designs.
 *
 * @module algorithms/icon
 */

export {
  detectIcon,
  processNodeTree,
  collectExportableIcons,
  analyzeNodeTree,
  DEFAULT_CONFIG,
  type FigmaNode,
  type IconDetectionResult,
  type DetectionConfig,
} from "./detector.js";
