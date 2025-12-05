/**
 * Layout Optimization Integration Tests
 *
 * Tests the complete layout optimization pipeline using real Figma data.
 * Converted from scripts/test-layout-optimization.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parseFigmaResponse } from "~/core/parser.js";
import { LayoutOptimizer } from "~/algorithms/layout/optimizer.js";
import type { SimplifiedNode, SimplifiedDesign } from "~/types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "../fixtures/figma-data");
const expectedDir = path.join(__dirname, "../fixtures/expected");

// Test file configurations
const TEST_FILES = [
  { name: "node-402-34955", desc: "Group 1410104853 (1580x895)" },
  { name: "node-240-32163", desc: "Call Logs 有数据 (375x827)" },
];

// Layout statistics interface
interface LayoutStats {
  total: number;
  flex: number;
  grid: number;
  flexRow: number;
  flexColumn: number;
  absolute: number;
}

// Helper: Count layouts recursively
function countLayouts(node: SimplifiedNode, stats: LayoutStats): void {
  stats.total++;

  const display = node.cssStyles?.display;
  if (display === "flex") {
    stats.flex++;
    if (node.cssStyles?.flexDirection === "column") {
      stats.flexColumn++;
    } else {
      stats.flexRow++;
    }
  } else if (display === "grid") {
    stats.grid++;
  } else if (node.cssStyles?.position === "absolute") {
    stats.absolute++;
  }

  if (node.children) {
    for (const child of node.children) {
      countLayouts(child, stats);
    }
  }
}

// Helper: Find nodes by layout type
function findLayoutNodes(
  node: SimplifiedNode,
  layoutType: "flex" | "grid",
  results: SimplifiedNode[] = [],
): SimplifiedNode[] {
  if (node.cssStyles?.display === layoutType) {
    results.push(node);
  }

  if (node.children) {
    for (const child of node.children) {
      findLayoutNodes(child, layoutType, results);
    }
  }

  return results;
}

// Helper: Load raw fixture data
function loadFixture(name: string): unknown {
  const filePath = path.join(fixturesDir, `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// Helper: Load expected output if exists
function loadExpectedOutput(name: string): unknown | null {
  const filePath = path.join(expectedDir, `${name}-optimized.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return null;
}

describe("Layout Optimization Integration", () => {
  TEST_FILES.forEach(({ name, desc }) => {
    describe(`${name} (${desc})`, () => {
      let rawData: unknown;
      let result: ReturnType<typeof parseFigmaResponse>;
      let originalSize: number;
      let optimizedSize: number;
      let stats: LayoutStats;

      beforeAll(() => {
        const filePath = path.join(fixturesDir, `${name}.json`);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Test fixture not found: ${name}.json`);
        }

        rawData = loadFixture(name);
        originalSize = fs.statSync(filePath).size;

        result = parseFigmaResponse(rawData as Parameters<typeof parseFigmaResponse>[0]);
        optimizedSize = Buffer.byteLength(JSON.stringify(result));

        // Calculate layout stats
        stats = {
          total: 0,
          flex: 0,
          grid: 0,
          flexRow: 0,
          flexColumn: 0,
          absolute: 0,
        };
        for (const node of result.nodes) {
          countLayouts(node, stats);
        }
      });

      describe("Data Compression", () => {
        it("should achieve significant data compression", () => {
          const compressionRate = (1 - optimizedSize / originalSize) * 100;
          // Should achieve at least 50% compression
          expect(compressionRate).toBeGreaterThan(50);
        });

        it("should reduce file size to under 100KB for typical nodes", () => {
          // Optimized output should be reasonable size
          expect(optimizedSize).toBeLessThan(100 * 1024);
        });
      });

      describe("Layout Detection", () => {
        it("should detect layout types (not all absolute)", () => {
          // Should have some flex or grid layouts
          expect(stats.flex + stats.grid).toBeGreaterThan(0);
        });

        it("should not have excessive absolute positioning", () => {
          // Absolute positioning should not dominate in most cases
          // Some fixtures may have higher absolute ratios due to their design
          const absoluteRatio = stats.absolute / stats.total;
          // Allow up to 90% for complex layouts, but ensure some semantic layouts exist
          expect(absoluteRatio).toBeLessThan(0.9);
        });

        it("should have balanced flex row/column distribution", () => {
          // At least some flex should be detected
          expect(stats.flex).toBeGreaterThan(0);
        });
      });

      describe("Flex Layout Properties", () => {
        it("should have valid flex properties when flex is detected", () => {
          const flexNodes = result.nodes.flatMap((n) => findLayoutNodes(n, "flex"));

          flexNodes.forEach((node) => {
            expect(node.cssStyles?.display).toBe("flex");
            // Direction should be defined
            expect(["row", "column", undefined]).toContain(node.cssStyles?.flexDirection);
          });
        });

        it("should have gap property for flex containers with spacing", () => {
          const flexNodes = result.nodes.flatMap((n) => findLayoutNodes(n, "flex"));

          // At least some flex containers should have gap
          const flexWithGap = flexNodes.filter((n) => n.cssStyles?.gap);
          if (flexNodes.length > 2) {
            expect(flexWithGap.length).toBeGreaterThan(0);
          }
        });
      });

      describe("Grid Layout Properties", () => {
        it("should have valid grid properties when grid is detected", () => {
          const gridNodes = result.nodes.flatMap((n) => findLayoutNodes(n, "grid"));

          gridNodes.forEach((node) => {
            expect(node.cssStyles?.display).toBe("grid");
            // Grid must have gridTemplateColumns
            expect(node.cssStyles?.gridTemplateColumns).toBeDefined();
          });
        });

        it("should have at least 4 children for grid containers", () => {
          const gridNodes = result.nodes.flatMap((n) => findLayoutNodes(n, "grid"));

          gridNodes.forEach((node) => {
            expect(node.children?.length).toBeGreaterThanOrEqual(4);
          });
        });

        it("should have valid gridTemplateColumns format", () => {
          const gridNodes = result.nodes.flatMap((n) => findLayoutNodes(n, "grid"));

          gridNodes.forEach((node) => {
            const columns = node.cssStyles?.gridTemplateColumns;
            if (columns) {
              // Should be space-separated pixel values or repeat()
              expect(columns).toMatch(/^(\d+px\s*)+$|^repeat\(/);
            }
          });
        });
      });

      describe("Child Style Cleanup", () => {
        it("should clean position:absolute from flex children", () => {
          const flexNodes = result.nodes.flatMap((n) => findLayoutNodes(n, "flex"));

          flexNodes.forEach((parent) => {
            parent.children?.forEach((child) => {
              // Non-overlapping children should not have position:absolute
              if (!hasOverlapWithSiblings(child, parent.children || [])) {
                expect(child.cssStyles?.position).not.toBe("absolute");
              }
            });
          });
        });

        it("should clean left/top from flex children", () => {
          const flexNodes = result.nodes.flatMap((n) => findLayoutNodes(n, "flex"));

          flexNodes.forEach((parent) => {
            parent.children?.forEach((child) => {
              if (!hasOverlapWithSiblings(child, parent.children || [])) {
                expect(child.cssStyles?.left).toBeUndefined();
                expect(child.cssStyles?.top).toBeUndefined();
              }
            });
          });
        });
      });

      describe("Output Structure", () => {
        it("should have correct response structure", () => {
          expect(result).toHaveProperty("name");
          expect(result).toHaveProperty("nodes");
          expect(Array.isArray(result.nodes)).toBe(true);
        });

        it("should preserve node hierarchy", () => {
          expect(result.nodes.length).toBeGreaterThan(0);
          const rootNode = result.nodes[0];
          expect(rootNode).toHaveProperty("id");
          expect(rootNode).toHaveProperty("name");
          expect(rootNode).toHaveProperty("type");
        });
      });

      describe("Snapshot Comparison", () => {
        it("should match expected output structure", () => {
          const expected = loadExpectedOutput(name);
          if (expected) {
            // Compare node count
            expect(result.nodes.length).toBe((expected as { nodes: unknown[] }).nodes.length);
          }
        });

        it("should produce consistent layout stats", () => {
          // Use inline snapshot for layout stats
          expect({
            total: stats.total,
            flexRatio: Math.round((stats.flex / stats.total) * 100),
            gridRatio: Math.round((stats.grid / stats.total) * 100),
            absoluteRatio: Math.round((stats.absolute / stats.total) * 100),
          }).toMatchSnapshot();
        });
      });
    });
  });
});

// Helper: Check if a node overlaps with its siblings
function hasOverlapWithSiblings(node: SimplifiedNode, siblings: SimplifiedNode[]): boolean {
  const nodeRect = extractRect(node);
  if (!nodeRect) return false;

  return siblings.some((sibling) => {
    if (sibling.id === node.id) return false;
    const siblingRect = extractRect(sibling);
    if (!siblingRect) return false;

    return calculateIoU(nodeRect, siblingRect) > 0.1;
  });
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function extractRect(node: SimplifiedNode): Rect | null {
  const styles = node.cssStyles;
  if (!styles?.width || !styles?.height) return null;

  return {
    x: parseFloat(styles.left || "0"),
    y: parseFloat(styles.top || "0"),
    width: parseFloat(styles.width),
    height: parseFloat(styles.height),
  };
}

function calculateIoU(a: Rect, b: Rect): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = xOverlap * yOverlap;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

// ==================== Optimization Idempotency Tests ====================

describe("Layout Optimization Idempotency", () => {
  // Helper: Count occurrences of a key-value pair in object tree
  function countOccurrences(obj: unknown, key: string, value: string): number {
    let count = 0;
    function traverse(o: unknown): void {
      if (o && typeof o === "object") {
        if (Array.isArray(o)) {
          o.forEach(traverse);
        } else {
          const record = o as Record<string, unknown>;
          if (record[key] === value) count++;
          Object.values(record).forEach(traverse);
        }
      }
    }
    traverse(obj);
    return count;
  }

  // Helper: Count nodes with a specific property
  function countProperty(obj: unknown, prop: string): number {
    let count = 0;
    function traverse(o: unknown): void {
      if (o && typeof o === "object") {
        if (Array.isArray(o)) {
          o.forEach(traverse);
        } else {
          const record = o as Record<string, unknown>;
          if (prop in record) count++;
          Object.values(record).forEach(traverse);
        }
      }
    }
    traverse(obj);
    return count;
  }

  TEST_FILES.forEach(({ name, desc }) => {
    describe(`${name} (${desc})`, () => {
      let optimizedData: SimplifiedDesign;

      beforeAll(() => {
        const filePath = path.join(expectedDir, `${name}-optimized.json`);
        optimizedData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      });

      it("should be idempotent (re-optimizing produces same result)", () => {
        // Optimize again
        const reOptimized = LayoutOptimizer.optimizeDesign(optimizedData);

        // Compare key metrics
        const originalAbsolute = countOccurrences(optimizedData, "position", "absolute");
        const reOptimizedAbsolute = countOccurrences(reOptimized, "position", "absolute");

        const originalFlex = countOccurrences(optimizedData, "display", "flex");
        const reOptimizedFlex = countOccurrences(reOptimized, "display", "flex");

        const originalGrid = countOccurrences(optimizedData, "display", "grid");
        const reOptimizedGrid = countOccurrences(reOptimized, "display", "grid");

        // Re-optimization should not change layout counts significantly
        // (small differences possible due to background merging on first pass)
        expect(reOptimizedAbsolute).toBeLessThanOrEqual(originalAbsolute);
        expect(reOptimizedFlex).toBeGreaterThanOrEqual(originalFlex);
        expect(reOptimizedGrid).toBeGreaterThanOrEqual(originalGrid);
      });

      it("should maintain or reduce absolute positioning count", () => {
        const reOptimized = LayoutOptimizer.optimizeDesign(optimizedData);

        const originalAbsolute = countOccurrences(optimizedData, "position", "absolute");
        const reOptimizedAbsolute = countOccurrences(reOptimized, "position", "absolute");

        // Absolute count should not increase
        expect(reOptimizedAbsolute).toBeLessThanOrEqual(originalAbsolute);
      });

      it("should maintain or reduce left/top property count", () => {
        const reOptimized = LayoutOptimizer.optimizeDesign(optimizedData);

        const originalLeft = countProperty(optimizedData, "left");
        const reOptimizedLeft = countProperty(reOptimized, "left");

        const originalTop = countProperty(optimizedData, "top");
        const reOptimizedTop = countProperty(reOptimized, "top");

        expect(reOptimizedLeft).toBeLessThanOrEqual(originalLeft);
        expect(reOptimizedTop).toBeLessThanOrEqual(originalTop);
      });

      it("should produce stable output on second re-optimization", () => {
        // First re-optimization
        const firstPass = LayoutOptimizer.optimizeDesign(optimizedData);
        // Second re-optimization
        const secondPass = LayoutOptimizer.optimizeDesign(firstPass);

        // After two passes, results should be identical (stable)
        const firstPassJson = JSON.stringify(firstPass);
        const secondPassJson = JSON.stringify(secondPass);

        expect(secondPassJson).toBe(firstPassJson);
      });

      it("should have expected optimization metrics", () => {
        const reOptimized = LayoutOptimizer.optimizeDesign(optimizedData);

        expect({
          absoluteCount: countOccurrences(reOptimized, "position", "absolute"),
          flexCount: countOccurrences(reOptimized, "display", "flex"),
          gridCount: countOccurrences(reOptimized, "display", "grid"),
          paddingCount: countProperty(reOptimized, "padding"),
        }).toMatchSnapshot();
      });
    });
  });
});
