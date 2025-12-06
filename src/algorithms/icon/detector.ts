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

// ==================== Optimized Single-Pass Stats Collection ====================

/**
 * Statistics collected from a node tree in a single traversal
 * This replaces multiple recursive functions with one unified pass
 */
interface NodeTreeStats {
  /** Maximum depth of the tree */
  depth: number;
  /** Total number of descendants (not including root) */
  totalChildren: number;
  /** Whether tree contains excluded types (TEXT, COMPONENT, INSTANCE) */
  hasExcludeType: boolean;
  /** Whether tree contains image fills */
  hasImageFill: boolean;
  /** Whether tree contains complex effects requiring PNG */
  hasComplexEffects: boolean;
  /** Whether all leaf nodes are mergeable types */
  allLeavesMergeable: boolean;
  /** Ratio of mergeable types in direct children */
  mergeableRatio: number;
}

/**
 * Collect all tree statistics in a single traversal
 *
 * OPTIMIZATION: This replaces 6 separate recursive functions:
 * - calculateDepth()
 * - countTotalChildren()
 * - hasExcludeTypeInTree()
 * - hasImageFillInTree()
 * - hasComplexEffectsInTree()
 * - areAllLeavesMergeable()
 *
 * Before: O(6n) - each function traverses entire tree
 * After: O(n) - single traversal collects all data
 *
 * @param node - Node to analyze
 * @returns Collected statistics
 */
function collectNodeStats(node: FigmaNode): NodeTreeStats {
  // Base case: leaf node (no children)
  if (!node.children || node.children.length === 0) {
    const isMergeable = isMergeableType(node.type);
    return {
      depth: 0,
      totalChildren: 0,
      hasExcludeType: isExcludeType(node.type),
      hasImageFill: hasImageFill(node),
      hasComplexEffects: hasComplexEffects(node),
      allLeavesMergeable: isMergeable,
      mergeableRatio: isMergeable ? 1 : 0,
    };
  }

  // Recursive case: collect stats from all children
  const childStats = node.children.map(collectNodeStats);

  // Aggregate child statistics
  const maxChildDepth = Math.max(...childStats.map((s) => s.depth));
  const totalDescendants = childStats.reduce((sum, s) => sum + 1 + s.totalChildren, 0);
  const hasExcludeInChildren = childStats.some((s) => s.hasExcludeType);
  const hasImageInChildren = childStats.some((s) => s.hasImageFill);
  const hasEffectsInChildren = childStats.some((s) => s.hasComplexEffects);
  const allChildrenMergeable = childStats.every((s) => s.allLeavesMergeable);

  // Calculate mergeable ratio for direct children
  const mergeableCount = node.children.filter(
    (child) => isMergeableType(child.type) || isContainerType(child.type),
  ).length;
  const mergeableRatio = mergeableCount / node.children.length;

  // Determine if all leaves are mergeable
  // For containers: all children must have all leaves mergeable
  // For other types: check if this type itself is mergeable
  const allLeavesMergeable = isContainerType(node.type)
    ? allChildrenMergeable
    : isMergeableType(node.type);

  return {
    depth: maxChildDepth + 1,
    totalChildren: totalDescendants,
    hasExcludeType: isExcludeType(node.type) || hasExcludeInChildren,
    hasImageFill: hasImageFill(node) || hasImageInChildren,
    hasComplexEffects: hasComplexEffects(node) || hasEffectsInChildren,
    allLeavesMergeable,
    mergeableRatio,
  };
}

// ==================== Main Detection Functions ====================

/**
 * Detect if a single node should be exported as an icon
 *
 * OPTIMIZED: Uses single-pass collectNodeStats() instead of multiple recursive functions
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

  // Get node size once
  const size = getNodeSize(node);
  if (size) {
    result.size = size;
  }

  // 1. Check Figma exportSettings (with size restrictions)
  if (node.exportSettings && node.exportSettings.length > 0) {
    const isSmallEnough =
      !size ||
      (size.width <= config.respectExportSettingsMaxSize &&
        size.height <= config.respectExportSettingsMaxSize);

    // For exportSettings, we need to check for excluded types
    // Use optimized single-pass collection
    const stats = collectNodeStats(node);
    const containsText = stats.hasExcludeType;

    if (isSmallEnough && !containsText) {
      const exportSetting = node.exportSettings[0];
      result.shouldMerge = true;
      result.exportFormat = exportSetting.format === "SVG" ? "SVG" : "PNG";
      result.reason = `Designer marked export as ${exportSetting.format}`;
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
      if (size) {
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
  if (size) {
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

  // OPTIMIZATION: Collect all tree statistics in a single pass
  // This replaces 6 separate recursive traversals with 1
  const stats = collectNodeStats(node);

  // 4. Check for excluded types (TEXT, etc.)
  if (stats.hasExcludeType) {
    result.reason = "Contains TEXT or other exclude types";
    return result;
  }

  // 5. Check structure depth
  if (stats.depth > config.maxDepth) {
    result.reason = `Depth too deep (${stats.depth} > ${config.maxDepth})`;
    return result;
  }

  // 6. Check child count
  result.childCount = stats.totalChildren;
  if (stats.totalChildren > config.maxChildren) {
    result.reason = `Too many children (${stats.totalChildren} > ${config.maxChildren})`;
    return result;
  }

  // 7. Check mergeable type ratio
  if (stats.mergeableRatio < config.mergeableRatio) {
    result.reason = `Mergeable ratio too low (${(stats.mergeableRatio * 100).toFixed(1)}% < ${config.mergeableRatio * 100}%)`;
    return result;
  }

  // 8. Check if all leaf nodes are mergeable
  if (!stats.allLeavesMergeable) {
    result.reason = "Not all leaf nodes are mergeable types";
    return result;
  }

  // 9. Determine export format (using stats collected in single pass)
  if (stats.hasImageFill) {
    result.exportFormat = "PNG";
    result.reason = "Contains image fills, export as PNG";
  } else if (stats.hasComplexEffects) {
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
