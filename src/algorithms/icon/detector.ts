/**
 * Icon Detection Algorithm
 *
 * Industry-based algorithm for detecting icons and mergeable layer groups.
 *
 * Core strategies:
 * 1. Prioritize Figma exportSettings (designer-marked exports)
 * 2. Smart detection: based on size, type ratio, structure depth
 * 3. Bottom-up merging: child icon groups merge first, then parent nodes
 *
 * @module algorithms/icon/detector
 */

import type { IconDetectionResult, IconDetectionConfig } from "~/types/index.js";

// Re-export types for module consumers
export type { IconDetectionResult };

// Use IconDetectionConfig from types, alias as DetectionConfig for internal use
export type DetectionConfig = IconDetectionConfig;

// ==================== Module-Specific Types ====================

/**
 * Figma node structure for icon detection (minimal interface)
 */
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  exportSettings?: Array<{
    format: string;
    suffix?: string;
    constraint?: {
      type: string;
      value: number;
    };
  }>;
  fills?: Array<{
    type: string;
    visible?: boolean;
    imageRef?: string;
    blendMode?: string;
  }>;
  effects?: Array<{
    type: string;
    visible?: boolean;
  }>;
  strokes?: Array<unknown>;
}

// ==================== Constants ====================

/** Default detection configuration */
export const DEFAULT_CONFIG: DetectionConfig = {
  maxIconSize: 300,
  minIconSize: 8,
  mergeableRatio: 0.6,
  maxDepth: 5,
  maxChildren: 100,
  respectExportSettingsMaxSize: 400,
};

/** Container node types */
const CONTAINER_TYPES = ["GROUP", "FRAME", "COMPONENT", "INSTANCE"] as const;

/** Mergeable graphics types (can be represented as SVG) */
const MERGEABLE_TYPES = [
  "VECTOR",
  "RECTANGLE",
  "ELLIPSE",
  "LINE",
  "POLYGON",
  "STAR",
  "BOOLEAN_OPERATION",
  "REGULAR_POLYGON",
] as const;

/** Single element types that should not be auto-exported (typically backgrounds) */
const SINGLE_ELEMENT_EXCLUDE_TYPES = ["RECTANGLE"] as const;

/** Types that exclude a group from being merged as icon */
const EXCLUDE_TYPES = ["TEXT", "COMPONENT", "INSTANCE"] as const;

/** Effects that require PNG export */
const PNG_REQUIRED_EFFECTS = [
  "DROP_SHADOW",
  "INNER_SHADOW",
  "LAYER_BLUR",
  "BACKGROUND_BLUR",
] as const;

// ==================== Helper Functions ====================

/**
 * Check if type is a container type
 */
function isContainerType(type: string): boolean {
  return CONTAINER_TYPES.includes(type as (typeof CONTAINER_TYPES)[number]);
}

/**
 * Check if type is mergeable (can be part of an icon)
 */
function isMergeableType(type: string): boolean {
  return MERGEABLE_TYPES.includes(type as (typeof MERGEABLE_TYPES)[number]);
}

/**
 * Check if type should be excluded from icon merging
 */
function isExcludeType(type: string): boolean {
  return EXCLUDE_TYPES.includes(type as (typeof EXCLUDE_TYPES)[number]);
}

/**
 * Get node dimensions
 */
function getNodeSize(node: FigmaNode): { width: number; height: number } | null {
  if (!node.absoluteBoundingBox) return null;
  return {
    width: node.absoluteBoundingBox.width,
    height: node.absoluteBoundingBox.height,
  };
}

/**
 * Check if node has image fill
 */
function hasImageFill(node: FigmaNode): boolean {
  if (!node.fills) return false;
  return node.fills.some(
    (fill) => fill.type === "IMAGE" && fill.visible !== false && fill.imageRef,
  );
}

/**
 * Check if node has complex effects (requires PNG)
 */
function hasComplexEffects(node: FigmaNode): boolean {
  if (!node.effects) return false;
  return node.effects.some(
    (effect) =>
      effect.visible !== false &&
      PNG_REQUIRED_EFFECTS.includes(effect.type as (typeof PNG_REQUIRED_EFFECTS)[number]),
  );
}

/**
 * Calculate maximum depth of node tree
 */
function calculateDepth(node: FigmaNode, currentDepth: number = 0): number {
  if (!node.children || node.children.length === 0) {
    return currentDepth;
  }
  return Math.max(...node.children.map((child) => calculateDepth(child, currentDepth + 1)));
}

/**
 * Count total number of descendants
 */
function countTotalChildren(node: FigmaNode): number {
  if (!node.children || node.children.length === 0) {
    return 0;
  }
  return node.children.reduce((sum, child) => sum + 1 + countTotalChildren(child), 0);
}

