/**
 * Figma Resources - Expose Figma data as MCP Resources
 * Resources are lightweight, on-demand data sources that save tokens
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaService } from "../services/figma.js";
import type { SimplifiedNode } from "../types/index.js";

// ==================== Types ====================

export interface FileMetadata {
  name: string;
  lastModified: string;
  version: string;
  pages: Array<{ id: string; name: string; childCount: number }>;
  thumbnailUrl?: string;
}

export interface StyleTokens {
  colors: Array<{ name: string; value: string; hex: string }>;
  typography: Array<{
    name: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight?: number;
  }>;
  effects: Array<{ name: string; type: string; value: string }>;
}

export interface ComponentSummary {
  id: string;
  name: string;
  description?: string;
  type: "COMPONENT" | "COMPONENT_SET";
  variants?: string[];
}

// ==================== Resource Handlers ====================

/**
 * Extract file metadata (lightweight, ~200 tokens)
 */
export async function getFileMetadata(
  figmaService: FigmaService,
  fileKey: string,
): Promise<FileMetadata> {
  const file = await figmaService.getFile(fileKey, 1); // depth=1 for minimal data

  const pages = file.nodes
    .filter((node) => node.type === "CANVAS")
    .map((page) => ({
      id: page.id,
      name: page.name,
      childCount: page.children?.length ?? 0,
    }));

  return {
    name: file.name,
    lastModified: file.lastModified,
    version: file.version ?? "",
    pages,
  };
}

/**
 * Extract style tokens from file (colors, typography, effects) (~500 tokens)
 */
export async function getStyleTokens(
  figmaService: FigmaService,
  fileKey: string,
): Promise<StyleTokens> {
  const file = await figmaService.getFile(fileKey, 3); // Need some depth for styles

  const colors: StyleTokens["colors"] = [];
  const typography: StyleTokens["typography"] = [];
  const effects: StyleTokens["effects"] = [];
  const seenColors = new Set<string>();
  const seenFonts = new Set<string>();

  function extractFromNode(node: SimplifiedNode) {
    // Extract colors from fills
    if (node.cssStyles) {
      const bgColor = node.cssStyles.background || node.cssStyles.backgroundColor;
      if (bgColor && !seenColors.has(bgColor)) {
        seenColors.add(bgColor);
        colors.push({
          name: node.name || "unnamed",
          value: bgColor,
          hex: bgColor,
        });
      }

      const textColor = node.cssStyles.color;
      if (textColor && !seenColors.has(textColor)) {
        seenColors.add(textColor);
        colors.push({
          name: `${node.name || "text"}-color`,
          value: textColor,
          hex: textColor,
        });
      }

      // Extract typography
      if (node.cssStyles.fontFamily && node.cssStyles.fontSize) {
        const fontKey = `${node.cssStyles.fontFamily}-${node.cssStyles.fontSize}-${node.cssStyles.fontWeight || 400}`;
        if (!seenFonts.has(fontKey)) {
          seenFonts.add(fontKey);
          typography.push({
            name: node.name || "text",
            fontFamily: node.cssStyles.fontFamily,
            fontSize: parseFloat(String(node.cssStyles.fontSize)) || 14,
            fontWeight: parseFloat(String(node.cssStyles.fontWeight)) || 400,
            lineHeight: node.cssStyles.lineHeight
              ? parseFloat(String(node.cssStyles.lineHeight))
              : undefined,
          });
        }
      }

      // Extract effects (shadows, blur)
      if (node.cssStyles.boxShadow) {
        effects.push({
          name: `${node.name || "element"}-shadow`,
          type: "shadow",
          value: String(node.cssStyles.boxShadow),
        });
      }
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        extractFromNode(child);
      }
    }
  }

  for (const node of file.nodes) {
    extractFromNode(node);
  }

  // Limit results to avoid token bloat
  return {
    colors: colors.slice(0, 20),
    typography: typography.slice(0, 10),
    effects: effects.slice(0, 10),
  };
}

/**
 * Extract component list (~300 tokens)
 */
export async function getComponentList(
  figmaService: FigmaService,
  fileKey: string,
): Promise<ComponentSummary[]> {
  const file = await figmaService.getFile(fileKey, 5); // Need depth for components
  const components: ComponentSummary[] = [];

  function findComponents(node: SimplifiedNode) {
    if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
      components.push({
        id: node.id,
        name: node.name,
        type: node.type as "COMPONENT" | "COMPONENT_SET",
        variants:
          node.type === "COMPONENT_SET" ? node.children?.map((c) => c.name).slice(0, 5) : undefined,
      });
    }

    if (node.children) {
      for (const child of node.children) {
        findComponents(child);
      }
    }
  }

  for (const node of file.nodes) {
    findComponents(node);
  }

  return components.slice(0, 50); // Limit to 50 components
}

