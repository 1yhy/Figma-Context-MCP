/**
 * Layout Detection Algorithm
 *
 * Infers Flex layout from absolutely positioned design elements.
 *
 * Core algorithm flow:
 * 1. Extract element bounding boxes
 * 2. Group by Y-axis overlap into "rows"
 * 3. Group by X-axis overlap into "columns"
 * 4. Analyze gap consistency
 * 5. Detect alignment
 * 6. Recursively build layout tree
 *
 * @module algorithms/layout/detector
 */

// ==================== Type Definitions ====================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementRect extends BoundingBox {
  index: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export interface LayoutGroup {
  elements: ElementRect[];
  direction: "row" | "column" | "none";
  gap: number;
  isGapConsistent: boolean;
  justifyContent: string;
  alignItems: string;
  bounds: BoundingBox;
}

export interface LayoutAnalysisResult {
  direction: "row" | "column" | "none";
  confidence: number;
  gap: number;
  isGapConsistent: boolean;
  justifyContent: string;
  alignItems: string;
  rows: ElementRect[][];
  columns: ElementRect[][];
  overlappingElements: ElementRect[];
}

// ==================== Bounding Box Utilities ====================

/**
 * Extract bounding box from CSS styles object
 */
export function extractBoundingBox(cssStyles: Record<string, unknown>): BoundingBox | null {
  if (!cssStyles) return null;

  const x = parseFloat(String(cssStyles.left || "0").replace("px", ""));
  const y = parseFloat(String(cssStyles.top || "0").replace("px", ""));
  const width = parseFloat(String(cssStyles.width || "0").replace("px", ""));
  const height = parseFloat(String(cssStyles.height || "0").replace("px", ""));

  if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
    return null;
  }

  return { x, y, width, height };
}

/**
 * Convert bounding box to element rect (with computed properties)
 */
export function toElementRect(box: BoundingBox, index: number): ElementRect {
  return {
    ...box,
    index,
    right: box.x + box.width,
    bottom: box.y + box.height,
    centerX: box.x + box.width / 2,
    centerY: box.y + box.height / 2,
  };
}

/**
 * Calculate bounding rect of a group of elements
 */
export function calculateBounds(rects: ElementRect[]): BoundingBox {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.right));
  const maxY = Math.max(...rects.map((r) => r.bottom));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// ==================== Overlap Detection ====================

/**
 * Check if two elements overlap on Y-axis (for row detection)
 * If two elements have overlapping vertical ranges, they are in the same row
 */
export function isOverlappingY(a: ElementRect, b: ElementRect, tolerance: number = 0): boolean {
  return !(a.bottom + tolerance < b.y || b.bottom + tolerance < a.y);
}

/**
 * Check if two elements overlap on X-axis (for column detection)
 * If two elements have overlapping horizontal ranges, they are in the same column
 */
export function isOverlappingX(a: ElementRect, b: ElementRect, tolerance: number = 0): boolean {
  return !(a.right + tolerance < b.x || b.right + tolerance < a.x);
}

/**
 * Check if two elements fully overlap (requires absolute positioning)
 */
export function isFullyOverlapping(
  a: ElementRect,
  b: ElementRect,
  threshold: number = 0.5,
): boolean {
  const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  const overlapArea = overlapX * overlapY;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const minArea = Math.min(areaA, areaB);

  return minArea > 0 && overlapArea / minArea > threshold;
}

/**
 * Calculate IoU (Intersection over Union) between two elements
 *
 * IoU is a standard metric for measuring overlap:
 * - IoU = 0: No overlap
 * - IoU = 1: Perfect overlap (same box)
 *
 * Industry standard thresholds:
 * - IoU > 0.1: Partial overlap (consider absolute positioning)
 * - IoU > 0.5: Significant overlap (definitely needs absolute)
 */
export function calculateIoU(a: ElementRect, b: ElementRect): number {
  // Calculate intersection
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  const intersection = xOverlap * yOverlap;

  if (intersection === 0) return 0;

  // Calculate union
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Overlap type classification based on IoU
 */
export type OverlapType = "none" | "adjacent" | "partial" | "significant" | "contained";

/**
 * Classify overlap type between two elements
 *
 * @param a First element
 * @param b Second element
 * @returns Overlap classification
 */
export function classifyOverlap(a: ElementRect, b: ElementRect): OverlapType {
  const iou = calculateIoU(a, b);

  if (iou === 0) {
    // Check if adjacent (touching but not overlapping)
    // Calculate gap on each axis
    const gapX = Math.max(a.x, b.x) - Math.min(a.right, b.right);
    const gapY = Math.max(a.y, b.y) - Math.min(a.bottom, b.bottom);

    // Elements are adjacent only if gap on the separating axis is small
    // If they overlap on one axis (gap < 0), check gap on the other axis
    let effectiveGap: number;
    if (gapX > 0 && gapY > 0) {
      // Don't overlap on either axis - use the maximum gap (corner distance)
      effectiveGap = Math.max(gapX, gapY);
    } else if (gapX > 0) {
      // Don't overlap on X, but overlap on Y
      effectiveGap = gapX;
    } else if (gapY > 0) {
      // Don't overlap on Y, but overlap on X
      effectiveGap = gapY;
    } else {
      // This shouldn't happen if IoU is 0, but handle it
      effectiveGap = 0;
    }

    return effectiveGap <= 2 ? "adjacent" : "none";
  }

  if (iou < 0.1) return "partial";
  if (iou < 0.5) return "significant";
  return "contained";
}

/**
 * Overlap detection result
 */
export interface OverlapDetectionResult {
  /** Elements that can participate in flow layout (flex/grid) */
  flowElements: ElementRect[];
  /** Elements that need absolute positioning due to overlap */
  stackedElements: ElementRect[];
  /** Indices of stacked elements */
  stackedIndices: Set<number>;
}

/**
 * Detect overlapping elements and separate them from flow elements
 *
 * Uses IoU (Intersection over Union) to detect overlaps:
 * - IoU > 0.1: Element is considered overlapping and needs absolute positioning
 *
 * This follows the imgcook algorithm approach where overlapping elements
 * are marked for absolute positioning while the rest participate in flex/grid layout.
 *
 * @param rects Element rectangles to analyze
 * @param iouThreshold IoU threshold for overlap detection (default: 0.1)
 * @returns Separated flow and stacked elements
 */
export function detectOverlappingElements(
  rects: ElementRect[],
  iouThreshold: number = 0.1,
): OverlapDetectionResult {
  const stackedIndices = new Set<number>();

  // Check each pair of elements for overlap
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const iou = calculateIoU(rects[i], rects[j]);
      if (iou > iouThreshold) {
        // Both overlapping elements need absolute positioning
        stackedIndices.add(rects[i].index);
        stackedIndices.add(rects[j].index);
      }
    }
  }

  // Separate elements into flow and stacked groups
  const flowElements: ElementRect[] = [];
  const stackedElements: ElementRect[] = [];

  for (const rect of rects) {
    if (stackedIndices.has(rect.index)) {
      stackedElements.push(rect);
    } else {
      flowElements.push(rect);
    }
  }

  return {
    flowElements,
    stackedElements,
    stackedIndices,
  };
}

