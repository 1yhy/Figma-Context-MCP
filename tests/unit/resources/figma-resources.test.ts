/**
 * Figma Resources Unit Tests
 *
 * Tests the resource handlers that extract lightweight data from Figma files.
 */

import { describe, it, expect, vi } from "vitest";
import {
  getFileMetadata,
  getStyleTokens,
  getComponentList,
  getAssetList,
  createFileMetadataTemplate,
  createStylesTemplate,
  createComponentsTemplate,
  createAssetsTemplate,
  FIGMA_MCP_HELP,
} from "~/resources/figma-resources.js";
import type { SimplifiedDesign, SimplifiedNode } from "~/types/index.js";
import type { FigmaService } from "~/services/figma.js";

// ==================== Mock Types ====================

type MockFigmaService = Pick<
  FigmaService,
  "getFile" | "getNode" | "getImages" | "getImageFills" | "getRateLimitInfo"
>;

// ==================== Mock Data ====================

const createMockNode = (overrides: Partial<SimplifiedNode> = {}): SimplifiedNode => ({
  id: "node-1",
  name: "Test Node",
  type: "FRAME",
  ...overrides,
});

const createMockDesign = (overrides: Partial<SimplifiedDesign> = {}): SimplifiedDesign => ({
  name: "Test Design",
  lastModified: "2024-01-15T10:30:00Z",
  thumbnailUrl: "https://figma.com/thumbnail.png",
  nodes: [],
  ...overrides,
});

// Mock FigmaService
const createMockFigmaService = (design: SimplifiedDesign): MockFigmaService => ({
  getFile: vi.fn().mockResolvedValue(design),
  getNode: vi.fn().mockResolvedValue(design),
  getImages: vi.fn().mockResolvedValue([]),
  getImageFills: vi.fn().mockResolvedValue([]),
  getRateLimitInfo: vi.fn().mockReturnValue(null),
});

// ==================== Tests ====================