/**
 * Check if tree contains excluded types
 */
function hasExcludeTypeInTree(node: FigmaNode): boolean {
  if (isExcludeType(node.type)) {
    return true;
  }
  if (node.children) {
    return node.children.some((child) => hasExcludeTypeInTree(child));
  }
  return false;
}

/**
 * Check if tree contains image fills
 */
function hasImageFillInTree(node: FigmaNode): boolean {
  if (hasImageFill(node)) {
    return true;
  }
  if (node.children) {
    return node.children.some((child) => hasImageFillInTree(child));
  }
  return false;
}

/**
 * Check if tree contains complex effects
 */
function hasComplexEffectsInTree(node: FigmaNode): boolean {
  if (hasComplexEffects(node)) {
    return true;
  }
  if (node.children) {
    return node.children.some((child) => hasComplexEffectsInTree(child));
  }
  return false;
}

/**
 * Calculate ratio of mergeable types in direct children
 */
function calculateMergeableRatio(node: FigmaNode): number {
  if (!node.children || node.children.length === 0) {
    return isMergeableType(node.type) ? 1 : 0;
  }

  const total = node.children.length;
  const mergeable = node.children.filter(
    (child) => isMergeableType(child.type) || isContainerType(child.type),
  ).length;

  return mergeable / total;
}

/**
 * Check if all leaf nodes are mergeable types
 */
function areAllLeavesMergeable(node: FigmaNode): boolean {
  // Leaf node
  if (!node.children || node.children.length === 0) {
    return isMergeableType(node.type);
  }

  // Container: recursively check all children
  if (isContainerType(node.type)) {
    return node.children.every((child) => areAllLeavesMergeable(child));
  }

  // Other types
  return isMergeableType(node.type);
}

// ==================== Main Detection Functions ====================

/**
 * Detect if a single node should be exported as an icon
 *
 * @param node - Figma node to analyze
 * @param config - Detection configuration
 * @returns Detection result with export recommendation
 */
export function detectIcon(
  node: FigmaNode,
  config: DetectionConfig = DEFAULT_CONFIG,
): IconDetectionResult {
  const result: IconDetectionResult = {
    nodeId: node.id,
    nodeName: node.name,
    shouldMerge: false,
    exportFormat: "SVG",
    reason: "",
  };

  // 1. Check Figma exportSettings (with size restrictions)
  if (node.exportSettings && node.exportSettings.length > 0) {
    const size = getNodeSize(node);
    const isSmallEnough =
      !size ||
      (size.width <= config.respectExportSettingsMaxSize &&
        size.height <= config.respectExportSettingsMaxSize);

    // Containers with TEXT should not be exported as images
    const containsText = hasExcludeTypeInTree(node);

    if (isSmallEnough && !containsText) {
      const exportSetting = node.exportSettings[0];
      result.shouldMerge = true;
      result.exportFormat = exportSetting.format === "SVG" ? "SVG" : "PNG";
      result.reason = `Designer marked export as ${exportSetting.format}`;
      result.size = size || undefined;
      return result;
    }
    // Large nodes or nodes with TEXT: ignore exportSettings, continue detection
  }

  // 2. Must be container type or mergeable single element
  if (!isContainerType(node.type)) {
    // Single mergeable type node
    if (isMergeableType(node.type)) {
      // Single RECTANGLE is typically a background, not exported
      if (
        SINGLE_ELEMENT_EXCLUDE_TYPES.includes(
          node.type as (typeof SINGLE_ELEMENT_EXCLUDE_TYPES)[number],
        )
      ) {
        result.reason = `Single ${node.type} is typically a background, not exported`;
        return result;
      }

      // Check size for single elements
      const size = getNodeSize(node);
      if (size) {
        result.size = size;
        if (size.width > config.maxIconSize || size.height > config.maxIconSize) {
          result.reason = `Single element too large (${Math.round(size.width)}x${Math.round(size.height)} > ${config.maxIconSize})`;
          return result;
        }
      }
      result.shouldMerge = true;
      result.exportFormat = hasComplexEffects(node) ? "PNG" : "SVG";
      result.reason = "Single vector/shape element";
      return result;
    }
    result.reason = "Not a container or mergeable type";
    return result;
  }

  // 3. Check size
  const size = getNodeSize(node);
  if (size) {
    result.size = size;

    // Too large: likely a layout container
    if (size.width > config.maxIconSize || size.height > config.maxIconSize) {
      result.reason = `Size too large (${size.width}x${size.height} > ${config.maxIconSize})`;
      return result;
    }

    // Too small
    if (size.width < config.minIconSize && size.height < config.minIconSize) {
      result.reason = `Size too small (${size.width}x${size.height} < ${config.minIconSize})`;
      return result;
    }
  }

  // 4. Check for excluded types (TEXT, etc.)
  if (hasExcludeTypeInTree(node)) {
    result.reason = "Contains TEXT or other exclude types";
    return result;
  }

  // 5. Check structure depth
  const depth = calculateDepth(node);
  if (depth > config.maxDepth) {
    result.reason = `Depth too deep (${depth} > ${config.maxDepth})`;
    return result;
  }

  // 6. Check child count
  const childCount = countTotalChildren(node);
  result.childCount = childCount;
  if (childCount > config.maxChildren) {
    result.reason = `Too many children (${childCount} > ${config.maxChildren})`;
    return result;
  }

  // 7. Check mergeable type ratio
  const mergeableRatio = calculateMergeableRatio(node);
  if (mergeableRatio < config.mergeableRatio) {
    result.reason = `Mergeable ratio too low (${(mergeableRatio * 100).toFixed(1)}% < ${config.mergeableRatio * 100}%)`;
    return result;
  }

  // 8. Check if all leaf nodes are mergeable
  if (!areAllLeavesMergeable(node)) {
    result.reason = "Not all leaf nodes are mergeable types";
    return result;
  }

  // 9. Determine export format
  if (hasImageFillInTree(node)) {
    result.exportFormat = "PNG";
    result.reason = "Contains image fills, export as PNG";
  } else if (hasComplexEffectsInTree(node)) {
    result.exportFormat = "PNG";
    result.reason = "Contains complex effects, export as PNG";
  } else {
    result.exportFormat = "SVG";
    result.reason = "All vector elements, export as SVG";
  }

  result.shouldMerge = true;
  return result;
}