/**
 * Background element detection result
 */
export interface BackgroundDetectionResult {
  /** Index of background element (or -1 if none) */
  backgroundIndex: number;
  /** Indices of content elements */
  contentIndices: number[];
  /** Whether a valid background was detected */
  hasBackground: boolean;
}

/**
 * Detect if a container has a background element pattern
 *
 * Background element pattern:
 * - Element at position 0,0 (or very close)
 * - Same size as parent container (or very close)
 * - Typically a RECTANGLE type
 * - Other elements are positioned on top of it
 *
 * @param rects All child element rectangles
 * @param parentWidth Parent container width
 * @param parentHeight Parent container height
 * @returns Background detection result
 */
export function detectBackgroundElement(
  rects: ElementRect[],
  parentWidth: number,
  parentHeight: number,
): BackgroundDetectionResult {
  const emptyResult: BackgroundDetectionResult = {
    backgroundIndex: -1,
    contentIndices: rects.map((r) => r.index),
    hasBackground: false,
  };

  if (rects.length < 2) return emptyResult;

  // Find element at origin that matches parent size
  for (const rect of rects) {
    // Must be at origin (within 2px tolerance)
    if (rect.x > 2 || rect.y > 2) continue;

    // Must match parent size (within 5% tolerance)
    const widthMatch = Math.abs(rect.width - parentWidth) / parentWidth < 0.05;
    const heightMatch = Math.abs(rect.height - parentHeight) / parentHeight < 0.05;

    if (widthMatch && heightMatch) {
      // Found background element
      const contentIndices = rects.filter((r) => r.index !== rect.index).map((r) => r.index);

      return {
        backgroundIndex: rect.index,
        contentIndices,
        hasBackground: true,
      };
    }
  }

  return emptyResult;
}

// ==================== Row/Column Grouping Algorithm ====================

/**
 * Group elements by Y-axis overlap into "rows"
 * Core algorithm: if two elements overlap on Y-axis, they belong to the same row
 */
export function groupIntoRows(rects: ElementRect[], tolerance: number = 2): ElementRect[][] {
  if (rects.length === 0) return [];
  if (rects.length === 1) return [[rects[0]]];

  // Sort by Y coordinate
  const sorted = [...rects].sort((a, b) => a.y - b.y);

  const rows: ElementRect[][] = [];
  let currentRow: ElementRect[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const elem = sorted[i];

    // Check if overlaps with any element in current row on Y-axis
    const overlapsWithRow = currentRow.some((rowElem) => isOverlappingY(rowElem, elem, tolerance));

    if (overlapsWithRow) {
      currentRow.push(elem);
    } else {
      // Current row complete, sort by X and save
      rows.push(currentRow.sort((a, b) => a.x - b.x));
      currentRow = [elem];
    }
  }

  // Save last row
  if (currentRow.length > 0) {
    rows.push(currentRow.sort((a, b) => a.x - b.x));
  }

  return rows;
}

/**
 * Group elements by X-axis overlap into "columns"
 * Core algorithm: if two elements overlap on X-axis, they belong to the same column
 */
export function groupIntoColumns(rects: ElementRect[], tolerance: number = 2): ElementRect[][] {
  if (rects.length === 0) return [];
  if (rects.length === 1) return [[rects[0]]];

  // Sort by X coordinate
  const sorted = [...rects].sort((a, b) => a.x - b.x);

  const columns: ElementRect[][] = [];
  let currentColumn: ElementRect[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const elem = sorted[i];

    // Check if overlaps with any element in current column on X-axis
    const overlapsWithColumn = currentColumn.some((colElem) =>
      isOverlappingX(colElem, elem, tolerance),
    );

    if (overlapsWithColumn) {
      currentColumn.push(elem);
    } else {
      // Current column complete, sort by Y and save
      columns.push(currentColumn.sort((a, b) => a.y - b.y));
      currentColumn = [elem];
    }
  }

  // Save last column
  if (currentColumn.length > 0) {
    columns.push(currentColumn.sort((a, b) => a.y - b.y));
  }

  return columns;
}