describe("Figma Resources", () => {
  describe("getFileMetadata", () => {
    it("should extract basic file metadata", async () => {
      const mockDesign = createMockDesign({
        name: "My Design File",
        lastModified: "2024-03-20T15:00:00Z",
        nodes: [
          createMockNode({
            id: "page-1",
            name: "Page 1",
            type: "CANVAS",
            children: [createMockNode(), createMockNode()],
          }),
          createMockNode({
            id: "page-2",
            name: "Page 2",
            type: "CANVAS",
            children: [createMockNode()],
          }),
        ],
      });

      const mockService = createMockFigmaService(mockDesign);
      const metadata = await getFileMetadata(mockService as FigmaService, "test-file-key");

      expect(metadata.name).toBe("My Design File");
      expect(metadata.lastModified).toBe("2024-03-20T15:00:00Z");
      expect(metadata.pages).toHaveLength(2);
      expect(metadata.pages[0]).toEqual({
        id: "page-1",
        name: "Page 1",
        childCount: 2,
      });
      expect(metadata.pages[1]).toEqual({
        id: "page-2",
        name: "Page 2",
        childCount: 1,
      });
    });

    it("should call getFile with depth 1", async () => {
      const mockDesign = createMockDesign();
      const mockService = createMockFigmaService(mockDesign);

      await getFileMetadata(mockService as FigmaService, "test-key");

      expect(mockService.getFile).toHaveBeenCalledWith("test-key", 1);
    });

    it("should handle files with no pages", async () => {
      const mockDesign = createMockDesign({ nodes: [] });
      const mockService = createMockFigmaService(mockDesign);

      const metadata = await getFileMetadata(mockService as FigmaService, "test-key");

      expect(metadata.pages).toHaveLength(0);
    });

    it("should filter out non-CANVAS nodes from pages", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({ id: "page-1", name: "Page", type: "CANVAS" }),
          createMockNode({ id: "frame-1", name: "Frame", type: "FRAME" }),
          createMockNode({ id: "page-2", name: "Page 2", type: "CANVAS" }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const metadata = await getFileMetadata(mockService as FigmaService, "test-key");

      expect(metadata.pages).toHaveLength(2);
      expect(metadata.pages.every((p) => p.name.startsWith("Page"))).toBe(true);
    });
  });

  describe("getStyleTokens", () => {
    it("should extract colors from node CSS", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            name: "Primary Button",
            css: {
              backgroundColor: "#24C790",
              color: "#FFFFFF",
            },
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const styles = await getStyleTokens(mockService as FigmaService, "test-key");

      expect(styles.colors.length).toBeGreaterThan(0);
      expect(styles.colors.some((c) => c.hex === "#24C790")).toBe(true);
    });

    it("should extract typography from node CSS", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            name: "Heading",
            css: {
              fontFamily: "Inter",
              fontSize: "24px",
              fontWeight: "700",
              lineHeight: "32px",
            },
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const styles = await getStyleTokens(mockService as FigmaService, "test-key");

      expect(styles.typography.length).toBeGreaterThan(0);
      expect(styles.typography[0]).toMatchObject({
        fontFamily: "Inter",
        fontSize: 24,
        fontWeight: 700,
      });
    });

    it("should extract shadow effects", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            name: "Card",
            css: {
              boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.1)",
            },
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const styles = await getStyleTokens(mockService as FigmaService, "test-key");

      expect(styles.effects.length).toBeGreaterThan(0);
      expect(styles.effects[0].type).toBe("shadow");
    });

    it("should deduplicate colors", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({ css: { backgroundColor: "#FF0000" } }),
          createMockNode({ css: { backgroundColor: "#FF0000" } }),
          createMockNode({ css: { backgroundColor: "#00FF00" } }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const styles = await getStyleTokens(mockService as FigmaService, "test-key");

      const redColors = styles.colors.filter((c) => c.hex === "#FF0000");
      expect(redColors.length).toBe(1);
    });

    it("should limit results to avoid token bloat", async () => {
      // Create many nodes with unique colors
      const nodes = Array.from({ length: 50 }, (_, i) =>
        createMockNode({
          name: `Node ${i}`,
          css: { backgroundColor: `#${i.toString(16).padStart(6, "0")}` },
        }),
      );
      const mockDesign = createMockDesign({ nodes });
      const mockService = createMockFigmaService(mockDesign);

      const styles = await getStyleTokens(mockService as FigmaService, "test-key");

      expect(styles.colors.length).toBeLessThanOrEqual(20);
    });

    it("should recursively extract from children", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            name: "Parent",
            children: [
              createMockNode({
                name: "Child",
                css: { backgroundColor: "#AABBCC" },
              }),
            ],
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const styles = await getStyleTokens(mockService as FigmaService, "test-key");

      expect(styles.colors.some((c) => c.hex === "#AABBCC")).toBe(true);
    });
  });

  describe("getComponentList", () => {
    it("should find COMPONENT nodes", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            id: "comp-1",
            name: "Button",
            type: "COMPONENT",
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const components = await getComponentList(mockService as FigmaService, "test-key");

      expect(components).toHaveLength(1);
      expect(components[0]).toMatchObject({
        id: "comp-1",
        name: "Button",
        type: "COMPONENT",
      });
    });

    it("should find COMPONENT_SET nodes with variants", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            id: "set-1",
            name: "Button",
            type: "COMPONENT_SET",
            children: [
              createMockNode({ name: "Primary" }),
              createMockNode({ name: "Secondary" }),
              createMockNode({ name: "Outline" }),
            ],
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const components = await getComponentList(mockService as FigmaService, "test-key");

      expect(components).toHaveLength(1);
      expect(components[0].type).toBe("COMPONENT_SET");
      expect(components[0].variants).toEqual(["Primary", "Secondary", "Outline"]);
    });

    it("should limit variants to 5", async () => {
      const variants = Array.from({ length: 10 }, (_, i) =>
        createMockNode({ name: `Variant ${i}` }),
      );
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            id: "set-1",
            name: "Button",
            type: "COMPONENT_SET",
            children: variants,
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const components = await getComponentList(mockService as FigmaService, "test-key");

      expect(components[0].variants).toHaveLength(5);
    });

    it("should find nested components", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            name: "Page",
            type: "CANVAS",
            children: [
              createMockNode({
                name: "Components",
                type: "FRAME",
                children: [
                  createMockNode({ id: "c1", name: "Button", type: "COMPONENT" }),
                  createMockNode({ id: "c2", name: "Input", type: "COMPONENT" }),
                ],
              }),
            ],
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const components = await getComponentList(mockService as FigmaService, "test-key");

      expect(components).toHaveLength(2);
    });

    it("should limit to 50 components", async () => {
      const nodes = Array.from({ length: 60 }, (_, i) =>
        createMockNode({
          id: `comp-${i}`,
          name: `Component ${i}`,
          type: "COMPONENT",
        }),
      );
      const mockDesign = createMockDesign({ nodes });
      const mockService = createMockFigmaService(mockDesign);

      const components = await getComponentList(mockService as FigmaService, "test-key");

      expect(components.length).toBeLessThanOrEqual(50);
    });
  });

  describe("getAssetList", () => {
    it("should find nodes with exportInfo", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            id: "icon-1",
            name: "arrow-right",
            type: "VECTOR",
            exportInfo: [{ format: "SVG", suffix: "" }],
            bounds: { width: 24, height: 24 },
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const assets = await getAssetList(mockService as FigmaService, "test-key");

      expect(assets).toHaveLength(1);
      expect(assets[0]).toMatchObject({
        nodeId: "icon-1",
        name: "arrow-right",
        type: "icon",
        exportFormats: ["SVG"],
      });
    });

    it("should identify icons by small size", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            id: "icon-1",
            name: "small-icon",
            type: "FRAME",
            exportInfo: [{ format: "SVG", suffix: "" }],
            bounds: { width: 32, height: 32 },
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const assets = await getAssetList(mockService as FigmaService, "test-key");

      expect(assets[0].type).toBe("icon");
    });

    it("should identify large exports as vector type", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            id: "illustration-1",
            name: "hero-image",
            type: "FRAME",
            exportInfo: [{ format: "SVG", suffix: "" }],
            bounds: { width: 400, height: 300 },
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const assets = await getAssetList(mockService as FigmaService, "test-key");

      expect(assets[0].type).toBe("vector");
    });

    it("should find nodes with imageRef", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            id: "img-1",
            name: "photo",
            type: "RECTANGLE",
            imageRef: "img:abc123",
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const assets = await getAssetList(mockService as FigmaService, "test-key");

      expect(assets).toHaveLength(1);
      expect(assets[0]).toMatchObject({
        nodeId: "img-1",
        name: "photo",
        type: "image",
        imageRef: "img:abc123",
      });
    });

    it("should find nested assets", async () => {
      const mockDesign = createMockDesign({
        nodes: [
          createMockNode({
            name: "Card",
            children: [
              createMockNode({
                id: "icon",
                name: "icon",
                type: "VECTOR",
                exportInfo: [{ format: "SVG", suffix: "" }],
              }),
              createMockNode({
                id: "image",
                name: "thumbnail",
                imageRef: "img:xyz",
              }),
            ],
          }),
        ],
      });
      const mockService = createMockFigmaService(mockDesign);

      const assets = await getAssetList(mockService as FigmaService, "test-key");

      expect(assets).toHaveLength(2);
    });

    it("should limit to 100 assets", async () => {
      const nodes = Array.from({ length: 150 }, (_, i) =>
        createMockNode({
          id: `asset-${i}`,
          name: `Asset ${i}`,
          type: "VECTOR",
          exportInfo: [{ format: "SVG", suffix: "" }],
        }),
      );
      const mockDesign = createMockDesign({ nodes });
      const mockService = createMockFigmaService(mockDesign);

      const assets = await getAssetList(mockService as FigmaService, "test-key");

      expect(assets.length).toBeLessThanOrEqual(100);
    });
  });

  describe("Resource Templates", () => {
    it("should create file metadata template with correct URI pattern", () => {
      const template = createFileMetadataTemplate();
      expect(template.uriTemplate.toString()).toBe("figma://file/{fileKey}");
    });

    it("should create styles template with correct URI pattern", () => {
      const template = createStylesTemplate();
      expect(template.uriTemplate.toString()).toBe("figma://file/{fileKey}/styles");
    });

    it("should create components template with correct URI pattern", () => {
      const template = createComponentsTemplate();
      expect(template.uriTemplate.toString()).toBe("figma://file/{fileKey}/components");
    });

    it("should create assets template with correct URI pattern", () => {
      const template = createAssetsTemplate();
      expect(template.uriTemplate.toString()).toBe("figma://file/{fileKey}/assets");
    });
  });

  describe("Help Content", () => {
    it("should contain resource documentation", () => {
      expect(FIGMA_MCP_HELP).toContain("figma://file/{fileKey}");
      expect(FIGMA_MCP_HELP).toContain("figma://file/{fileKey}/styles");
      expect(FIGMA_MCP_HELP).toContain("figma://file/{fileKey}/components");
      expect(FIGMA_MCP_HELP).toContain("figma://file/{fileKey}/assets");
    });

    it("should explain token costs", () => {
      expect(FIGMA_MCP_HELP).toContain("Token cost");
    });

    it("should explain how to get fileKey", () => {
      expect(FIGMA_MCP_HELP).toContain("fileKey");
      expect(FIGMA_MCP_HELP).toContain("figma.com");
    });
  });
});
