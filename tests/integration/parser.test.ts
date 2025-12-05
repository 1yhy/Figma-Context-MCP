/**
 * Parser Integration Tests
 *
 * Tests the complete parsing pipeline from raw Figma API response
 * to simplified node structure.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parseFigmaResponse } from "~/core/parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "../fixtures");

// Load fixtures
function loadRawData(): unknown {
  const dataPath = path.join(fixturesPath, "figma-data/real-node-data.json");
  return JSON.parse(fs.readFileSync(dataPath, "utf-8"));
}

function loadExpectedOutput(): unknown {
  const dataPath = path.join(fixturesPath, "expected/real-node-data-optimized.json");
  return JSON.parse(fs.readFileSync(dataPath, "utf-8"));
}

describe("Figma Response Parser", () => {
  let rawData: unknown;
  let expectedOutput: ReturnType<typeof loadExpectedOutput>;

  beforeAll(() => {
    rawData = loadRawData();
    expectedOutput = loadExpectedOutput();
  });

  describe("Basic Parsing", () => {
    it("should parse raw Figma response", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      expect(result).toBeDefined();
      expect(result.name).toBeDefined();
      expect(result.nodes).toBeDefined();
      expect(Array.isArray(result.nodes)).toBe(true);
    });

    it("should extract file metadata", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      expect(result.name).toBe("Vigilkids产品站");
      expect(result.lastModified).toBeDefined();
    });
  });

  describe("Node Structure", () => {
    it("should preserve node hierarchy", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      expect(result.nodes.length).toBeGreaterThan(0);

      const rootNode = result.nodes[0];
      expect(rootNode.id).toBeDefined();
      expect(rootNode.name).toBeDefined();
      expect(rootNode.type).toBeDefined();
    });

    it("should generate CSS styles", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      const rootNode = result.nodes[0];
      expect(rootNode.cssStyles).toBeDefined();
      expect(rootNode.cssStyles?.width).toBeDefined();
      expect(rootNode.cssStyles?.height).toBeDefined();
    });
  });

  describe("Data Compression", () => {
    it("should significantly reduce data size", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      const originalSize = Buffer.byteLength(JSON.stringify(rawData));
      const simplifiedSize = Buffer.byteLength(JSON.stringify(result));
      const compressionRate = ((originalSize - simplifiedSize) / originalSize) * 100;

      // Should achieve at least 70% compression
      expect(compressionRate).toBeGreaterThan(70);
    });
  });

  describe("CSS Style Generation", () => {
    it("should convert colors to hex format", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      // Find a node with background color
      const findNodeWithBg = (
        nodes: Array<{ cssStyles?: Record<string, unknown>; children?: unknown[] }>,
      ): Record<string, unknown> | null => {
        for (const node of nodes) {
          if (node.cssStyles?.backgroundColor) {
            return node.cssStyles;
          }
          if (node.children) {
            const found = findNodeWithBg(
              node.children as Array<{ cssStyles?: Record<string, unknown>; children?: unknown[] }>,
            );
            if (found) return found;
          }
        }
        return null;
      };

      const styles = findNodeWithBg(result.nodes);
      if (styles?.backgroundColor) {
        expect(styles.backgroundColor).toMatch(/^#[A-Fa-f0-9]{6}$/);
      }
    });

    it("should round pixel values to integers", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      const rootNode = result.nodes[0];
      const width = rootNode.cssStyles?.width as string;
      const height = rootNode.cssStyles?.height as string;

      // Should be integer pixel values
      expect(width).toMatch(/^\d+px$/);
      expect(height).toMatch(/^\d+px$/);
    });
  });

  describe("Layout Detection Integration", () => {
    it("should detect flex layouts in appropriate nodes", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      // Find nodes with flex properties
      const findFlexNode = (
        nodes: Array<{ cssStyles?: Record<string, unknown>; children?: unknown[] }>,
      ): Record<string, unknown> | null => {
        for (const node of nodes) {
          if (node.cssStyles?.display === "flex") {
            return node.cssStyles;
          }
          if (node.children) {
            const found = findFlexNode(
              node.children as Array<{ cssStyles?: Record<string, unknown>; children?: unknown[] }>,
            );
            if (found) return found;
          }
        }
        return null;
      };

      const flexStyles = findFlexNode(result.nodes);
      if (flexStyles) {
        expect(flexStyles.display).toBe("flex");
        expect(flexStyles.flexDirection).toBeDefined();
      }
    });
  });

  describe("Icon Detection Integration", () => {
    it("should mark icon nodes with exportInfo", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      // Find nodes with export info
      const findExportNode = (
        nodes: Array<{ exportInfo?: unknown; children?: unknown[] }>,
      ): unknown | null => {
        for (const node of nodes) {
          if (node.exportInfo) {
            return node.exportInfo;
          }
          if (node.children) {
            const found = findExportNode(
              node.children as Array<{ exportInfo?: unknown; children?: unknown[] }>,
            );
            if (found) return found;
          }
        }
        return null;
      };

      const exportInfo = findExportNode(result.nodes);
      if (exportInfo) {
        expect(exportInfo).toHaveProperty("type");
        expect(exportInfo).toHaveProperty("format");
        expect(exportInfo).toHaveProperty("fileName");
      }
    });
  });

  describe("Text Node Processing", () => {
    it("should extract text content", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      // Find text nodes
      const findTextNode = (
        nodes: Array<{ type?: string; text?: string; children?: unknown[] }>,
      ): { text?: string } | null => {
        for (const node of nodes) {
          if (node.type === "TEXT" && node.text) {
            return node;
          }
          if (node.children) {
            const found = findTextNode(
              node.children as Array<{ type?: string; text?: string; children?: unknown[] }>,
            );
            if (found) return found;
          }
        }
        return null;
      };

      const textNode = findTextNode(result.nodes);
      if (textNode) {
        expect(textNode.text).toBeDefined();
        expect(typeof textNode.text).toBe("string");
      }
    });

    it("should include font styles for text nodes", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      const findTextStyles = (
        nodes: Array<{ type?: string; cssStyles?: Record<string, unknown>; children?: unknown[] }>,
      ): Record<string, unknown> | null => {
        for (const node of nodes) {
          if (node.type === "TEXT" && node.cssStyles) {
            return node.cssStyles;
          }
          if (node.children) {
            const found = findTextStyles(
              node.children as Array<{
                type?: string;
                cssStyles?: Record<string, unknown>;
                children?: unknown[];
              }>,
            );
            if (found) return found;
          }
        }
        return null;
      };

      const textStyles = findTextStyles(result.nodes);
      if (textStyles) {
        expect(textStyles.fontFamily).toBeDefined();
        expect(textStyles.fontSize).toBeDefined();
      }
    });
  });

  describe("Output Stability", () => {
    it("should produce consistent output structure", () => {
      const result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);

      // Compare key structure with expected output
      expect(Object.keys(result)).toEqual(Object.keys(expectedOutput as object));
      expect(result.nodes.length).toBe((expectedOutput as { nodes: unknown[] }).nodes.length);
    });
  });
});