/**
 * Find fully overlapping elements (requires absolute positioning)
 */
export function findOverlappingElements(rects: ElementRect[]): ElementRect[] {
  const overlapping: Set<number> = new Set();

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (isFullyOverlapping(rects[i], rects[j])) {
        overlapping.add(rects[i].index);
        overlapping.add(rects[j].index);
      }
    }
  }

  return rects.filter((r) => overlapping.has(r.index));
}

// ==================== Gap Analysis ====================

/**
 * Calculate gaps between a group of elements
 */
export function calculateGaps(
  rects: ElementRect[],
  direction: "horizontal" | "vertical",
): number[] {
  if (rects.length < 2) return [];

  const sorted =
    direction === "horizontal"
      ? [...rects].sort((a, b) => a.x - b.x)
      : [...rects].sort((a, b) => a.y - b.y);

  const gaps: number[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    const gap = direction === "horizontal" ? next.x - current.right : next.y - current.bottom;

    // Only record positive gaps
    if (gap >= 0) {
      gaps.push(gap);
    }
  }

  return gaps;
}

/**
 * Analyze gap consistency
 */
export function analyzeGaps(
  gaps: number[],
  tolerancePercent: number = 20,
): {
  isConsistent: boolean;
  average: number;
  rounded: number;
  stdDev: number;
} {
  if (gaps.length === 0) {
    return { isConsistent: true, average: 0, rounded: 0, stdDev: 0 };
  }

  if (gaps.length === 1) {
    const rounded = roundToCommonValue(gaps[0]);
    return { isConsistent: true, average: gaps[0], rounded, stdDev: 0 };
  }

  const sum = gaps.reduce((a, b) => a + b, 0);
  const average = sum / gaps.length;

  const variance = gaps.reduce((acc, gap) => acc + Math.pow(gap - average, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);

  // Consistency check: standard deviation less than specified percentage of average
  const tolerance = average * (tolerancePercent / 100);
  const isConsistent = average === 0 || stdDev <= tolerance;

  const rounded = roundToCommonValue(average);

  return { isConsistent, average, rounded, stdDev };
}

/**
 * Round gap to common design values
 */
export function roundToCommonValue(value: number): number {
  const COMMON_VALUES = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128];

  // Find closest common value
  let closest = COMMON_VALUES[0];
  let minDiff = Math.abs(value - closest);

  for (const common of COMMON_VALUES) {
    const diff = Math.abs(value - common);
    if (diff < minDiff) {
      minDiff = diff;
      closest = common;
    }
  }

  // If difference is too large (> 4px), use rounded value
  if (minDiff > 4) {
    return Math.round(value);
  }

  return closest;
}

// ==================== Alignment Detection ====================

/**
 * Check if a group of values are aligned
 */
export function areValuesAligned(values: number[], tolerance: number = 3): boolean {
  if (values.length < 2) return true;

  const first = values[0];
  return values.every((v) => Math.abs(v - first) <= tolerance);
}

/**
 * Analyze alignment
 */
export function analyzeAlignment(
  rects: ElementRect[],
  bounds: BoundingBox,
): {
  horizontal: "left" | "center" | "right" | "stretch" | "none";
  vertical: "top" | "center" | "bottom" | "stretch" | "none";
} {
  if (rects.length === 0) {
    return { horizontal: "none", vertical: "none" };
  }

  const tolerance = Math.max(3, Math.min(bounds.width, bounds.height) * 0.02);

  // Horizontal alignment analysis
  const lefts = rects.map((r) => r.x);
  const rights = rects.map((r) => r.right);
  const centerXs = rects.map((r) => r.centerX);
  const widths = rects.map((r) => r.width);

  let horizontal: "left" | "center" | "right" | "stretch" | "none" = "none";

  if (areValuesAligned(lefts, tolerance)) {
    horizontal = "left";
  } else if (areValuesAligned(rights, tolerance)) {
    horizontal = "right";
  } else if (areValuesAligned(centerXs, tolerance)) {
    horizontal = "center";
  } else if (areValuesAligned(widths, tolerance) && widths[0] >= bounds.width * 0.9) {
    horizontal = "stretch";
  }

  // Vertical alignment analysis
  const tops = rects.map((r) => r.y);
  const bottoms = rects.map((r) => r.bottom);
  const centerYs = rects.map((r) => r.centerY);
  const heights = rects.map((r) => r.height);

  let vertical: "top" | "center" | "bottom" | "stretch" | "none" = "none";

  if (areValuesAligned(tops, tolerance)) {
    vertical = "top";
  } else if (areValuesAligned(bottoms, tolerance)) {
    vertical = "bottom";
  } else if (areValuesAligned(centerYs, tolerance)) {
    vertical = "center";
  } else if (areValuesAligned(heights, tolerance) && heights[0] >= bounds.height * 0.9) {
    vertical = "stretch";
  }

  return { horizontal, vertical };
}

/**
 * Convert alignment to CSS justify-content value
 */
export function toJustifyContent(alignment: string, hasGaps: boolean): string {
  switch (alignment) {
    case "left":
    case "top":
      return "flex-start";
    case "right":
    case "bottom":
      return "flex-end";
    case "center":
      return "center";
    case "stretch":
      return hasGaps ? "space-between" : "flex-start";
    default:
      return "flex-start";
  }
}

/**
 * Convert alignment to CSS align-items value
 */