/**
 * Process node tree bottom-up, detecting and marking icons
 *
 * @param node - Root node
 * @param config - Detection configuration
 * @returns Processed node with _iconDetection markers
 */
export function processNodeTree(
  node: FigmaNode,
  config: DetectionConfig = DEFAULT_CONFIG,
): FigmaNode & { _iconDetection?: IconDetectionResult } {
  const processedNode = { ...node } as FigmaNode & { _iconDetection?: IconDetectionResult };

  // Process children first (bottom-up)
  if (node.children && node.children.length > 0) {
    processedNode.children = node.children.map((child) => processNodeTree(child, config));

    // Check if all children are marked as icons (can be merged to parent)
    const allChildrenAreIcons = processedNode.children.every((child) => {
      const childWithDetection = child as FigmaNode & { _iconDetection?: IconDetectionResult };
      return childWithDetection._iconDetection?.shouldMerge;
    });

    // If all children are icons, try to merge to current node
    if (allChildrenAreIcons) {
      const detection = detectIcon(processedNode, config);
      if (detection.shouldMerge) {
        processedNode._iconDetection = detection;
        // Clear child markers since they will be merged
        processedNode.children.forEach((child) => {
          delete (child as FigmaNode & { _iconDetection?: IconDetectionResult })._iconDetection;
        });
        return processedNode;
      }
    }
  }

  // Detect current node
  const detection = detectIcon(processedNode, config);
  if (detection.shouldMerge) {
    processedNode._iconDetection = detection;
  }

  return processedNode;
}

/**
 * Collect all exportable icons from processed node tree
 *
 * @param node - Processed node with _iconDetection markers
 * @returns Array of icon detection results
 */
export function collectExportableIcons(
  node: FigmaNode & { _iconDetection?: IconDetectionResult },
): IconDetectionResult[] {
  const results: IconDetectionResult[] = [];

  // If current node is an icon, add to results
  if (node._iconDetection?.shouldMerge) {
    results.push(node._iconDetection);
    // Don't recurse into children (they will be merged)
    return results;
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      results.push(
        ...collectExportableIcons(child as FigmaNode & { _iconDetection?: IconDetectionResult }),
      );
    }
  }

  return results;
}

/**
 * Analyze node tree and return icon detection report
 *
 * @param node - Root Figma node
 * @param config - Detection configuration
 * @returns Analysis result with processed tree, exportable icons, and summary
 */
export function analyzeNodeTree(
  node: FigmaNode,
  config: DetectionConfig = DEFAULT_CONFIG,
): {
  processedTree: FigmaNode & { _iconDetection?: IconDetectionResult };
  exportableIcons: IconDetectionResult[];
  summary: {
    totalIcons: number;
    svgCount: number;
    pngCount: number;
  };
} {
  const processedTree = processNodeTree(node, config);
  const exportableIcons = collectExportableIcons(processedTree);

  const summary = {
    totalIcons: exportableIcons.length,
    svgCount: exportableIcons.filter((i) => i.exportFormat === "SVG").length,
    pngCount: exportableIcons.filter((i) => i.exportFormat === "PNG").length,
  };

  return { processedTree, exportableIcons, summary };
}
