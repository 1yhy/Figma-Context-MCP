/**
 * Icon Detection Optimization Tests
 *
 * Verifies that the optimized collectNodeStats() function produces
 * identical results to the original individual functions.
 */

import { describe, it, expect } from "vitest";

// Test the internal implementation
// We'll create mock nodes and verify the stats are correctly computed

interface MockNode {
  id: string;
  name: string;
  type: string;
  children?: MockNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  fills?: Array<{ type: string; visible?: boolean; imageRef?: string }>;
  effects?: Array<{ type: string; visible?: boolean }>;
}

// Helper functions to test (matching the original implementations)
const CONTAINER_TYPES = ["GROUP", "FRAME", "COMPONENT", "INSTANCE"];
const MERGEABLE_TYPES = [
  "VECTOR",
  "RECTANGLE",
  "ELLIPSE",
  "LINE",
  "POLYGON",
  "STAR",
  "BOOLEAN_OPERATION",
  "REGULAR_POLYGON",
];
const EXCLUDE_TYPES = ["TEXT", "COMPONENT", "INSTANCE"];
const PNG_REQUIRED_EFFECTS = ["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"];

function isContainerType(type: string): boolean {
  return CONTAINER_TYPES.includes(type);
}

function isMergeableType(type: string): boolean {
  return MERGEABLE_TYPES.includes(type);
}

function isExcludeType(type: string): boolean {
  return EXCLUDE_TYPES.includes(type);
}

function hasImageFill(node: MockNode): boolean {
  if (!node.fills) return false;
  return node.fills.some(
    (fill) => fill.type === "IMAGE" && fill.visible !== false && fill.imageRef,
  );
}

function hasComplexEffects(node: MockNode): boolean {
  if (!node.effects) return false;
  return node.effects.some(
    (effect) => effect.visible !== false && PNG_REQUIRED_EFFECTS.includes(effect.type),
  );
}

// Original functions (for comparison)
function calculateDepthOriginal(node: MockNode, currentDepth: number = 0): number {
  if (!node.children || node.children.length === 0) {
    return currentDepth;
  }
  return Math.max(...node.children.map((child) => calculateDepthOriginal(child, currentDepth + 1)));
}

function countTotalChildrenOriginal(node: MockNode): number {
  if (!node.children || node.children.length === 0) {
    return 0;
  }
  return node.children.reduce((sum, child) => sum + 1 + countTotalChildrenOriginal(child), 0);
}

function hasExcludeTypeInTreeOriginal(node: MockNode): boolean {
  if (isExcludeType(node.type)) {
    return true;
  }
  if (node.children) {
    return node.children.some((child) => hasExcludeTypeInTreeOriginal(child));
  }
  return false;
}

function hasImageFillInTreeOriginal(node: MockNode): boolean {
  if (hasImageFill(node)) {
    return true;
  }
  if (node.children) {
    return node.children.some((child) => hasImageFillInTreeOriginal(child));
  }
  return false;
}

function hasComplexEffectsInTreeOriginal(node: MockNode): boolean {
  if (hasComplexEffects(node)) {
    return true;
  }
  if (node.children) {
    return node.children.some((child) => hasComplexEffectsInTreeOriginal(child));
  }
  return false;
}

function areAllLeavesMergeableOriginal(node: MockNode): boolean {
  if (!node.children || node.children.length === 0) {
    return isMergeableType(node.type);
  }
  if (isContainerType(node.type)) {
    return node.children.every((child) => areAllLeavesMergeableOriginal(child));
  }
  return isMergeableType(node.type);
}

// Optimized single-pass function
interface NodeTreeStats {
  depth: number;
  totalChildren: number;
  hasExcludeType: boolean;
  hasImageFill: boolean;
  hasComplexEffects: boolean;
  allLeavesMergeable: boolean;
  mergeableRatio: number;
}