export function toAlignItems(alignment: string): string {
  switch (alignment) {
    case "left":
    case "top":
      return "flex-start";
    case "right":
    case "bottom":
      return "flex-end";
    case "center":
      return "center";
    case "stretch":
      return "stretch";
    default:
      return "stretch";
  }
}

// ==================== Layout Direction Detection ====================

/**
 * Detect optimal layout direction
 * Core logic: compare quality of row grouping vs column grouping
 */
export function detectLayoutDirection(rects: ElementRect[]): {
  direction: "row" | "column" | "none";
  confidence: number;
  reason: string;
} {
  if (rects.length < 2) {
    return { direction: "none", confidence: 0, reason: "Insufficient elements" };
  }

  const rows = groupIntoRows(rects);
  const columns = groupIntoColumns(rects);

  // Calculate row layout score
  const rowScore = calculateLayoutScore(rows, "row", rects.length);

  // Calculate column layout score
  const columnScore = calculateLayoutScore(columns, "column", rects.length);

  // Select layout with higher score
  if (rowScore.score > columnScore.score && rowScore.score > 0.3) {
    return {
      direction: "row",
      confidence: rowScore.score,
      reason: rowScore.reason,
    };
  } else if (columnScore.score > rowScore.score && columnScore.score > 0.3) {
    return {
      direction: "column",
      confidence: columnScore.score,
      reason: columnScore.reason,
    };
  }

  return { direction: "none", confidence: 0, reason: "No clear layout pattern" };
}

/**
 * Calculate layout score
 */
function calculateLayoutScore(
  groups: ElementRect[][],
  direction: "row" | "column",
  totalElements: number,
): { score: number; reason: string } {
  if (groups.length === 0) {
    return { score: 0, reason: "No groups" };
  }

  // Score factors:
  // 1. Group count rationality (ideal: one or few groups per row/column)
  // 2. Gap consistency within each group
  // 3. Element coverage

  let score = 0;
  const reasons: string[] = [];

  // 1. For row layout, ideal is single row (all elements horizontal)
  //    For column layout, ideal is single column (all elements vertical)
  if (groups.length === 1 && groups[0].length === totalElements) {
    score += 0.4;
    reasons.push("Perfect grouping");
  } else if (groups.length <= 3) {
    score += 0.2;
    reasons.push("Reasonable grouping");
  }

  // 2. Analyze gap consistency
  for (const group of groups) {
    if (group.length >= 2) {
      const gapDirection = direction === "row" ? "horizontal" : "vertical";
      const gaps = calculateGaps(group, gapDirection);
      const gapAnalysis = analyzeGaps(gaps);

      if (gapAnalysis.isConsistent && gaps.length > 0) {
        score += 0.3 / groups.length;
        reasons.push(`Consistent gap (${Math.round(gapAnalysis.average)}px)`);
      }
    }
  }

  // 3. Check cross-axis alignment
  for (const group of groups) {
    if (group.length >= 2) {
      const bounds = calculateBounds(group);
      const alignment = analyzeAlignment(group, bounds);
      const crossAlignment = direction === "row" ? alignment.vertical : alignment.horizontal;

      if (crossAlignment !== "none") {
        score += 0.2 / groups.length;
        reasons.push(`Good alignment (${crossAlignment})`);
      }
    }
  }

  // 4. Check main axis element distribution
  const largestGroup = groups.reduce((a, b) => (a.length > b.length ? a : b));
  if (largestGroup.length >= totalElements * 0.7) {
    score += 0.1;
    reasons.push("Concentrated distribution");
  }

  return {
    score: Math.min(1, score),
    reason: reasons.join(", ") || "No obvious features",
  };
}

// ==================== Complete Layout Analysis ====================

/**
 * Complete layout analysis
 * Returns layout direction, gap, alignment, and all other information
 */
export function analyzeLayout(rects: ElementRect[]): LayoutAnalysisResult {
  if (rects.length < 2) {
    return {
      direction: "none",
      confidence: 0,
      gap: 0,
      isGapConsistent: true,
      justifyContent: "flex-start",
      alignItems: "stretch",
      rows: [rects],
      columns: [rects],
      overlappingElements: [],
    };
  }

  // Detect overlapping elements
  const overlappingElements = findOverlappingElements(rects);

  // Analyze layout after filtering out overlapping elements
  const nonOverlapping = rects.filter((r) => !overlappingElements.some((o) => o.index === r.index));

  if (nonOverlapping.length < 2) {
    return {
      direction: "none",
      confidence: 0,
      gap: 0,
      isGapConsistent: true,
      justifyContent: "flex-start",
      alignItems: "stretch",
      rows: [rects],
      columns: [rects],
      overlappingElements,
    };
  }

  // Detect layout direction
  const { direction, confidence } = detectLayoutDirection(nonOverlapping);

  // Grouping
  const rows = groupIntoRows(nonOverlapping);
  const columns = groupIntoColumns(nonOverlapping);

  // Calculate gaps
  const gapDirection = direction === "row" ? "horizontal" : "vertical";
  const gaps = calculateGaps(
    direction === "row"
      ? nonOverlapping.sort((a, b) => a.x - b.x)
      : nonOverlapping.sort((a, b) => a.y - b.y),
    gapDirection,
  );
  const gapAnalysis = analyzeGaps(gaps);

  // Analyze alignment
  const bounds = calculateBounds(nonOverlapping);
  const alignment = analyzeAlignment(nonOverlapping, bounds);

  // Determine CSS properties
  let justifyContent: string;
  let alignItems: string;

  if (direction === "row") {
    justifyContent = toJustifyContent(alignment.horizontal, gaps.length > 0);
    alignItems = toAlignItems(alignment.vertical);
  } else if (direction === "column") {
    justifyContent = toJustifyContent(alignment.vertical, gaps.length > 0);
    alignItems = toAlignItems(alignment.horizontal);
  } else {
    justifyContent = "flex-start";
    alignItems = "stretch";
  }

  return {
    direction,
    confidence,
    gap: gapAnalysis.rounded,
    isGapConsistent: gapAnalysis.isConsistent,
    justifyContent,
    alignItems,
    rows,
    columns,
    overlappingElements,
  };
}

