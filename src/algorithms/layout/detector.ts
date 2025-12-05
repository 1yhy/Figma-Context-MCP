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
