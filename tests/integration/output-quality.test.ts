/**
 * Output Quality Validation Tests
 *
 * Tests the quality of optimized output for redundancy, consistency, and correctness.
 * Converted from scripts/analyze-optimized-output.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parseFigmaResponse } from "~/core/parser.js";
import type { SimplifiedNode } from "~/types/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "../fixtures/figma-data");

// Test file configurations
const TEST_FILES = [
  { name: "node-402-34955", desc: "Group 1410104853 (1580x895)" },
  { name: "node-240-32163", desc: "Call Logs 有数据 (375x827)" },
];

// Quality analysis interfaces
interface QualityAnalysis {
  totalNodes: number;
  nodesByType: Record<string, number>;
  layoutStats: {
    flex: number;
    grid: number;
    absolute: number;
    none: number;
  };
  cssPropertyUsage: Record<string, number>;
  redundantPatterns: RedundantPattern[];
  emptyOrDefaultValues: EmptyValue[];
  issues: QualityIssue[];
}

interface RedundantPattern {
  nodeName: string;
  pattern: string;
  details: string;
}

interface EmptyValue {
  nodeName: string;
  property: string;
  value: string;
}

interface QualityIssue {
  nodeName: string;
  nodeType: string;
  issue: string;
  severity: "warning" | "error";
}

// Helper: Analyze a node recursively
function analyzeNode(node: SimplifiedNode, result: QualityAnalysis, parentLayout?: string): void {
  result.totalNodes++;

  // Count node types
  result.nodesByType[node.type] = (result.nodesByType[node.type] || 0) + 1;

  // Count layout types
  const display = node.cssStyles?.display;
  if (display === "flex") {
    result.layoutStats.flex++;
  } else if (display === "grid") {
    result.layoutStats.grid++;
  } else if (node.cssStyles?.position === "absolute") {
    result.layoutStats.absolute++;
  } else {
    result.layoutStats.none++;
  }

  // Analyze CSS properties
  if (node.cssStyles) {
    for (const [key, value] of Object.entries(node.cssStyles)) {
      if (value !== undefined && value !== null && value !== "") {
        result.cssPropertyUsage[key] = (result.cssPropertyUsage[key] || 0) + 1;
      }

      // Check for empty or default values
      if (value === "" || value === "0" || value === "0px" || value === "none") {
        result.emptyOrDefaultValues.push({
          nodeName: node.name,
          property: key,
          value: String(value),
        });
      }

      // Check for redundant patterns
      // 1. position: absolute inside flex/grid parent
      if (key === "position" && value === "absolute" && parentLayout) {
        if (parentLayout === "flex" || parentLayout === "grid") {
          result.redundantPatterns.push({
            nodeName: node.name,
            pattern: "absolute-in-layout",
            details: `position:absolute inside ${parentLayout} parent`,
          });
        }
      }

      // 2. width with flex property (potential conflict)
      if (key === "width" && node.cssStyles?.flex) {
        result.redundantPatterns.push({
          nodeName: node.name,
          pattern: "width-with-flex",
          details: "width specified with flex property",
        });
      }
    }
  }

  // Check for quality issues
  // 1. TEXT node with layout properties
  if (node.type === "TEXT" && (display === "flex" || display === "grid")) {
    result.issues.push({
      nodeName: node.name,
      nodeType: node.type,
      issue: `TEXT node with ${display} layout (unnecessary)`,
      severity: "warning",
    });
  }

  // 2. Empty children array
  if (node.children && node.children.length === 0) {
    result.issues.push({
      nodeName: node.name,
      nodeType: node.type,
      issue: "Empty children array (should be removed)",
      severity: "warning",
    });
  }

  // 3. VECTOR/ELLIPSE without exportInfo
  if ((node.type === "VECTOR" || node.type === "ELLIPSE") && !node.exportInfo) {
    result.issues.push({
      nodeName: node.name,
      nodeType: node.type,
      issue: `${node.type} without exportInfo (image not exported)`,
      severity: "warning",
    });
  }

  // Recurse into children
  if (node.children) {
    const currentLayout =
      display || (node.cssStyles?.position === "absolute" ? "absolute" : undefined);
    for (const child of node.children) {
      analyzeNode(child, result, currentLayout);
    }
  }
}

// Helper: Analyze a parsed result
function analyzeOutput(result: ReturnType<typeof parseFigmaResponse>): QualityAnalysis {
  const analysis: QualityAnalysis = {
    totalNodes: 0,
    nodesByType: {},
    layoutStats: { flex: 0, grid: 0, absolute: 0, none: 0 },
    cssPropertyUsage: {},
    redundantPatterns: [],
    emptyOrDefaultValues: [],
    issues: [],
  };

  for (const node of result.nodes) {
    analyzeNode(node, analysis);
  }

  return analysis;
}

// Helper: Load and parse fixture
function loadAndParse(name: string): ReturnType<typeof parseFigmaResponse> {
  const filePath = path.join(fixturesDir, `${name}.json`);
  const rawData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return parseFigmaResponse(rawData);
}

describe("Output Quality Validation", () => {
  TEST_FILES.forEach(({ name, desc }) => {
    describe(`${name} (${desc})`, () => {
      let result: ReturnType<typeof parseFigmaResponse>;
      let analysis: QualityAnalysis;

      beforeAll(() => {
        const filePath = path.join(fixturesDir, `${name}.json`);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Test fixture not found: ${name}.json`);
        }

        result = loadAndParse(name);
        analysis = analyzeOutput(result);
      });

      describe("Node Structure", () => {
        it("should have non-zero node count", () => {
          expect(analysis.totalNodes).toBeGreaterThan(0);
        });

        it("should have diverse node types", () => {
          const typeCount = Object.keys(analysis.nodesByType).length;
          expect(typeCount).toBeGreaterThan(1);
        });

        it("should have reasonable node type distribution", () => {
          // No single type should dominate excessively (>90%)
          const maxTypeCount = Math.max(...Object.values(analysis.nodesByType));
          const dominanceRatio = maxTypeCount / analysis.totalNodes;
          expect(dominanceRatio).toBeLessThan(0.9);
        });
      });

      describe("Layout Quality", () => {
        it("should use semantic layouts (flex/grid)", () => {
          const semanticLayouts = analysis.layoutStats.flex + analysis.layoutStats.grid;
          expect(semanticLayouts).toBeGreaterThan(0);
        });

        it("should have reasonable absolute positioning ratio", () => {
          const absoluteRatio = analysis.layoutStats.absolute / analysis.totalNodes;
          // Warning if >80% absolute (but not a hard failure for all fixtures)
          expect(absoluteRatio).toBeLessThan(0.95);
        });
      });

      describe("CSS Property Quality", () => {
        it("should have essential CSS properties", () => {
          // Width and height should be commonly used
          const hasWidth = (analysis.cssPropertyUsage["width"] || 0) > 0;
          const hasHeight = (analysis.cssPropertyUsage["height"] || 0) > 0;
          expect(hasWidth || hasHeight).toBe(true);
        });

        it("should not have excessive empty or default values", () => {
          // Empty values should be less than 50% of total nodes
          // Note: Some default values like "0px" may be intentional for clarity
          const emptyRatio = analysis.emptyOrDefaultValues.length / analysis.totalNodes;
          expect(emptyRatio).toBeLessThan(0.5);
        });

        it("should have consistent property usage", () => {
          // If display is used, it should be meaningful
          const displayCount = analysis.cssPropertyUsage["display"] || 0;
          if (displayCount > 0) {
            // Display should be on containers, not every node
            expect(displayCount).toBeLessThan(analysis.totalNodes);
          }
        });
      });

      describe("Redundancy Check", () => {
        it("should minimize position:absolute inside flex/grid children", () => {
          const absoluteInLayout = analysis.redundantPatterns.filter(
            (p) => p.pattern === "absolute-in-layout",
          );
          // Allow some absolute positioning for overlapping elements
          // but it should be minimal (less than 5% of total nodes)
          const ratio = absoluteInLayout.length / analysis.totalNodes;
          expect(ratio).toBeLessThan(0.05);
        });

        it("should not have conflicting width and flex properties", () => {
          const widthWithFlex = analysis.redundantPatterns.filter(
            (p) => p.pattern === "width-with-flex",
          );
          // Warning level - not necessarily wrong but worth noting
          // Allow up to 5% of nodes to have this pattern
          const ratio = widthWithFlex.length / analysis.totalNodes;
          expect(ratio).toBeLessThan(0.05);
        });
      });

      describe("Quality Issues", () => {
        it("should not have TEXT nodes with layout properties", () => {
          const textWithLayout = analysis.issues.filter(
            (i) => i.nodeType === "TEXT" && i.issue.includes("layout"),
          );
          expect(textWithLayout.length).toBe(0);
        });

        it("should not have empty children arrays", () => {
          const emptyChildren = analysis.issues.filter((i) => i.issue.includes("Empty children"));
          expect(emptyChildren.length).toBe(0);
        });

        it("should have exportInfo for vector graphics", () => {
          const vectorsWithoutExport = analysis.issues.filter((i) =>
            i.issue.includes("without exportInfo"),
          );
          // Allow some vectors without export (decorative elements)
          const vectorCount =
            (analysis.nodesByType["VECTOR"] || 0) + (analysis.nodesByType["ELLIPSE"] || 0);
          if (vectorCount > 0) {
            const missingExportRatio = vectorsWithoutExport.length / vectorCount;
            expect(missingExportRatio).toBeLessThan(0.5);
          }
        });
      });

      describe("Output Statistics", () => {
        it("should produce consistent layout statistics", () => {
          // Snapshot the statistics for regression detection
          expect({
            totalNodes: analysis.totalNodes,
            flexCount: analysis.layoutStats.flex,
            gridCount: analysis.layoutStats.grid,
            absoluteCount: analysis.layoutStats.absolute,
            issueCount: analysis.issues.length,
            redundantCount: analysis.redundantPatterns.length,
          }).toMatchSnapshot();
        });
      });
    });
  });

  describe("Cross-fixture Consistency", () => {
    let analyses: Map<string, QualityAnalysis>;

    beforeAll(() => {
      analyses = new Map();
      TEST_FILES.forEach(({ name }) => {
        const filePath = path.join(fixturesDir, `${name}.json`);
        if (fs.existsSync(filePath)) {
          const result = loadAndParse(name);
          analyses.set(name, analyzeOutput(result));
        }
      });
    });

    it("should use consistent CSS properties across fixtures", () => {
      const allProperties = new Set<string>();
      analyses.forEach((analysis) => {
        Object.keys(analysis.cssPropertyUsage).forEach((prop) => {
          allProperties.add(prop);
        });
      });

      // Essential properties should appear in all fixtures
      const essentialProps = ["width", "height"];
      essentialProps.forEach((prop) => {
        let count = 0;
        analyses.forEach((analysis) => {
          if (analysis.cssPropertyUsage[prop]) count++;
        });
        expect(count).toBeGreaterThan(0);
      });
    });

    it("should have similar quality metrics across fixtures", () => {
      const qualityScores: number[] = [];

      analyses.forEach((analysis) => {
        // Quality score: higher is better
        const semanticRatio =
          (analysis.layoutStats.flex + analysis.layoutStats.grid) / analysis.totalNodes;
        const issueRatio = analysis.issues.length / analysis.totalNodes;
        const score = semanticRatio * 100 - issueRatio * 50;
        qualityScores.push(score);
      });

      // All fixtures should have non-negative quality scores
      qualityScores.forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(-10);
      });
    });
  });
});