// ==================== Recursive Layout Tree Building ====================

export interface LayoutNode {
  type: "container" | "element";
  direction?: "row" | "column";
  gap?: number;
  justifyContent?: string;
  alignItems?: string;
  children?: LayoutNode[];
  elementIndex?: number;
  bounds: BoundingBox;
  needsAbsolute?: boolean;
}

/**
 * Recursively build layout tree
 * Convert flat element list to nested layout structure
 */
export function buildLayoutTree(
  rects: ElementRect[],
  depth: number = 0,
  maxDepth: number = 5,
): LayoutNode {
  const bounds = calculateBounds(rects);

  // Single element returns directly
  if (rects.length === 1) {
    return {
      type: "element",
      elementIndex: rects[0].index,
      bounds,
    };
  }

  // Max depth reached, return simple container
  if (depth >= maxDepth) {
    return {
      type: "container",
      direction: "column",
      children: rects.map((r) => ({
        type: "element" as const,
        elementIndex: r.index,
        bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
      })),
      bounds,
    };
  }

  // Analyze layout
  const analysis = analyzeLayout(rects);

  // Handle overlapping elements
  const overlappingNodes: LayoutNode[] = analysis.overlappingElements.map((r) => ({
    type: "element" as const,
    elementIndex: r.index,
    bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
    needsAbsolute: true,
  }));

  // Filter out overlapping elements
  const nonOverlapping = rects.filter(
    (r) => !analysis.overlappingElements.some((o) => o.index === r.index),
  );

  if (nonOverlapping.length === 0) {
    // All elements overlap
    return {
      type: "container",
      children: overlappingNodes,
      bounds,
    };
  }

  if (analysis.direction === "none" || analysis.confidence < 0.3) {
    // No clear layout, use default vertical layout
    return {
      type: "container",
      direction: "column",
      children: [
        ...nonOverlapping.map((r) => ({
          type: "element" as const,
          elementIndex: r.index,
          bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
        })),
        ...overlappingNodes,
      ],
      bounds,
    };
  }

  // Group by layout direction
  const groups = analysis.direction === "row" ? analysis.rows : analysis.columns;

  // Recursively process each group
  const children: LayoutNode[] = groups.map((group) => {
    if (group.length === 1) {
      return {
        type: "element" as const,
        elementIndex: group[0].index,
        bounds: { x: group[0].x, y: group[0].y, width: group[0].width, height: group[0].height },
      };
    }

    // For multi-element groups, check if further analysis needed (cross direction)
    const crossDirection = analysis.direction === "row" ? "column" : "row";
    const crossGroups = crossDirection === "row" ? groupIntoRows(group) : groupIntoColumns(group);

    if (crossGroups.length > 1) {
      // Nested layout needed
      return buildLayoutTree(group, depth + 1, maxDepth);
    }

    // Simple group, no nesting needed
    const groupBounds = calculateBounds(group);
    return {
      type: "container" as const,
      direction: crossDirection,
      children: group.map((r) => ({
        type: "element" as const,
        elementIndex: r.index,
        bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
      })),
      bounds: groupBounds,
    };
  });

  return {
    type: "container",
    direction: analysis.direction,
    gap: analysis.isGapConsistent && analysis.gap > 0 ? analysis.gap : undefined,
    justifyContent: analysis.justifyContent !== "flex-start" ? analysis.justifyContent : undefined,
    alignItems: analysis.alignItems !== "stretch" ? analysis.alignItems : undefined,
    children: [...children, ...overlappingNodes],
    bounds,
  };
}

// ==================== Grid Layout Detection ====================

/**
 * Result of grid layout analysis
 */
export interface GridAnalysisResult {
  /** Whether elements form a valid grid layout */
  isGrid: boolean;
  /** Confidence score (0-1) for grid detection */
  confidence: number;
  /** Number of rows in the grid */
  rowCount: number;
  /** Number of columns in the grid */
  columnCount: number;
  /** Gap between rows in pixels */
  rowGap: number;
  /** Gap between columns in pixels */
  columnGap: number;
  /** Whether row gap is consistent */
  isRowGapConsistent: boolean;
  /** Whether column gap is consistent */
  isColumnGapConsistent: boolean;
  /** Width of each column track */
  trackWidths: number[];
  /** Height of each row track */
  trackHeights: number[];
  /** X positions where columns are aligned */
  alignedColumnPositions: number[];
  /** Grouped rows of elements */
  rows: ElementRect[][];
  /** Map of element indices to grid cells [row][col] */
  cellMap: (number | null)[][];
}

// ==================== Homogeneity Detection ====================

/**
 * Result of homogeneity analysis for a group of elements
 */
export interface HomogeneityResult {
  /** Whether the group is homogeneous (similar size/type) */
  isHomogeneous: boolean;
  /** Coefficient of variation for widths (lower = more similar) */
  widthCV: number;
  /** Coefficient of variation for heights (lower = more similar) */
  heightCV: number;
  /** Unique element types in the group */
  types: string[];
  /** Elements that belong to the homogeneous group */
  homogeneousElements: ElementRect[];
  /** Elements that don't fit the homogeneous pattern */
  outlierElements: ElementRect[];
}

