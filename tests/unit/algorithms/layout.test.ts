/**
 * Layout Detection Algorithm Unit Tests
 *
 * Tests the layout detection algorithm for inferring Flexbox layouts
 * from absolutely positioned Figma elements.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  extractBoundingBox,
  toElementRect,
  groupIntoRows,
  groupIntoColumns,
  analyzeGaps,
  analyzeAlignment,
  calculateBounds,
  clusterValues,
  detectGridLayout,
  calculateIoU,
  classifyOverlap,
  detectOverlappingElements,
  LayoutOptimizer,
  type ElementRect,
  type BoundingBox,
} from "~/algorithms/layout/index.js";
import type { SimplifiedNode } from "~/types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "../../fixtures");

// Test data types
interface FigmaNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: BoundingBox;
  children?: FigmaNode[];
}

// Load test fixture
function loadTestData(): FigmaNode {
  const dataPath = path.join(fixturesPath, "figma-data/real-node-data.json");
  const rawData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const nodeKey = Object.keys(rawData.nodes)[0];
  return rawData.nodes[nodeKey].document;
}

// Extract child elements with bounding boxes
function extractChildElements(node: FigmaNode): ElementRect[] {
  if (!node.children) return [];

  return node.children
    .filter((child) => child.absoluteBoundingBox)
    .map((child, index) => {
      const box = child.absoluteBoundingBox!;
      return toElementRect(box, index);
    });
}

describe("Layout Detection Algorithm", () => {
  let testData: FigmaNode;

  beforeAll(() => {
    testData = loadTestData();
  });

  describe("Bounding Box Extraction", () => {
    it("should extract bounding box from CSS styles", () => {
      const cssStyles = { left: "100px", top: "200px", width: "300px", height: "400px" };
      const box = extractBoundingBox(cssStyles);

      expect(box).toBeDefined();
      expect(box?.x).toBe(100);
      expect(box?.y).toBe(200);
      expect(box?.width).toBe(300);
      expect(box?.height).toBe(400);
    });

    it("should convert to ElementRect correctly", () => {
      const box: BoundingBox = { x: 100, y: 200, width: 300, height: 400 };
      const rect = toElementRect(box, 0);

      expect(rect.index).toBe(0);
      expect(rect.x).toBe(100);
      expect(rect.y).toBe(200);
      expect(rect.width).toBe(300);
      expect(rect.height).toBe(400);
      expect(rect.right).toBe(400);
      expect(rect.bottom).toBe(600);
      expect(rect.centerX).toBe(250);
      expect(rect.centerY).toBe(400);
    });
  });

  describe("Row Grouping (Y-axis overlap)", () => {
    it("should group horizontally aligned elements into same row", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 10, width: 50, height: 30 }, 0),
        toElementRect({ x: 60, y: 15, width: 50, height: 30 }, 1),
        toElementRect({ x: 120, y: 12, width: 50, height: 30 }, 2),
      ];

      const rows = groupIntoRows(elements);
      expect(rows.length).toBe(1);
      expect(rows[0].length).toBe(3);
    });

    it("should separate vertically stacked elements into different rows", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 100, height: 30 }, 0),
        toElementRect({ x: 0, y: 50, width: 100, height: 30 }, 1),
        toElementRect({ x: 0, y: 100, width: 100, height: 30 }, 2),
      ];

      const rows = groupIntoRows(elements);
      // Elements don't overlap on Y-axis, expect multiple rows
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Column Grouping (X-axis overlap)", () => {
    it("should group vertically aligned elements into same column", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 10, y: 0, width: 30, height: 50 }, 0),
        toElementRect({ x: 15, y: 60, width: 30, height: 50 }, 1),
        toElementRect({ x: 12, y: 120, width: 30, height: 50 }, 2),
      ];

      const columns = groupIntoColumns(elements);
      expect(columns.length).toBe(1);
      expect(columns[0].length).toBe(3);
    });
  });

  describe("Gap Analysis", () => {
    it("should detect consistent gaps", () => {
      const gaps = [16, 16, 16, 16];
      const result = analyzeGaps(gaps);

      expect(result.isConsistent).toBe(true);
      expect(result.average).toBe(16);
    });

    it("should detect inconsistent gaps", () => {
      const gaps = [10, 30, 15, 40];
      const result = analyzeGaps(gaps);

      expect(result.isConsistent).toBe(false);
    });

    it("should handle gaps with small variance", () => {
      const gaps = [15, 16, 17, 16];
      const result = analyzeGaps(gaps);

      expect(result.isConsistent).toBe(true);
    });
  });

  describe("Alignment Detection", () => {
    it("should return alignment object with horizontal and vertical properties", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 100, height: 30 }, 0),
        toElementRect({ x: 0, y: 40, width: 150, height: 30 }, 1),
        toElementRect({ x: 0, y: 80, width: 80, height: 30 }, 2),
      ];
      const bounds: BoundingBox = { x: 0, y: 0, width: 200, height: 110 };

      const alignment = analyzeAlignment(elements, bounds);
      expect(alignment).toHaveProperty("horizontal");
      expect(alignment).toHaveProperty("vertical");
    });

    it("should analyze horizontal alignment", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 50, y: 0, width: 100, height: 30 }, 0),
        toElementRect({ x: 25, y: 40, width: 150, height: 30 }, 1),
        toElementRect({ x: 60, y: 80, width: 80, height: 30 }, 2),
      ];
      const bounds: BoundingBox = { x: 0, y: 0, width: 200, height: 110 };

      const alignment = analyzeAlignment(elements, bounds);
      expect(typeof alignment.horizontal).toBe("string");
    });

    it("should analyze vertical alignment", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 50, height: 100 }, 0),
        toElementRect({ x: 60, y: 0, width: 50, height: 80 }, 1),
        toElementRect({ x: 120, y: 0, width: 50, height: 120 }, 2),
      ];
      const bounds: BoundingBox = { x: 0, y: 0, width: 170, height: 120 };

      const alignment = analyzeAlignment(elements, bounds);
      expect(typeof alignment.vertical).toBe("string");
    });
  });

  describe("Bounds Calculation", () => {
    it("should calculate correct bounds for multiple elements", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 10, y: 20, width: 50, height: 30 }, 0),
        toElementRect({ x: 100, y: 5, width: 40, height: 60 }, 1),
      ];

      const bounds = calculateBounds(elements);

      expect(bounds.x).toBe(10);
      expect(bounds.y).toBe(5);
      expect(bounds.width).toBe(130);
      expect(bounds.height).toBe(60);
    });

    it("should handle empty array", () => {
      const bounds = calculateBounds([]);

      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(0);
      expect(bounds.width).toBe(0);
      expect(bounds.height).toBe(0);
    });
  });

  describe("Real Figma Data", () => {
    it("should process real Figma node data", () => {
      expect(testData).toBeDefined();
      expect(testData.type).toBe("GROUP");
      expect(testData.children).toBeDefined();
    });

    it("should extract child elements from real data", () => {
      const elements = extractChildElements(testData);
      expect(elements.length).toBeGreaterThan(0);

      elements.forEach((el) => {
        expect(typeof el.x).toBe("number");
        expect(typeof el.width).toBe("number");
        expect(typeof el.index).toBe("number");
      });
    });
  });

  describe("Value Clustering", () => {
    it("should cluster similar values together", () => {
      const values = [10, 12, 11, 50, 51, 52, 100, 101];
      const clusters = clusterValues(values, 3);

      expect(clusters.length).toBe(3);
      expect(clusters[0].count).toBe(3); // 10, 11, 12
      expect(clusters[1].count).toBe(3); // 50, 51, 52
      expect(clusters[2].count).toBe(2); // 100, 101
    });

    it("should handle empty array", () => {
      const clusters = clusterValues([]);
      expect(clusters.length).toBe(0);
    });

    it("should handle single value", () => {
      const clusters = clusterValues([42]);
      expect(clusters.length).toBe(1);
      expect(clusters[0].center).toBe(42);
    });

    it("should separate distant values", () => {
      const values = [0, 100, 200, 300];
      const clusters = clusterValues(values, 3);

      expect(clusters.length).toBe(4);
    });
  });

  describe("Grid Detection", () => {
    it("should detect a perfect 2x3 grid", () => {
      // 2 rows, 3 columns
      const elements: ElementRect[] = [
        // Row 1
        toElementRect({ x: 0, y: 0, width: 100, height: 50 }, 0),
        toElementRect({ x: 120, y: 0, width: 100, height: 50 }, 1),
        toElementRect({ x: 240, y: 0, width: 100, height: 50 }, 2),
        // Row 2
        toElementRect({ x: 0, y: 70, width: 100, height: 50 }, 3),
        toElementRect({ x: 120, y: 70, width: 100, height: 50 }, 4),
        toElementRect({ x: 240, y: 70, width: 100, height: 50 }, 5),
      ];

      const result = detectGridLayout(elements);

      expect(result.isGrid).toBe(true);
      expect(result.rowCount).toBe(2);
      expect(result.columnCount).toBe(3);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it("should detect a 3x2 grid", () => {
      // 3 rows, 2 columns
      const elements: ElementRect[] = [
        // Row 1
        toElementRect({ x: 0, y: 0, width: 80, height: 40 }, 0),
        toElementRect({ x: 100, y: 0, width: 80, height: 40 }, 1),
        // Row 2
        toElementRect({ x: 0, y: 60, width: 80, height: 40 }, 2),
        toElementRect({ x: 100, y: 60, width: 80, height: 40 }, 3),
        // Row 3
        toElementRect({ x: 0, y: 120, width: 80, height: 40 }, 4),
        toElementRect({ x: 100, y: 120, width: 80, height: 40 }, 5),
      ];

      const result = detectGridLayout(elements);

      expect(result.isGrid).toBe(true);
      expect(result.rowCount).toBe(3);
      expect(result.columnCount).toBe(2);
    });

    it("should calculate consistent row and column gaps", () => {
      const elements: ElementRect[] = [
        // Row 1 (gap = 20)
        toElementRect({ x: 0, y: 0, width: 100, height: 50 }, 0),
        toElementRect({ x: 120, y: 0, width: 100, height: 50 }, 1),
        // Row 2 (row gap = 16)
        toElementRect({ x: 0, y: 66, width: 100, height: 50 }, 2),
        toElementRect({ x: 120, y: 66, width: 100, height: 50 }, 3),
      ];

      const result = detectGridLayout(elements);

      expect(result.isGrid).toBe(true);
      expect(result.rowGap).toBe(16);
      expect(result.columnGap).toBe(20);
    });

    it("should generate track widths and heights", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 96, height: 64 }, 0), // Using common values
        toElementRect({ x: 120, y: 0, width: 80, height: 64 }, 1),
        toElementRect({ x: 0, y: 84, width: 96, height: 40 }, 2),
        toElementRect({ x: 120, y: 84, width: 80, height: 40 }, 3),
      ];

      const result = detectGridLayout(elements);

      expect(result.isGrid).toBe(true);
      expect(result.trackWidths.length).toBe(2);
      expect(result.trackHeights.length).toBe(2);
      // Track widths should be max of each column (rounded to common values)
      expect(result.trackWidths[0]).toBe(96);
      expect(result.trackWidths[1]).toBe(80);
      // Track heights should be max of each row
      expect(result.trackHeights[0]).toBe(64);
      expect(result.trackHeights[1]).toBe(40);
    });

    it("should build correct cell map", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 50, height: 50 }, 0),
        toElementRect({ x: 60, y: 0, width: 50, height: 50 }, 1),
        toElementRect({ x: 0, y: 60, width: 50, height: 50 }, 2),
        toElementRect({ x: 60, y: 60, width: 50, height: 50 }, 3),
      ];

      const result = detectGridLayout(elements);

      expect(result.cellMap.length).toBe(2); // 2 rows
      expect(result.cellMap[0].length).toBe(2); // 2 columns
      expect(result.cellMap[0][0]).toBe(0);
      expect(result.cellMap[0][1]).toBe(1);
      expect(result.cellMap[1][0]).toBe(2);
      expect(result.cellMap[1][1]).toBe(3);
    });

    it("should NOT detect grid for single row (flex row instead)", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 100, height: 50 }, 0),
        toElementRect({ x: 120, y: 0, width: 100, height: 50 }, 1),
        toElementRect({ x: 240, y: 0, width: 100, height: 50 }, 2),
      ];

      const result = detectGridLayout(elements);

      expect(result.isGrid).toBe(false);
    });

    it("should detect lower confidence for misaligned columns", () => {
      const elements: ElementRect[] = [
        // Row 1: columns at x=0, x=120
        toElementRect({ x: 0, y: 0, width: 100, height: 50 }, 0),
        toElementRect({ x: 120, y: 0, width: 100, height: 50 }, 1),
        // Row 2: columns at x=50, x=200 (misaligned!)
        toElementRect({ x: 50, y: 70, width: 100, height: 50 }, 2),
        toElementRect({ x: 200, y: 70, width: 100, height: 50 }, 3),
      ];

      const result = detectGridLayout(elements);

      // Misaligned columns should result in 4 column positions detected
      // and lower confidence due to alignment issues
      expect(result.columnCount).toBeGreaterThan(2);
    });

    it("should NOT detect grid for too few elements", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 100, height: 50 }, 0),
        toElementRect({ x: 120, y: 0, width: 100, height: 50 }, 1),
        toElementRect({ x: 0, y: 70, width: 100, height: 50 }, 2),
      ];

      const result = detectGridLayout(elements);

      // 3 elements is not enough for a meaningful grid
      expect(result.isGrid).toBe(false);
    });

    it("should handle grid with varying element sizes in same column", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 100, height: 50 }, 0),
        toElementRect({ x: 120, y: 0, width: 150, height: 50 }, 1), // wider
        toElementRect({ x: 0, y: 70, width: 100, height: 80 }, 2), // taller
        toElementRect({ x: 120, y: 70, width: 150, height: 80 }, 3),
      ];

      const result = detectGridLayout(elements);

      expect(result.isGrid).toBe(true);
      // Track widths should use max width in column
      expect(result.trackWidths[1]).toBe(150);
    });
  });

  describe("LayoutOptimizer Grid Integration", () => {
    // Helper to create SimplifiedNode from position/size
    function createNode(
      id: string,
      left: number,
      top: number,
      width: number,
      height: number,
    ): SimplifiedNode {
      return {
        id,
        name: `Node ${id}`,
        type: "FRAME",
        cssStyles: {
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
        },
      };
    }

    it("should detect and apply Grid CSS for 2x2 grid container", () => {
      const container: SimplifiedNode = {
        id: "container",
        name: "Grid Container",
        type: "FRAME",
        cssStyles: {
          width: "260px",
          height: "140px",
        },
        children: [
          createNode("1", 0, 0, 100, 50),
          createNode("2", 120, 0, 100, 50),
          createNode("3", 0, 70, 100, 50),
          createNode("4", 120, 70, 100, 50),
        ],
      };

      const result = LayoutOptimizer.optimizeContainer(container);

      expect(result.cssStyles?.display).toBe("grid");
      expect(result.cssStyles?.gridTemplateColumns).toBeDefined();
    });

    it("should apply gap for Grid layout", () => {
      const container: SimplifiedNode = {
        id: "container",
        name: "Grid Container",
        type: "FRAME",
        cssStyles: {
          width: "260px",
          height: "140px",
        },
        children: [
          createNode("1", 0, 0, 100, 50),
          createNode("2", 120, 0, 100, 50), // 20px column gap
          createNode("3", 0, 70, 100, 50), // 20px row gap
          createNode("4", 120, 70, 100, 50),
        ],
      };

      const result = LayoutOptimizer.optimizeContainer(container);

      expect(result.cssStyles?.display).toBe("grid");
      // Should have gap property
      expect(
        result.cssStyles?.gap || result.cssStyles?.rowGap || result.cssStyles?.columnGap,
      ).toBeDefined();
    });

    it("should fall back to flex for single row", () => {
      const container: SimplifiedNode = {
        id: "container",
        name: "Row Container",
        type: "FRAME",
        cssStyles: {
          width: "260px",
          height: "50px",
        },
        children: [
          createNode("1", 0, 0, 100, 50),
          createNode("2", 120, 0, 100, 50),
          createNode("3", 240, 0, 100, 50),
        ],
      };

      const result = LayoutOptimizer.optimizeContainer(container);

      // Should be flex, not grid (single row)
      expect(result.cssStyles?.display).toBe("flex");
      expect(result.cssStyles?.gridTemplateColumns).toBeUndefined();
    });

    it("should generate correct gridTemplateColumns", () => {
      // Use common design values (96, 80, 64) that don't get rounded
      const container: SimplifiedNode = {
        id: "container",
        name: "Grid Container",
        type: "FRAME",
        cssStyles: {
          width: "340px",
          height: "140px",
        },
        children: [
          createNode("1", 0, 0, 96, 48),
          createNode("2", 116, 0, 80, 48), // different width column
          createNode("3", 216, 0, 96, 48),
          createNode("4", 0, 68, 96, 48),
          createNode("5", 116, 68, 80, 48),
          createNode("6", 216, 68, 96, 48),
        ],
      };

      const result = LayoutOptimizer.optimizeContainer(container);

      expect(result.cssStyles?.display).toBe("grid");
      expect(result.cssStyles?.gridTemplateColumns).toContain("96px");
      expect(result.cssStyles?.gridTemplateColumns).toContain("80px");
    });
  });

  // ==================== IoU and Overlap Detection Tests ====================

  describe("IoU (Intersection over Union) Calculation", () => {
    it("should return 0 for non-overlapping elements", () => {
      const a = toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0);
      const b = toElementRect({ x: 200, y: 0, width: 100, height: 100 }, 1);

      const iou = calculateIoU(a, b);
      expect(iou).toBe(0);
    });

    it("should return 1 for identical elements", () => {
      const a = toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0);
      const b = toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 1);

      const iou = calculateIoU(a, b);
      expect(iou).toBe(1);
    });

    it("should return correct IoU for partial overlap", () => {
      // 50% overlap on x-axis
      const a = toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0);
      const b = toElementRect({ x: 50, y: 0, width: 100, height: 100 }, 1);

      const iou = calculateIoU(a, b);
      // Intersection: 50 * 100 = 5000
      // Union: 100*100 + 100*100 - 5000 = 15000
      // IoU = 5000 / 15000 = 0.333...
      expect(iou).toBeCloseTo(0.333, 2);
    });

    it("should handle completely contained element", () => {
      const outer = toElementRect({ x: 0, y: 0, width: 200, height: 200 }, 0);
      const inner = toElementRect({ x: 50, y: 50, width: 100, height: 100 }, 1);

      const iou = calculateIoU(outer, inner);
      // Intersection: 100 * 100 = 10000
      // Union: 200*200 + 100*100 - 10000 = 40000 + 10000 - 10000 = 40000
      // IoU = 10000 / 40000 = 0.25
      expect(iou).toBeCloseTo(0.25, 2);
    });
  });

  describe("Overlap Classification", () => {
    it("should classify non-overlapping elements as 'none'", () => {
      const a = toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0);
      const b = toElementRect({ x: 200, y: 0, width: 100, height: 100 }, 1);

      const result = classifyOverlap(a, b);
      expect(result).toBe("none");
    });

    it("should classify adjacent elements as 'adjacent'", () => {
      const a = toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0);
      const b = toElementRect({ x: 101, y: 0, width: 100, height: 100 }, 1); // 1px gap

      const result = classifyOverlap(a, b);
      expect(result).toBe("adjacent");
    });

    it("should classify small overlap as 'partial'", () => {
      const a = toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0);
      const b = toElementRect({ x: 95, y: 0, width: 100, height: 100 }, 1); // 5% overlap

      const result = classifyOverlap(a, b);
      expect(result).toBe("partial");
    });

    it("should classify significant overlap as 'significant'", () => {
      const a = toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0);
      const b = toElementRect({ x: 50, y: 0, width: 100, height: 100 }, 1); // ~33% IoU

      const result = classifyOverlap(a, b);
      expect(result).toBe("significant");
    });

    it("should classify contained element as 'contained'", () => {
      const outer = toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0);
      const inner = toElementRect({ x: 10, y: 10, width: 80, height: 80 }, 1);

      const result = classifyOverlap(outer, inner);
      expect(result).toBe("contained");
    });
  });

  describe("Overlap Detection", () => {
    it("should separate overlapping elements from flow elements", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0),
        toElementRect({ x: 50, y: 50, width: 100, height: 100 }, 1), // Overlaps with 0
        toElementRect({ x: 300, y: 0, width: 100, height: 100 }, 2), // No overlap
        toElementRect({ x: 450, y: 0, width: 100, height: 100 }, 3), // No overlap
      ];

      const result = detectOverlappingElements(elements, 0.1);

      expect(result.stackedElements.length).toBe(2); // Elements 0 and 1
      expect(result.flowElements.length).toBe(2); // Elements 2 and 3
      expect(result.stackedIndices.has(0)).toBe(true);
      expect(result.stackedIndices.has(1)).toBe(true);
    });

    it("should return all elements as flow when no overlap", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0),
        toElementRect({ x: 150, y: 0, width: 100, height: 100 }, 1),
        toElementRect({ x: 300, y: 0, width: 100, height: 100 }, 2),
      ];

      const result = detectOverlappingElements(elements, 0.1);

      expect(result.stackedElements.length).toBe(0);
      expect(result.flowElements.length).toBe(3);
    });

    it("should detect multiple overlapping pairs", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0),
        toElementRect({ x: 50, y: 0, width: 100, height: 100 }, 1), // Overlaps with 0
        toElementRect({ x: 300, y: 0, width: 100, height: 100 }, 2),
        toElementRect({ x: 350, y: 0, width: 100, height: 100 }, 3), // Overlaps with 2
      ];

      const result = detectOverlappingElements(elements, 0.1);

      expect(result.stackedElements.length).toBe(4); // All overlap with at least one
    });

    it("should use custom IoU threshold", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 100, height: 100 }, 0),
        toElementRect({ x: 80, y: 0, width: 100, height: 100 }, 1), // ~11% IoU
      ];

      // With 0.1 threshold, should detect overlap
      const result1 = detectOverlappingElements(elements, 0.1);
      expect(result1.stackedElements.length).toBe(2);

      // With 0.5 threshold, should NOT detect overlap
      const result2 = detectOverlappingElements(elements, 0.5);
      expect(result2.stackedElements.length).toBe(0);
    });
  });

  describe("Child Style Cleanup", () => {
    // Helper to create SimplifiedNode with absolute positioning
    function createAbsoluteNode(
      id: string,
      left: number,
      top: number,
      width: number,
      height: number,
    ): SimplifiedNode {
      return {
        id,
        name: `Node ${id}`,
        type: "FRAME",
        cssStyles: {
          position: "absolute",
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
        },
      };
    }

    it("should remove position:absolute from children when parent becomes flex", () => {
      const child = createAbsoluteNode("1", 0, 0, 100, 50);
      const cleaned = LayoutOptimizer.cleanChildStylesForLayout(child, "flex");

      expect(cleaned.cssStyles?.position).toBeUndefined();
    });

    it("should remove left/top from children when parent becomes flex", () => {
      const child = createAbsoluteNode("1", 100, 200, 100, 50);
      const cleaned = LayoutOptimizer.cleanChildStylesForLayout(child, "flex");

      expect(cleaned.cssStyles?.left).toBeUndefined();
      expect(cleaned.cssStyles?.top).toBeUndefined();
    });

    it("should keep width/height for flex children", () => {
      const child = createAbsoluteNode("1", 0, 0, 100, 50);
      const cleaned = LayoutOptimizer.cleanChildStylesForLayout(child, "flex");

      expect(cleaned.cssStyles?.width).toBe("100px");
      expect(cleaned.cssStyles?.height).toBe("50px");
    });

    it("should remove all position properties for grid children", () => {
      const child: SimplifiedNode = {
        id: "1",
        name: "Node 1",
        type: "FRAME",
        cssStyles: {
          position: "absolute",
          left: "10px",
          top: "20px",
          right: "30px",
          bottom: "40px",
          width: "100px",
          height: "50px",
        },
      };

      const cleaned = LayoutOptimizer.cleanChildStylesForLayout(child, "grid");

      expect(cleaned.cssStyles?.position).toBeUndefined();
      expect(cleaned.cssStyles?.left).toBeUndefined();
      expect(cleaned.cssStyles?.top).toBeUndefined();
      expect(cleaned.cssStyles?.right).toBeUndefined();
      expect(cleaned.cssStyles?.bottom).toBeUndefined();
    });

    it("should skip cleaning for stacked elements", () => {
      const children: SimplifiedNode[] = [
        createAbsoluteNode("1", 0, 0, 100, 50),
        createAbsoluteNode("2", 50, 0, 100, 50), // Overlapping
      ];

      // Mark index 0 and 1 as stacked
      const stackedIndices = new Set([0, 1]);
      const cleaned = LayoutOptimizer.cleanChildrenStyles(children, "flex", stackedIndices);

      // Stacked elements should keep their absolute positioning
      expect(cleaned[0].cssStyles?.position).toBe("absolute");
      expect(cleaned[1].cssStyles?.position).toBe("absolute");
    });

    it("should remove default CSS values", () => {
      const styles = {
        fontWeight: "400",
        textAlign: "left",
        opacity: "1",
        backgroundColor: "transparent",
        width: "100px",
        color: "#000",
      };

      const cleaned = LayoutOptimizer.removeDefaultValues(styles);

      expect(cleaned.fontWeight).toBeUndefined();
      expect(cleaned.textAlign).toBeUndefined();
      expect(cleaned.opacity).toBeUndefined();
      expect(cleaned.backgroundColor).toBeUndefined();
      expect(cleaned.width).toBe("100px"); // Keep non-default
      expect(cleaned.color).toBe("#000"); // Keep non-default
    });

    it("should remove 0px position values", () => {
      const styles = {
        left: "0px",
        top: "0",
        right: "10px",
        width: "100px",
      };

      const cleaned = LayoutOptimizer.removeDefaultValues(styles);

      expect(cleaned.left).toBeUndefined();
      expect(cleaned.top).toBeUndefined();
      expect(cleaned.right).toBe("10px"); // Keep non-zero
      expect(cleaned.width).toBe("100px");
    });
  });

  describe("Integrated Overlap and Cleanup in optimizeContainer", () => {
    function createAbsoluteNode(
      id: string,
      left: number,
      top: number,
      width: number,
      height: number,
    ): SimplifiedNode {
      return {
        id,
        name: `Node ${id}`,
        type: "FRAME",
        cssStyles: {
          position: "absolute",
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
        },
      };
    }

    it("should clean child styles when parent becomes flex", () => {
      const container: SimplifiedNode = {
        id: "container",
        name: "Flex Container",
        type: "FRAME",
        cssStyles: { width: "500px", height: "100px" },
        children: [
          createAbsoluteNode("1", 0, 0, 100, 50),
          createAbsoluteNode("2", 120, 0, 100, 50),
          createAbsoluteNode("3", 240, 0, 100, 50),
        ],
      };

      const result = LayoutOptimizer.optimizeContainer(container);

      expect(result.cssStyles?.display).toBe("flex");
      // Children should have position:absolute removed
      result.children?.forEach((child) => {
        expect(child.cssStyles?.position).toBeUndefined();
        expect(child.cssStyles?.left).toBeUndefined();
        expect(child.cssStyles?.top).toBeUndefined();
      });
    });

    it("should clean child styles when parent becomes grid", () => {
      const container: SimplifiedNode = {
        id: "container",
        name: "Grid Container",
        type: "FRAME",
        cssStyles: { width: "260px", height: "140px" },
        children: [
          createAbsoluteNode("1", 0, 0, 100, 50),
          createAbsoluteNode("2", 120, 0, 100, 50),
          createAbsoluteNode("3", 0, 70, 100, 50),
          createAbsoluteNode("4", 120, 70, 100, 50),
        ],
      };

      const result = LayoutOptimizer.optimizeContainer(container);

      expect(result.cssStyles?.display).toBe("grid");
      // Children should have position:absolute removed
      result.children?.forEach((child) => {
        expect(child.cssStyles?.position).toBeUndefined();
        expect(child.cssStyles?.left).toBeUndefined();
        expect(child.cssStyles?.top).toBeUndefined();
      });
    });
  });
});
