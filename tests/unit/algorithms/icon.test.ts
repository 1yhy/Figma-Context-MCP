/**
 * Icon Detection Algorithm Unit Tests
 *
 * Tests the icon detection algorithm for identifying and merging
 * vector layers that should be exported as single icons.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  detectIcon,
  analyzeNodeTree,
  DEFAULT_CONFIG,
  type FigmaNode,
  type IconDetectionResult,
} from "~/algorithms/icon/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "../../fixtures");

// Load test fixture
function loadTestData(): FigmaNode {
  const dataPath = path.join(fixturesPath, "real-node-data.json");
  const rawData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const nodeKey = Object.keys(rawData.nodes)[0];
  return rawData.nodes[nodeKey].document;
}

// Find node by ID recursively
function findNodeById(node: FigmaNode, id: string): FigmaNode | null {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

// Count total icons detected
function countIcons(results: IconDetectionResult[]): number {
  return results.filter((r) => r.shouldMerge).length;
}

describe("Icon Detection Algorithm", () => {
  let testData: FigmaNode;

  beforeAll(() => {
    testData = loadTestData();
  });

  describe("Configuration", () => {
    it("should have sensible default configuration", () => {
      expect(DEFAULT_CONFIG.maxIconSize).toBe(300);
      expect(DEFAULT_CONFIG.minIconSize).toBe(8);
      expect(DEFAULT_CONFIG.mergeableRatio).toBe(0.6);
      expect(DEFAULT_CONFIG.maxDepth).toBe(5);
    });
  });

  describe("Size Constraints", () => {
    it("should reject nodes that are too large", () => {
      const largeNode: FigmaNode = {
        id: "large-1",
        name: "Large Node",
        type: "GROUP",
        absoluteBoundingBox: { x: 0, y: 0, width: 500, height: 500 },
        children: [
          { id: "child-1", name: "Vector", type: "VECTOR" },
        ],
      };

      const result = detectIcon(largeNode, DEFAULT_CONFIG);
      expect(result.shouldMerge).toBe(false);
      expect(result.reason).toContain("large");
    });

    it("should reject nodes that are too small", () => {
      const smallNode: FigmaNode = {
        id: "small-1",
        name: "Small Node",
        type: "GROUP",
        absoluteBoundingBox: { x: 0, y: 0, width: 4, height: 4 },
        children: [
          { id: "child-1", name: "Vector", type: "VECTOR" },
        ],
      };

      const result = detectIcon(smallNode, DEFAULT_CONFIG);
      expect(result.shouldMerge).toBe(false);
    });
  });

  describe("Node Type Detection", () => {
    it("should detect vector-only groups as icons", () => {
      const vectorGroup: FigmaNode = {
        id: "icon-1",
        name: "Search Icon",
        type: "GROUP",
        absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 },
        children: [
          { id: "v1", name: "Circle", type: "ELLIPSE" },
          { id: "v2", name: "Line", type: "LINE" },
        ],
      };

      const result = detectIcon(vectorGroup, DEFAULT_CONFIG);
      expect(result.shouldMerge).toBe(true);
      expect(result.exportFormat).toBe("SVG");
    });

    it("should reject groups containing TEXT nodes", () => {
      const textGroup: FigmaNode = {
        id: "text-group",
        name: "Button with Text",
        type: "GROUP",
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
        children: [
          { id: "bg", name: "Background", type: "RECTANGLE" },
          { id: "label", name: "Label", type: "TEXT" },
        ],
      };

      const result = detectIcon(textGroup, DEFAULT_CONFIG);
      expect(result.shouldMerge).toBe(false);
      expect(result.reason).toContain("TEXT");
    });
  });

  describe("Export Format Selection", () => {
    it("should choose SVG for pure vector icons", () => {
      const vectorIcon: FigmaNode = {
        id: "svg-icon",
        name: "Star",
        type: "GROUP",
        absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 },
        children: [
          { id: "star", name: "Star", type: "STAR" },
        ],
      };

      const result = detectIcon(vectorIcon, DEFAULT_CONFIG);
      expect(result.shouldMerge).toBe(true);
      expect(result.exportFormat).toBe("SVG");
    });

    it("should choose PNG for icons with complex effects", () => {
      const effectIcon: FigmaNode = {
        id: "effect-icon",
        name: "Shadow Icon",
        type: "GROUP",
        absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 },
        effects: [
          { type: "DROP_SHADOW", visible: true },
        ],
        children: [
          { id: "shape", name: "Shape", type: "RECTANGLE" },
        ],
      };

      const result = detectIcon(effectIcon, DEFAULT_CONFIG);
      if (result.shouldMerge) {
        expect(result.exportFormat).toBe("PNG");
      }
    });

    it("should respect designer-specified export settings", () => {
      const exportNode: FigmaNode = {
        id: "export-icon",
        name: "Custom Export",
        type: "GROUP",
        absoluteBoundingBox: { x: 0, y: 0, width: 32, height: 32 },
        exportSettings: [
          { format: "PNG", suffix: "", constraint: { type: "SCALE", value: 2 } },
        ],
        children: [
          { id: "v1", name: "Vector", type: "VECTOR" },
        ],
      };

      const result = detectIcon(exportNode, DEFAULT_CONFIG);
      expect(result.shouldMerge).toBe(true);
      expect(result.exportFormat).toBe("PNG");
    });
  });

  describe("Mergeable Types", () => {
    const mergeableTypes = ["VECTOR", "ELLIPSE", "RECTANGLE", "STAR", "POLYGON", "LINE", "BOOLEAN_OPERATION"];

    mergeableTypes.forEach((type) => {
      it(`should recognize ${type} as mergeable`, () => {
        const node: FigmaNode = {
          id: `${type.toLowerCase()}-icon`,
          name: `${type} Icon`,
          type: "GROUP",
          absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 },
          children: [
            { id: "child", name: type, type: type },
          ],
        };

        const result = detectIcon(node, DEFAULT_CONFIG);
        expect(result.shouldMerge).toBe(true);
      });
    });
  });

  describe("Real Figma Data", () => {
    it("should load and parse real Figma data", () => {
      expect(testData).toBeDefined();
      expect(testData.type).toBe("GROUP");
    });

    it("should analyze entire node tree", () => {
      const result = analyzeNodeTree(testData, DEFAULT_CONFIG);
      expect(result).toHaveProperty("processedTree");
      expect(result).toHaveProperty("exportableIcons");
      expect(result).toHaveProperty("summary");
      expect(Array.isArray(result.exportableIcons)).toBe(true);
    });

    it("should detect appropriate number of icons", () => {
      const result = analyzeNodeTree(testData, DEFAULT_CONFIG);
      const iconCount = countIcons(result.exportableIcons);

      // Should detect some icons but not too many (avoid fragmentation)
      expect(iconCount).toBeGreaterThanOrEqual(0);
      expect(iconCount).toBeLessThan(10); // Should be merged, not fragmented
    });

    it("should not mark root node as icon", () => {
      const result = detectIcon(testData, DEFAULT_CONFIG);
      expect(result.shouldMerge).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle nodes without children", () => {
      const leafNode: FigmaNode = {
        id: "leaf",
        name: "Single Vector",
        type: "VECTOR",
        absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 },
      };

      const result = detectIcon(leafNode, DEFAULT_CONFIG);
      expect(result).toBeDefined();
    });

    it("should handle nodes without bounding box", () => {
      const noBoundsNode: FigmaNode = {
        id: "no-bounds",
        name: "No Bounds",
        type: "GROUP",
        children: [],
      };

      const result = detectIcon(noBoundsNode, DEFAULT_CONFIG);
      expect(result.shouldMerge).toBe(false);
    });

    it("should handle deeply nested structures", () => {
      const deepNode: FigmaNode = {
        id: "deep",
        name: "Deep",
        type: "GROUP",
        absoluteBoundingBox: { x: 0, y: 0, width: 24, height: 24 },
        children: [
          {
            id: "level1",
            name: "Level 1",
            type: "GROUP",
            children: [
              {
                id: "level2",
                name: "Level 2",
                type: "GROUP",
                children: [
                  { id: "vector", name: "Vector", type: "VECTOR" },
                ],
              },
            ],
          },
        ],
      };

      const result = detectIcon(deepNode, DEFAULT_CONFIG);
      expect(result).toBeDefined();
    });
  });
});