/**
 * Size cluster for grouping elements by similar dimensions
 */
export interface SizeCluster {
  /** Representative width for this cluster */
  width: number;
  /** Representative height for this cluster */
  height: number;
  /** Elements belonging to this cluster */
  elements: ElementRect[];
  /** Original node types (if available) */
  types?: string[];
}

/**
 * Calculate coefficient of variation (CV) for a set of values
 * CV = stddev / mean, lower values indicate more consistency
 * Returns 0 for single values or empty arrays
 */
export function coefficientOfVariation(values: number[]): number {
  if (values.length <= 1) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;

  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);

  return stddev / mean;
}

/**
 * Cluster elements by similar size (width × height)
 * Groups elements whose dimensions are within the tolerance percentage
 *
 * @param rects - Elements to cluster
 * @param tolerancePercent - Size tolerance as decimal (0.2 = 20%)
 * @returns Array of size clusters, sorted by element count (largest first)
 */
export function clusterBySimilarSize(
  rects: ElementRect[],
  tolerancePercent: number = 0.2,
): SizeCluster[] {
  if (rects.length === 0) return [];

  const clusters: SizeCluster[] = [];

  for (const rect of rects) {
    let foundCluster = false;

    for (const cluster of clusters) {
      // Check if rect dimensions are within tolerance of cluster
      const widthDiff = Math.abs(rect.width - cluster.width) / Math.max(cluster.width, 1);
      const heightDiff = Math.abs(rect.height - cluster.height) / Math.max(cluster.height, 1);

      if (widthDiff <= tolerancePercent && heightDiff <= tolerancePercent) {
        cluster.elements.push(rect);
        // Update cluster center to average
        const allWidths = cluster.elements.map((e) => e.width);
        const allHeights = cluster.elements.map((e) => e.height);
        cluster.width = allWidths.reduce((a, b) => a + b, 0) / allWidths.length;
        cluster.height = allHeights.reduce((a, b) => a + b, 0) / allHeights.length;
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      clusters.push({
        width: rect.width,
        height: rect.height,
        elements: [rect],
      });
    }
  }

  // Sort by element count (largest cluster first)
  return clusters.sort((a, b) => b.elements.length - a.elements.length);
}

/**
 * Check if a group of elements is homogeneous
 * Homogeneous = similar sizes, compatible types
 *
 * @param rects - Elements to check
 * @param nodeTypes - Optional array of node types corresponding to rects
 * @param sizeToleranceCV - Max coefficient of variation for size (default 0.2 = 20%)
 * @returns Homogeneity analysis result
 */
export function analyzeHomogeneity(
  rects: ElementRect[],
  nodeTypes?: string[],
  sizeToleranceCV: number = 0.2,
): HomogeneityResult {
  const emptyResult: HomogeneityResult = {
    isHomogeneous: false,
    widthCV: 1,
    heightCV: 1,
    types: [],
    homogeneousElements: [],
    outlierElements: rects,
  };

  if (rects.length < 4) {
    return emptyResult;
  }

  // 1. Cluster by size first
  const sizeClusters = clusterBySimilarSize(rects, sizeToleranceCV);

  // If no cluster has 4+ elements, not homogeneous enough for grid
  const largestCluster = sizeClusters[0];
  if (!largestCluster || largestCluster.elements.length < 4) {
    return emptyResult;
  }

  // 2. Calculate CV for the largest cluster
  const widths = largestCluster.elements.map((e) => e.width);
  const heights = largestCluster.elements.map((e) => e.height);
  const widthCV = coefficientOfVariation(widths);
  const heightCV = coefficientOfVariation(heights);

  // 3. Check type consistency if provided
  let types: string[] = [];
  if (nodeTypes) {
    const clusterIndices = new Set(largestCluster.elements.map((e) => e.index));
    types = [...new Set(nodeTypes.filter((_, i) => clusterIndices.has(i)))];

    // Allow compatible container types
    const allowedTypes = new Set(["FRAME", "INSTANCE", "COMPONENT", "GROUP", "RECTANGLE"]);
    const hasIncompatibleType = types.some((t) => !allowedTypes.has(t));

    if (hasIncompatibleType) {
      return {
        ...emptyResult,
        widthCV,
        heightCV,
        types,
      };
    }
  }

  // 4. Determine if homogeneous
  const isHomogeneous = widthCV <= sizeToleranceCV && heightCV <= sizeToleranceCV;

  // 5. Separate homogeneous elements from outliers
  const homogeneousSet = new Set(largestCluster.elements.map((e) => e.index));
  const homogeneousElements = rects.filter((r) => homogeneousSet.has(r.index));
  const outlierElements = rects.filter((r) => !homogeneousSet.has(r.index));

  return {
    isHomogeneous,
    widthCV,
    heightCV,
    types,
    homogeneousElements,
    outlierElements,
  };
}

/**
 * Filter elements for grid detection by keeping only homogeneous groups
 * This prevents mixed layouts from being incorrectly detected as grids
 *
 * @param rects - All child elements
 * @param nodeTypes - Optional node types for additional filtering
 * @returns Elements suitable for grid detection, or empty array if not homogeneous
 */
export function filterHomogeneousForGrid(
  rects: ElementRect[],
  nodeTypes?: string[],
): ElementRect[] {
  const analysis = analyzeHomogeneity(rects, nodeTypes);

  if (analysis.isHomogeneous && analysis.homogeneousElements.length >= 4) {
    return analysis.homogeneousElements;
  }

  return [];
}

/**
 * A cluster of similar values
 */
interface ValueCluster {
  center: number;
  values: number[];
  count: number;
}

/**
 * Column alignment analysis result
 */
interface ColumnAlignmentResult {
  isAligned: boolean;
  alignedPositions: number[];
  columnCount: number;
}

/**
 * Cluster similar values together
 * Used to find aligned column positions across rows
 */
export function clusterValues(values: number[], tolerance: number = 3): ValueCluster[] {
  if (values.length === 0) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const clusters: ValueCluster[] = [];
  let currentCluster: ValueCluster = {
    center: sorted[0],
    values: [sorted[0]],
    count: 1,
  };

  for (let i = 1; i < sorted.length; i++) {
    const value = sorted[i];
    // Check if value is within tolerance of cluster center
    if (Math.abs(value - currentCluster.center) <= tolerance) {
      currentCluster.values.push(value);
      currentCluster.count++;
      // Update center to be the average
      currentCluster.center =
        currentCluster.values.reduce((a, b) => a + b, 0) / currentCluster.values.length;
    } else {
      // Start new cluster
      clusters.push(currentCluster);
      currentCluster = {
        center: value,
        values: [value],
        count: 1,
      };
    }
  }
  clusters.push(currentCluster);

  return clusters;
}

/**
 * Extract X positions of elements in each row
 */
function extractColumnPositions(rows: ElementRect[][]): number[][] {
  return rows.map((row) => row.map((el) => el.x).sort((a, b) => a - b));
}

/**
 * Check if columns are aligned across rows
 * Returns aligned column positions if alignment is detected
 */
function checkColumnAlignment(rows: ElementRect[][], tolerance: number = 3): ColumnAlignmentResult {
  if (rows.length < 2) {
    return { isAligned: false, alignedPositions: [], columnCount: 0 };
  }

  // Get column positions for each row
  const columnPositions = extractColumnPositions(rows);

  // Collect all X positions
  const allPositions = columnPositions.flat();

  // Cluster the positions
  const clusters = clusterValues(allPositions, tolerance);

  // Get aligned positions (cluster centers)
  const alignedPositions = clusters.map((c) => Math.round(c.center)).sort((a, b) => a - b);

  // Verify that most rows have elements at the aligned positions
  let alignedRows = 0;
  for (const row of rows) {
    const rowPositions = row.map((el) => el.x);
    const rowAligned = rowPositions.every((x) =>
      alignedPositions.some((ap) => Math.abs(x - ap) <= tolerance),
    );
    if (rowAligned) alignedRows++;
  }

  const alignmentRatio = alignedRows / rows.length;

  return {
    isAligned: alignmentRatio >= 0.8,
    alignedPositions,
    columnCount: alignedPositions.length,
  };
}

/**
 * Calculate row gaps (vertical spacing between rows)
 */
function calculateRowGaps(rows: ElementRect[][]): number[] {
  if (rows.length < 2) return [];

  const gaps: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const currentRowBottom = Math.max(...rows[i].map((el) => el.bottom));
    const nextRowTop = Math.min(...rows[i + 1].map((el) => el.y));
    const gap = nextRowTop - currentRowBottom;
    if (gap >= 0) gaps.push(gap);
  }

  return gaps;
}