function collectNodeStats(node: MockNode): NodeTreeStats {
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

  const childStats = node.children.map(collectNodeStats);
  const maxChildDepth = Math.max(...childStats.map((s) => s.depth));
  const totalDescendants = childStats.reduce((sum, s) => sum + 1 + s.totalChildren, 0);
  const hasExcludeInChildren = childStats.some((s) => s.hasExcludeType);
  const hasImageInChildren = childStats.some((s) => s.hasImageFill);
  const hasEffectsInChildren = childStats.some((s) => s.hasComplexEffects);
  const allChildrenMergeable = childStats.every((s) => s.allLeavesMergeable);

  const mergeableCount = node.children.filter(
    (child) => isMergeableType(child.type) || isContainerType(child.type),
  ).length;
  const mergeableRatio = mergeableCount / node.children.length;

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

describe("Icon Detection Optimization", () => {
  describe("collectNodeStats equivalence", () => {
    const testCases: { name: string; node: MockNode }[] = [
      {
        name: "simple leaf node",
        node: {
          id: "1",
          name: "Vector",
          type: "VECTOR",
        },
      },
      {
        name: "leaf node with excludable type",
        node: {
          id: "1",
          name: "Text",
          type: "TEXT",
        },
      },
      {
        name: "container with vector children",
        node: {
          id: "1",
          name: "Group",
          type: "GROUP",
          children: [
            { id: "2", name: "Vector1", type: "VECTOR" },
            { id: "3", name: "Vector2", type: "VECTOR" },
          ],
        },
      },
      {
        name: "nested container",
        node: {
          id: "1",
          name: "Frame",
          type: "FRAME",
          children: [
            {
              id: "2",
              name: "Group",
              type: "GROUP",
              children: [
                { id: "3", name: "Ellipse", type: "ELLIPSE" },
                { id: "4", name: "Rect", type: "RECTANGLE" },
              ],
            },
          ],
        },
      },
      {
        name: "container with text child",
        node: {
          id: "1",
          name: "Button",
          type: "FRAME",
          children: [
            { id: "2", name: "BG", type: "RECTANGLE" },
            { id: "3", name: "Label", type: "TEXT" },
          ],
        },
      },
      {
        name: "node with image fill",
        node: {
          id: "1",
          name: "Image",
          type: "RECTANGLE",
          fills: [{ type: "IMAGE", visible: true, imageRef: "abc123" }],
        },
      },
      {
        name: "node with complex effects",
        node: {
          id: "1",
          name: "Shadow Box",
          type: "FRAME",
          effects: [{ type: "DROP_SHADOW", visible: true }],
          children: [{ id: "2", name: "Content", type: "RECTANGLE" }],
        },
      },
      {
        name: "deeply nested structure",
        node: {
          id: "1",
          name: "Root",
          type: "FRAME",
          children: [
            {
              id: "2",
              name: "Level1",
              type: "GROUP",
              children: [
                {
                  id: "3",
                  name: "Level2",
                  type: "GROUP",
                  children: [
                    {
                      id: "4",
                      name: "Level3",
                      type: "GROUP",
                      children: [{ id: "5", name: "Leaf", type: "VECTOR" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ];

    testCases.forEach(({ name, node }) => {
      it(`should produce equivalent results for: ${name}`, () => {
        const stats = collectNodeStats(node);

        // Compare with original functions
        expect(stats.depth).toBe(calculateDepthOriginal(node));
        expect(stats.totalChildren).toBe(countTotalChildrenOriginal(node));
        expect(stats.hasExcludeType).toBe(hasExcludeTypeInTreeOriginal(node));
        expect(stats.hasImageFill).toBe(hasImageFillInTreeOriginal(node));
        expect(stats.hasComplexEffects).toBe(hasComplexEffectsInTreeOriginal(node));
        expect(stats.allLeavesMergeable).toBe(areAllLeavesMergeableOriginal(node));
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty children array", () => {
      const node: MockNode = {
        id: "1",
        name: "Empty",
        type: "GROUP",
        children: [],
      };

      const stats = collectNodeStats(node);
      expect(stats.depth).toBe(0);
      expect(stats.totalChildren).toBe(0);
    });

    it("should handle invisible fills", () => {
      const node: MockNode = {
        id: "1",
        name: "Hidden Image",
        type: "RECTANGLE",
        fills: [{ type: "IMAGE", visible: false, imageRef: "abc123" }],
      };

      const stats = collectNodeStats(node);
      expect(stats.hasImageFill).toBe(false);
    });

    it("should handle invisible effects", () => {
      const node: MockNode = {
        id: "1",
        name: "Hidden Shadow",
        type: "RECTANGLE",
        effects: [{ type: "DROP_SHADOW", visible: false }],
      };

      const stats = collectNodeStats(node);
      expect(stats.hasComplexEffects).toBe(false);
    });

    it("should calculate correct mergeable ratio", () => {
      const node: MockNode = {
        id: "1",
        name: "Mixed",
        type: "FRAME",
        children: [
          { id: "2", name: "V1", type: "VECTOR" },
          { id: "3", name: "V2", type: "VECTOR" },
          { id: "4", name: "Unknown", type: "UNKNOWN_TYPE" },
          { id: "5", name: "G1", type: "GROUP" },
        ],
      };

      const stats = collectNodeStats(node);
      // 3 mergeable (2 VECTOR + 1 GROUP) out of 4
      expect(stats.mergeableRatio).toBe(0.75);
    });
  });
});
