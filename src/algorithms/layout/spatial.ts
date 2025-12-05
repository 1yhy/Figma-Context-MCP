/**
 * Spatial Projection Analyzer
 *
 * Analyzes spatial relationships between nodes using 2D projection techniques.
 * Used to detect layout patterns, grouping, and containment relationships.
 *
 * @module algorithms/layout/spatial
 */

import type { SimplifiedNode } from "~/types/index.js";

// ==================== Type Definitions ====================

/**
 * Rectangle representing a node's bounding box
 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Spatial relationship between two nodes
 */
export enum NodeRelationship {
  /** One node completely contains another */
  CONTAINS = "contains",
  /** Two nodes partially overlap */
  INTERSECTS = "intersects",
  /** Two nodes do not overlap */
  SEPARATE = "separate",
}

/**
 * Projection line for spatial division
 */
export interface ProjectionLine {
  /** Position of the line */
  position: number;
  /** Direction: 'horizontal' or 'vertical' */
  direction: "horizontal" | "vertical";
  /** Indices of nodes intersecting this line */
  nodeIndices: number[];
}

// ==================== Helper Functions ====================

/**
 * Safely parse CSS numeric value
 * @param value - CSS value string
 * @param defaultValue - Default value if parsing fails
 */
function safeParseFloat(value: string | undefined | null, defaultValue: number = 0): number {
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get node position from absolute coordinates or CSS styles
 */
function getNodePosition(node: SimplifiedNode): { left: number; top: number } {
  let left = 0;
  let top = 0;

  // Prefer absolute coordinates
  if (typeof node._absoluteX === "number") {
    left = node._absoluteX;
  } else if (node.cssStyles?.left) {
    left = safeParseFloat(node.cssStyles.left as string);
  }

  if (typeof node._absoluteY === "number") {
    top = node._absoluteY;
  } else if (node.cssStyles?.top) {
    top = safeParseFloat(node.cssStyles.top as string);
  }

  return { left, top };
}

// ==================== Rectangle Utilities ====================

/**
 * Utility class for rectangle operations
 */
export class RectUtils {
  /**
   * Create Rect from SimplifiedNode
   */
  static fromNode(node: SimplifiedNode): Rect | null {
    if (!node.cssStyles || !node.cssStyles.width || !node.cssStyles.height) {
      return null;
    }

    const width = safeParseFloat(node.cssStyles.width as string, 0);
    const height = safeParseFloat(node.cssStyles.height as string, 0);

    // Invalid rectangle if dimensions are zero
    if (width <= 0 || height <= 0) {
      return null;
    }

    const { left, top } = getNodePosition(node);
    return { left, top, width, height };
  }

  /**
   * Check if rectangle A contains rectangle B
   */
  static contains(a: Rect, b: Rect): boolean {
    return (
      a.left <= b.left &&
      a.top <= b.top &&
      a.left + a.width >= b.left + b.width &&
      a.top + a.height >= b.top + b.height
    );
  }

  /**
   * Check if two rectangles intersect
   */
  static intersects(a: Rect, b: Rect): boolean {
    return !(
      a.left + a.width <= b.left ||
      b.left + b.width <= a.left ||
      a.top + a.height <= b.top ||
      b.top + b.height <= a.top
    );
  }

  /**
   * Calculate intersection of two rectangles
   */
  static intersection(a: Rect, b: Rect): Rect | null {
    if (!RectUtils.intersects(a, b)) {
      return null;
    }

    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.left + a.width, b.left + b.width);
    const bottom = Math.min(a.top + a.height, b.top + b.height);

    return {
      left,
      top,
      width: right - left,
      height: bottom - top,
    };
  }

  /**
   * Analyze spatial relationship between two rectangles
   */
  static analyzeRelationship(a: Rect, b: Rect): NodeRelationship {
    if (RectUtils.contains(a, b)) {
      return NodeRelationship.CONTAINS;
    } else if (RectUtils.contains(b, a)) {
      return NodeRelationship.CONTAINS;
    } else if (RectUtils.intersects(a, b)) {
      return NodeRelationship.INTERSECTS;
    } else {
      return NodeRelationship.SEPARATE;
    }
  }
}