/**
 * Calculate column gaps (horizontal spacing between columns)
 */
function calculateColumnGaps(alignedPositions: number[], rows: ElementRect[][]): number[] {
  if (alignedPositions.length < 2) return [];

  const gaps: number[] = [];

  // For each row, calculate gaps between adjacent elements
  for (const row of rows) {
    const sortedByX = [...row].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sortedByX.length - 1; i++) {
      const gap = sortedByX[i + 1].x - sortedByX[i].right;
      if (gap >= 0) gaps.push(gap);
    }
  }

  return gaps;
}

/**
 * Calculate track widths (column widths)
 */
function calculateTrackWidths(
  rows: ElementRect[][],
  alignedPositions: number[],
  tolerance: number = 3,
): number[] {
  // Group elements by column
  const columns: ElementRect[][] = alignedPositions.map(() => []);

  for (const row of rows) {
    for (const el of row) {
      const colIndex = alignedPositions.findIndex((pos) => Math.abs(el.x - pos) <= tolerance);
      if (colIndex >= 0) {
        columns[colIndex].push(el);
      }
    }
  }

  // Calculate width for each column (use max width in column)
  return columns.map((col) => {
    if (col.length === 0) return 0;
    const widths = col.map((el) => el.width);
    return roundToCommonValue(Math.max(...widths));
  });
}

/**
 * Calculate track heights (row heights)
 */
function calculateTrackHeights(rows: ElementRect[][]): number[] {
  return rows.map((row) => {
    if (row.length === 0) return 0;
    const heights = row.map((el) => el.height);
    return roundToCommonValue(Math.max(...heights));
  });
}

/**
 * Build cell map - maps grid positions to element indices
 */
function buildCellMap(
  rows: ElementRect[][],
  alignedPositions: number[],
  tolerance: number = 3,
): (number | null)[][] {
  const cellMap: (number | null)[][] = [];

  for (const row of rows) {
    const rowCells: (number | null)[] = new Array(alignedPositions.length).fill(null);

    for (const el of row) {
      const colIndex = alignedPositions.findIndex((pos) => Math.abs(el.x - pos) <= tolerance);
      if (colIndex >= 0) {
        rowCells[colIndex] = el.index;
      }
    }

    cellMap.push(rowCells);
  }

  return cellMap;
}