/**
 * Extract images/assets list (~400 tokens)
 */
export async function getAssetList(
  figmaService: FigmaService,
  fileKey: string,
): Promise<
  Array<{
    nodeId: string;
    name: string;
    type: "vector" | "image" | "icon";
    exportFormats: string[];
    imageRef?: string;
  }>
> {
  const file = await figmaService.getFile(fileKey, 5);
  const assets: Array<{
    nodeId: string;
    name: string;
    type: "vector" | "image" | "icon";
    exportFormats: string[];
    imageRef?: string;
  }> = [];

  function findAssets(node: SimplifiedNode) {
    // Check for exportable assets (exportInfo is a single object, not array)
    if (node.exportInfo) {
      const isIcon =
        node.type === "VECTOR" ||
        node.type === "BOOLEAN_OPERATION" ||
        node.exportInfo.type === "IMAGE";

      assets.push({
        nodeId: node.id,
        name: node.name,
        type: isIcon ? "icon" : "vector",
        exportFormats: [node.exportInfo.format],
      });
    }

    // Check for image fills in fills array
    const imageFill = node.fills?.find(
      (fill): fill is { type: "IMAGE"; imageRef?: string } =>
        typeof fill === "object" && "type" in fill && fill.type === "IMAGE",
    );
    if (imageFill?.imageRef) {
      assets.push({
        nodeId: node.id,
        name: node.name,
        type: "image",
        exportFormats: ["png", "jpg"],
        imageRef: imageFill.imageRef,
      });
    }

    if (node.children) {
      for (const child of node.children) {
        findAssets(child);
      }
    }
  }

  for (const node of file.nodes) {
    findAssets(node);
  }

  return assets.slice(0, 100); // Limit to 100 assets
}

// ==================== Resource Templates ====================

/**
 * Create resource template for file metadata
 */
export function createFileMetadataTemplate(): ResourceTemplate {
  return new ResourceTemplate("figma://file/{fileKey}", {
    list: undefined, // Can't list all files without user's file list
    complete: {
      fileKey: async () => [], // Could be enhanced with recent files
    },
  });
}

/**
 * Create resource template for style tokens
 */
export function createStylesTemplate(): ResourceTemplate {
  return new ResourceTemplate("figma://file/{fileKey}/styles", {
    list: undefined,
    complete: {
      fileKey: async () => [],
    },
  });
}

/**
 * Create resource template for components
 */
export function createComponentsTemplate(): ResourceTemplate {
  return new ResourceTemplate("figma://file/{fileKey}/components", {
    list: undefined,
    complete: {
      fileKey: async () => [],
    },
  });
}

/**
 * Create resource template for assets
 */
export function createAssetsTemplate(): ResourceTemplate {
  return new ResourceTemplate("figma://file/{fileKey}/assets", {
    list: undefined,
    complete: {
      fileKey: async () => [],
    },
  });
}

// ==================== Help Content ====================

export const FIGMA_MCP_HELP = `# Figma MCP Server - Resource Guide

## Available Resources

### File Metadata
\`figma://file/{fileKey}\`
Returns: File name, pages, last modified date
Token cost: ~200

### Design Tokens (Styles)
\`figma://file/{fileKey}/styles\`
Returns: Colors, typography, effects extracted from file
Token cost: ~500

### Component List
\`figma://file/{fileKey}/components\`
Returns: All components and component sets with variants
Token cost: ~300

### Asset List
\`figma://file/{fileKey}/assets\`
Returns: Exportable images, icons, vectors with node IDs
Token cost: ~400

## How to Get fileKey

From Figma URL: \`figma.com/file/{fileKey}/...\`
Or: \`figma.com/design/{fileKey}/...\`

## Example Usage

1. Read file metadata: \`figma://file/abc123\`
2. Get color palette: \`figma://file/abc123/styles\`
3. List components: \`figma://file/abc123/components\`
4. Find assets to download: \`figma://file/abc123/assets\`

## Tools vs Resources

- **Resources**: Read-only data, user-controlled, lightweight
- **Tools**: Actions (download images), AI-controlled, heavier

Use Resources for exploration, Tools for execution.
`;