// ==================== Spatial Projection Analyzer ====================

/**
 * 2D Spatial Projection Analyzer
 *
 * Uses projection lines to analyze spatial relationships
 * and group nodes by rows and columns.
 */
export class SpatialProjectionAnalyzer {
  /**
   * Convert SimplifiedNode array to Rect array
   */
  static nodesToRects(nodes: SimplifiedNode[]): Rect[] {
    return nodes.map((node) => RectUtils.fromNode(node)).filter((rect): rect is Rect => rect !== null);
  }

  /**
   * Generate horizontal projection lines (for row detection)
   * @param rects - Rectangle array
   * @param tolerance - Coordinate tolerance in pixels
   */
  static generateHorizontalProjectionLines(rects: Rect[], tolerance: number = 1): ProjectionLine[] {
    if (rects.length === 0) return [];

    // Collect all top and bottom Y coordinates
    const yCoordinates: number[] = [];
    rects.forEach((rect) => {
      yCoordinates.push(rect.top);
      yCoordinates.push(rect.top + rect.height);
    });

    // Sort and filter nearby coordinates
    yCoordinates.sort((a, b) => a - b);
    const uniqueYCoordinates: number[] = [];

    for (let i = 0; i < yCoordinates.length; i++) {
      if (i === 0 || Math.abs(yCoordinates[i] - yCoordinates[i - 1]) > tolerance) {
        uniqueYCoordinates.push(yCoordinates[i]);
      }
    }

    // Create projection line for each Y coordinate
    return uniqueYCoordinates.map((y) => {
      const line: ProjectionLine = {
        position: y,
        direction: "horizontal",
        nodeIndices: [],
      };

      // Find all nodes intersecting this line
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (y >= rect.top && y <= rect.top + rect.height) {
          line.nodeIndices.push(i);
        }
      }

      return line;
    });
  }

  /**
   * Generate vertical projection lines (for column detection)
   * @param rects - Rectangle array
   * @param tolerance - Coordinate tolerance in pixels
   */
  static generateVerticalProjectionLines(rects: Rect[], tolerance: number = 1): ProjectionLine[] {
    if (rects.length === 0) return [];

    // Collect all left and right X coordinates
    const xCoordinates: number[] = [];
    rects.forEach((rect) => {
      xCoordinates.push(rect.left);
      xCoordinates.push(rect.left + rect.width);
    });

    // Sort and filter nearby coordinates
    xCoordinates.sort((a, b) => a - b);
    const uniqueXCoordinates: number[] = [];

    for (let i = 0; i < xCoordinates.length; i++) {
      if (i === 0 || Math.abs(xCoordinates[i] - xCoordinates[i - 1]) > tolerance) {
        uniqueXCoordinates.push(xCoordinates[i]);
      }
    }

    // Create projection line for each X coordinate
    return uniqueXCoordinates.map((x) => {
      const line: ProjectionLine = {
        position: x,
        direction: "vertical",
        nodeIndices: [],
      };

      // Find all nodes intersecting this line
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (x >= rect.left && x <= rect.left + rect.width) {
          line.nodeIndices.push(i);
        }
      }

      return line;
    });
  }

  /**
   * Group nodes by rows
   * @param nodes - Node array
   * @param tolerance - Tolerance in pixels
   */
  static groupNodesByRows(nodes: SimplifiedNode[], tolerance: number = 1): SimplifiedNode[][] {
    const rects = this.nodesToRects(nodes);
    if (rects.length === 0) return [nodes];

    const projectionLines = this.generateHorizontalProjectionLines(rects, tolerance);
    const rows: SimplifiedNode[][] = [];

    for (let i = 0; i < projectionLines.length - 1; i++) {
      const currentLine = projectionLines[i];
      const nextLine = projectionLines[i + 1];

      const nodesBetweenLines = new Set<number>();

      // Find nodes completely between these two lines
      for (let j = 0; j < rects.length; j++) {
        const rect = rects[j];
        if (rect.top >= currentLine.position && rect.top + rect.height <= nextLine.position) {
          nodesBetweenLines.add(j);
        }
      }

      if (nodesBetweenLines.size > 0) {
        // Sort nodes left to right
        const rowNodes = Array.from(nodesBetweenLines)
          .map((index) => nodes[index])
          .sort((a, b) => {
            const { left: aLeft } = getNodePosition(a);
            const { left: bLeft } = getNodePosition(b);
            return aLeft - bLeft;
          });

        rows.push(rowNodes);
      }
    }

    // If no rows found, treat all nodes as one row
    if (rows.length === 0) {
      rows.push([...nodes]);
    }

    return rows;
  }

  /**
   * Group row nodes by columns
   * @param rowNodes - Nodes in a row
   * @param tolerance - Tolerance in pixels
   */
  static groupRowNodesByColumns(rowNodes: SimplifiedNode[], tolerance: number = 1): SimplifiedNode[][] {
    const rects = this.nodesToRects(rowNodes);
    if (rects.length === 0) return [rowNodes];

    const projectionLines = this.generateVerticalProjectionLines(rects, tolerance);
    const columns: SimplifiedNode[][] = [];

    for (let i = 0; i < projectionLines.length - 1; i++) {
      const currentLine = projectionLines[i];
      const nextLine = projectionLines[i + 1];

      const nodesBetweenLines = new Set<number>();

      // Find nodes completely between these two lines
      for (let j = 0; j < rects.length; j++) {
        const rect = rects[j];
        if (rect.left >= currentLine.position && rect.left + rect.width <= nextLine.position) {
          nodesBetweenLines.add(j);
        }
      }

      if (nodesBetweenLines.size > 0) {
        const colNodes = Array.from(nodesBetweenLines).map((index) => rowNodes[index]);
        columns.push(colNodes);
      }
    }

    // If no columns found, treat all nodes as one column
    if (columns.length === 0) {
      columns.push([...rowNodes]);
    }

    return columns;
  }

  /**
   * Process node spatial relationships and build containment hierarchy
   * @param nodes - Node array
   */
  static processNodeRelationships(nodes: SimplifiedNode[]): SimplifiedNode[] {
    if (nodes.length <= 1) return [...nodes];

    const rects = this.nodesToRects(nodes);
    if (rects.length !== nodes.length) {
      return nodes; // Cannot process all nodes, return as-is
    }

    // Find all containment relationships
    const containsRelations: [number, number][] = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = 0; j < rects.length; j++) {
        if (i !== j && RectUtils.contains(rects[i], rects[j])) {
          containsRelations.push([i, j]); // Node i contains node j
        }
      }
    }

    // Build containment graph
    const childrenMap = new Map<number, Set<number>>();
    const parentMap = new Map<number, number | null>();

    // Initialize all nodes without parents
    for (let i = 0; i < nodes.length; i++) {
      parentMap.set(i, null);
      childrenMap.set(i, new Set<number>());
    }

    // Process containment relationships
    for (const [parent, child] of containsRelations) {
      childrenMap.get(parent)?.add(child);
      parentMap.set(child, parent);
    }

    // Fix multi-level containment - ensure each node has only its direct parent
    for (const [child, parent] of parentMap.entries()) {
      if (parent === null) continue;

      let currentParent = parent;
      let grandParent = parentMap.get(currentParent);

      while (grandParent !== null && grandParent !== undefined) {
        // If grandparent also directly contains child, remove parent-child direct relation
        if (childrenMap.get(grandParent)?.has(child)) {
          childrenMap.get(currentParent)?.delete(child);
        }

        currentParent = grandParent;
        grandParent = parentMap.get(currentParent);
      }
    }

    // Build new node tree structure
    const rootIndices = Array.from(parentMap.entries())
      .filter(([_, parent]) => parent === null)
      .map(([index]) => index);

    const result: SimplifiedNode[] = [];

    // Recursively build node tree
    const buildNodeTree = (nodeIndex: number): SimplifiedNode => {
      const node = { ...nodes[nodeIndex] };
      const childIndices = Array.from(childrenMap.get(nodeIndex) || []);

      if (childIndices.length > 0) {
        node.children = childIndices.map(buildNodeTree);
      }

      return node;
    };

    // Build from all root nodes
    for (const rootIndex of rootIndices) {
      result.push(buildNodeTree(rootIndex));
    }

    return result;
  }
}