/**
 * Calculate grid confidence score
 */
function calculateGridConfidence(
  rows: ElementRect[][],
  columnAlignment: ColumnAlignmentResult,
  rowGapAnalysis: { isConsistent: boolean; rounded: number },
  columnGapAnalysis: { isConsistent: boolean; rounded: number },
): number {
  let score = 0;

  // 1. Multiple rows required for grid (0.3 max)
  if (rows.length >= 2) score += 0.2;
  if (rows.length >= 3) score += 0.1;

  // 2. Consistent column count across rows (0.2)
  const columnCounts = rows.map((r) => r.length);
  const allSameCount = columnCounts.every((c) => c === columnCounts[0]);
  if (allSameCount && columnCounts[0] >= 2) score += 0.2;

  // 3. Columns aligned across rows (0.25)
  if (columnAlignment.isAligned) score += 0.25;

  // 4. Consistent row gap (0.1)
  if (rowGapAnalysis.isConsistent) score += 0.1;

  // 5. Consistent column gap (0.1)
  if (columnGapAnalysis.isConsistent) score += 0.1;

  // 6. Grid fill ratio - elements fill most of expected cells (0.05)
  const expectedCells = rows.length * Math.max(...columnCounts);
  const actualCells = rows.reduce((sum, r) => sum + r.length, 0);
  const fillRatio = actualCells / expectedCells;
  if (fillRatio >= 0.75) score += 0.05;

  return Math.min(1, score);
}

/**
 * Detect grid layout from element rectangles
 *
 * Grid detection criteria:
 * - Multiple rows (2+)
 * - Columns aligned across rows
 * - Consistent column count per row
 * - Consistent gaps
 */
export function detectGridLayout(rects: ElementRect[]): GridAnalysisResult {
  const emptyResult: GridAnalysisResult = {
    isGrid: false,
    confidence: 0,
    rowCount: 0,
    columnCount: 0,
    rowGap: 0,
    columnGap: 0,
    isRowGapConsistent: false,
    isColumnGapConsistent: false,
    trackWidths: [],
    trackHeights: [],
    alignedColumnPositions: [],
    rows: [],
    cellMap: [],
  };

  // Need at least 4 elements for a meaningful grid (2x2)
  if (rects.length < 4) {
    return emptyResult;
  }

  // Step 1: Group into rows
  const rows = groupIntoRows(rects, 2);

  // Need at least 2 rows for grid
  if (rows.length < 2) {
    return emptyResult;
  }

  // Step 2: Check column alignment
  const columnAlignment = checkColumnAlignment(rows, 3);

  // Step 3: Analyze row gaps
  const rowGaps = calculateRowGaps(rows);
  const rowGapAnalysis = analyzeGaps(rowGaps);

  // Step 4: Analyze column gaps
  const columnGaps = calculateColumnGaps(columnAlignment.alignedPositions, rows);
  const columnGapAnalysis = analyzeGaps(columnGaps);

  // Step 5: Calculate confidence
  const confidence = calculateGridConfidence(
    rows,
    columnAlignment,
    rowGapAnalysis,
    columnGapAnalysis,
  );

  // Grid threshold: confidence >= 0.6
  const isGrid = confidence >= 0.6;

  if (!isGrid) {
    return {
      ...emptyResult,
      confidence,
      rows,
      rowCount: rows.length,
    };
  }

  // Step 6: Calculate track sizes
  const trackWidths = calculateTrackWidths(rows, columnAlignment.alignedPositions);
  const trackHeights = calculateTrackHeights(rows);

  // Step 7: Build cell map
  const cellMap = buildCellMap(rows, columnAlignment.alignedPositions);

  return {
    isGrid: true,
    confidence,
    rowCount: rows.length,
    columnCount: columnAlignment.columnCount,
    rowGap: rowGapAnalysis.rounded,
    columnGap: columnGapAnalysis.rounded,
    isRowGapConsistent: rowGapAnalysis.isConsistent,
    isColumnGapConsistent: columnGapAnalysis.isConsistent,
    trackWidths,
    trackHeights,
    alignedColumnPositions: columnAlignment.alignedPositions,
    rows,
    cellMap,
  };
}

// ==================== Debug and Visualization ====================

/**
 * Generate layout analysis report (for debugging)
 */
export function generateLayoutReport(rects: ElementRect[]): string {
  const analysis = analyzeLayout(rects);
  const tree = buildLayoutTree(rects);

  const lines: string[] = [
    "=== Layout Analysis Report ===",
    "",
    `Element count: ${rects.length}`,
    `Detected direction: ${analysis.direction} (confidence: ${(analysis.confidence * 100).toFixed(1)}%)`,
    `Gap: ${analysis.gap}px (consistent: ${analysis.isGapConsistent ? "yes" : "no"})`,
    `justifyContent: ${analysis.justifyContent}`,
    `alignItems: ${analysis.alignItems}`,
    "",
    `Row groups: ${analysis.rows.length} rows`,
    ...analysis.rows.map(
      (row, i) => `  Row ${i + 1}: ${row.length} elements [${row.map((r) => r.index).join(", ")}]`,
    ),
    "",
    `Column groups: ${analysis.columns.length} columns`,
    ...analysis.columns.map(
      (col, i) =>
        `  Column ${i + 1}: ${col.length} elements [${col.map((r) => r.index).join(", ")}]`,
    ),
    "",
    `Overlapping elements: ${analysis.overlappingElements.length}`,
    "",
    "=== Layout Tree ===",
    JSON.stringify(tree, null, 2),
  ];

  return lines.join("\n");
}
