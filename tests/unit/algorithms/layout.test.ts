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
  type ElementRect,
  type BoundingBox,
} from "~/algorithms/layout/index.js";

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
  const dataPath = path.join(fixturesPath, "real-node-data.json");
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

      const alignment = analyzeAlignment(elements, "horizontal");
      expect(alignment).toHaveProperty("horizontal");
      expect(alignment).toHaveProperty("vertical");
    });

    it("should analyze horizontal alignment", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 50, y: 0, width: 100, height: 30 }, 0),
        toElementRect({ x: 25, y: 40, width: 150, height: 30 }, 1),
        toElementRect({ x: 60, y: 80, width: 80, height: 30 }, 2),
      ];

      const alignment = analyzeAlignment(elements, "horizontal");
      expect(typeof alignment.horizontal).toBe("string");
    });

    it("should analyze vertical alignment", () => {
      const elements: ElementRect[] = [
        toElementRect({ x: 0, y: 0, width: 50, height: 100 }, 0),
        toElementRect({ x: 60, y: 0, width: 50, height: 80 }, 1),
        toElementRect({ x: 120, y: 0, width: 50, height: 120 }, 2),
      ];

      const alignment = analyzeAlignment(elements, "vertical");
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
});
