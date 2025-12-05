import type {
  GetFileNodesResponse,
  Node as FigmaDocumentNode,
  GetFileResponse,
  Paint,
} from "@figma/rest-api-spec";
import {
  isVisible,
  convertColor,
  formatRGBAColor,
  generateCSSShorthand,
  isVisibleInParent
} from "~/utils/common.js";
import { isRectangleCornerRadii, hasValue } from "~/utils/identity.js";
import { buildSimplifiedEffects } from "~/core/effects.js";
import { buildSimplifiedStrokes } from "~/core/style.js";
import { generateFileName } from "~/utils/file.js";
import {
  hasImageFill,
  detectAndMarkImageGroup as markImageGroup,
  sortNodesByPosition,
  cleanupTemporaryProperties
} from "~/core/node.js";
import { LayoutOptimizer } from "~/core/layout-optimizer.js";
import { formatPxValue } from "~/utils/css-optimize.js";
import {
  analyzeNodeTree,
  type FigmaNode,
} from "~/algorithms/icon/index.js";

// Import types from centralized types module
import type {
  CSSStyle,
  TextStyle,
  SimplifiedDesign,
  SimplifiedNode,
  SimplifiedFill,
  ExportInfo,
  ImageResource,
  IconDetectionResult,
  FigmaNodeType,
} from "~/types/index.js";

// Re-export types for backward compatibility
export type {
  CSSStyle,
  TextStyle,
  SimplifiedDesign,
  SimplifiedNode,
  SimplifiedFill,
  ExportInfo,
  ImageResource,
  FigmaNodeType,
};

// ---------------------- PARSING ----------------------
export function parseFigmaResponse(data: GetFileResponse | GetFileNodesResponse): SimplifiedDesign {
  // Extract basic information
  const { name, lastModified, thumbnailUrl } = data;

  // Process nodes
  let nodes: FigmaDocumentNode[] = [];
  if ('document' in data) {
    // If it's a response for the entire file
    nodes = data.document.children;
  } else if ('nodes' in data) {
    // If it's a response for specific nodes
    const nodeData = Object.values(data.nodes).filter(
      (node): node is { document: FigmaDocumentNode } =>
        node !== null && typeof node === 'object' && 'document' in node
    );

    nodes = nodeData.map(n => n.document);
  }

  // Use the new icon detection algorithm to analyze the node tree
  // Build icon ID map for fast lookup
  const iconMap = new Map<string, IconDetectionResult>();
  for (const node of nodes) {
    const { exportableIcons } = analyzeNodeTree(node as unknown as FigmaNode);
    for (const icon of exportableIcons) {
      iconMap.set(icon.nodeId, icon);
    }
  }

  // Extract nodes and generate simplified data, passing in the icon map
  const simplifiedNodes = extractNodes(nodes, undefined, iconMap);

  // Clean up temporary properties
  simplifiedNodes.forEach(cleanupTemporaryProperties);

  // Apply layout optimization
  const optimizedDesign = LayoutOptimizer.optimizeDesign({
    name,
    lastModified,
    thumbnailUrl: thumbnailUrl || '',
    nodes: simplifiedNodes
  });

  return optimizedDesign;
}

// Extract node information
function extractNodes(
  children: FigmaDocumentNode[],
  parentNode?: SimplifiedNode,
  iconMap?: Map<string, IconDetectionResult>
): SimplifiedNode[] {
  if (!Array.isArray(children)) return [];

  // Create a corresponding original parent node object for visibility judgment
  const parentForVisibility = parentNode ? {
    clipsContent: (parentNode as any).clipsContent,
    absoluteBoundingBox: parentNode._absoluteX !== undefined && parentNode._absoluteY !== undefined ? {
      x: parentNode._absoluteX,
      y: parentNode._absoluteY,
      width: parseFloat(parentNode.cssStyles?.width || '0'),
      height: parseFloat(parentNode.cssStyles?.height || '0')
    } : undefined
  } : undefined;

  const visibilityFilter = (node: FigmaDocumentNode) => {
    // Use type guard to ensure only checking nodes with necessary properties
    const nodeForVisibility = {
      visible: (node as any).visible,
      opacity: (node as any).opacity,
      absoluteBoundingBox: (node as any).absoluteBoundingBox,
      absoluteRenderBounds: (node as any).absoluteRenderBounds
    };

    // If there's no parent node information, only check the node's own visibility
    if (!parentForVisibility) {
      return isVisible(nodeForVisibility);
    }

    // If there's a parent node, also consider the parent's clipping effect
    return isVisibleInParent(nodeForVisibility, parentForVisibility);
  };

  const nodes = children
    .filter(visibilityFilter)
    .map(node => extractNode(node, parentNode, iconMap))
    .filter((node): node is SimplifiedNode => node !== null);

  // Sort sibling elements by top value (from top to bottom)
  return sortNodesByPosition(nodes);
}

/**
 * Extract single node information
 * Use the new icon detection algorithm to handle icon merging
 */
function extractNode(
  node: FigmaDocumentNode,
  parentNode?: SimplifiedNode,
  iconMap?: Map<string, IconDetectionResult>
): SimplifiedNode | null {
  if (!node) return null;

  const { id, name, type } = node;

  // Check if this is an icon node that needs to be exported
  const iconInfo = iconMap?.get(id);
  if (iconInfo && iconInfo.shouldMerge) {
    // This is an icon node, export as a whole, don't process child nodes
    const result: SimplifiedNode = {
      id,
      name,
      type
    };

    result.cssStyles = {};

    // Add size information
    if (hasValue('absoluteBoundingBox', node) && node.absoluteBoundingBox) {
      result.cssStyles.width = formatPxValue(node.absoluteBoundingBox.width);
      result.cssStyles.height = formatPxValue(node.absoluteBoundingBox.height);

      if ((node.type as string) !== 'DOCUMENT' && (node.type as string) !== 'CANVAS') {
        result.cssStyles.position = 'absolute';
        result._absoluteX = node.absoluteBoundingBox.x;
        result._absoluteY = node.absoluteBoundingBox.y;

        if (parentNode &&
            parentNode._absoluteX !== undefined &&
            parentNode._absoluteY !== undefined) {
          result.cssStyles.left = formatPxValue(node.absoluteBoundingBox.x - parentNode._absoluteX);
          result.cssStyles.top = formatPxValue(node.absoluteBoundingBox.y - parentNode._absoluteY);
        } else {
          result.cssStyles.left = formatPxValue(node.absoluteBoundingBox.x);
          result.cssStyles.top = formatPxValue(node.absoluteBoundingBox.y);
        }
      }
    }

    // Set export information
    result.exportInfo = {
      type: 'IMAGE',
      format: iconInfo.exportFormat,
      fileName: generateFileName(name, iconInfo.exportFormat)
    };

    // Don't process child nodes, export as a whole image
    return result;
  }

  // Create basic node object
  const result: SimplifiedNode = {
    id,
    name,
    type
  };

  // Set CSS styles
  result.cssStyles = {};


  // Add CSS conversion logic for size and position
  if (hasValue('absoluteBoundingBox', node) && node.absoluteBoundingBox) {

    // Add to CSS styles (using optimized precision)
    result.cssStyles.width = formatPxValue(node.absoluteBoundingBox.width);
    result.cssStyles.height = formatPxValue(node.absoluteBoundingBox.height);

    // Add positioning information for non-root nodes
    if ((node.type as string) !== 'DOCUMENT' && (node.type as string) !== 'CANVAS') {
      result.cssStyles.position = 'absolute';

      // Store original coordinates for child nodes to calculate relative positions
      result._absoluteX = node.absoluteBoundingBox.x;
      result._absoluteY = node.absoluteBoundingBox.y;

      // If there's a parent node, calculate relative position
      if (parentNode &&
          parentNode._absoluteX !== undefined &&
          parentNode._absoluteY !== undefined) {
        result.cssStyles.left = formatPxValue(node.absoluteBoundingBox.x - parentNode._absoluteX);
        result.cssStyles.top = formatPxValue(node.absoluteBoundingBox.y - parentNode._absoluteY);
      } else {
        // Otherwise use absolute position (top-level elements)
        result.cssStyles.left = formatPxValue(node.absoluteBoundingBox.x);
        result.cssStyles.top = formatPxValue(node.absoluteBoundingBox.y);
      }
    }
  }

  // Process text - preserve original text content
  if (hasValue('characters', node) && typeof node.characters === 'string') {
    result.text = node.characters;

    // For text nodes, add text color style
    if (hasValue('fills', node) && Array.isArray(node.fills) && node.fills.length > 0) {
      const fill = node.fills[0];
      if (fill.type === 'SOLID' && fill.color) {
        // Use convertColor to get hex format color
        const { hex, opacity } = convertColor(fill.color, fill.opacity ?? 1);
        // If opacity is 1, use hex format, otherwise use rgba format
        result.cssStyles.color = opacity === 1 ? hex : formatRGBAColor(fill.color, opacity);
      }
    }
  }

  // Extract image information
  processImageResources(node, result, iconMap);

  // Extract common property processing logic
  processNodeStyle(node, result);
  processFills(node, result);
  processStrokes(node, result);
  processEffects(node, result);
  processCornerRadius(node, result);

  // Recursively process child nodes
  if (hasValue('children', node) && Array.isArray(node.children) && node.children.length) {
    result.children = extractNodes(node.children, result, iconMap);

    // Process image groups (keep original logic for handling image fill cases)
    detectAndMarkImageGroup(result);
  }

  return result;
}

/**
 * Detect and mark image groups
 */
function detectAndMarkImageGroup(node: SimplifiedNode): void {
  markImageGroup(node,
    (n) => suggestExportFormat(n),
    generateFileName
  );
}

/**
 * Extract image resources from the node
 * Icon export is already handled by iconMap, only process image fills here
 */
function processImageResources(
  node: FigmaDocumentNode,
  result: SimplifiedNode,
  iconMap?: Map<string, IconDetectionResult>
): void {
  // If already marked as icon export, skip
  if (iconMap?.has(result.id)) {
    return;
  }

  // Check image resources in fills and background
  const imageResources: ImageResource[] = [];

  // Extract image resources from fills
  if (hasValue('fills', node) && Array.isArray(node.fills)) {
    const fillImages = node.fills.filter(fill =>
      fill.type === 'IMAGE' && fill.imageRef
    ).map(fill => ({
      imageRef: fill.imageRef,
    }));

    imageResources.push(...fillImages);
  }

  // Extract image resources from background
  if (hasValue('background', node) && Array.isArray(node.background)) {
    const bgImages = node.background.filter(bg =>
      bg.type === 'IMAGE' && bg.imageRef
    ).map(bg => ({
      imageRef: bg.imageRef,
    }));

    imageResources.push(...bgImages);
  }

  // If image resources are found, save and add export information
  if (imageResources.length > 0) {
    // Set CSS background image property - use the first image
    if (!result.cssStyles) {
      result.cssStyles = {};
    }

    const primaryImage = imageResources[0];
    result.cssStyles.backgroundImage = `url({{FIGMA_IMAGE:${primaryImage.imageRef}}})`;

    // Add export information (omit nodeId as it's the same as node id)
    const format = suggestExportFormat(result);
    result.exportInfo = {
      type: 'IMAGE',
      format,
      // nodeId omitted because it's the same as node id, can be obtained from node id when downloading
      fileName: generateFileName(result.name, format)
    };
  }
}

/**
 * Process node's style properties
 */
function processNodeStyle(node: FigmaDocumentNode, result: SimplifiedNode): void {
  if (!hasValue('style', node)) return;

  const style = node.style as any;

  // Convert text style
  const textStyle: TextStyle = {
    fontFamily: style?.fontFamily,
    fontSize: style?.fontSize,
    fontWeight: style?.fontWeight,
    textAlignHorizontal: style?.textAlignHorizontal,
    textAlignVertical: style?.textAlignVertical
  };

  // Process line height
  if (style?.lineHeightPx) {
    const cssStyle = textStyleToCss(textStyle);
    cssStyle.lineHeight = formatPxValue(style.lineHeightPx);
    Object.assign(result.cssStyles!, cssStyle);
  } else {
    Object.assign(result.cssStyles!, textStyleToCss(textStyle));
  }
}

/**
 * Process gradient fills, convert to CSS linear-gradient
 *
 * Figma gradient coordinate system:
 * - Origin (0,0) is at top-left
 * - x-axis points right as positive
 * - y-axis points down as positive
 *
 * CSS gradient angles:
 * - 0deg from bottom to top
 * - 90deg from left to right
 * - 180deg from top to bottom
 * - 270deg from right to left
 */
function processGradient(gradient: Paint): string {
  if (!gradient.gradientHandlePositions || !gradient.gradientStops) return '';

  const stops = gradient.gradientStops.map(stop => {
    const color = convertColor(stop.color, stop.color.a);
    return `${color.hex} ${Math.round(stop.position * 100)}%`;
  }).join(', ');

  const [start, end] = gradient.gradientHandlePositions;

  // Calculate the angle in Figma (x-axis positive direction is 0 degrees, counter-clockwise is positive)
  const figmaAngle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);

  // Convert to CSS angle:
  // CSS 0deg is upward, rotating clockwise
  // Figma angle needs to add 90 degrees (because Figma 0 degree is rightward, CSS 0 degree is upward)
  const cssAngle = Math.round((figmaAngle + 90 + 360) % 360);

  return `linear-gradient(${cssAngle}deg, ${stops})`;
}

/**
 * Process node's fill properties
 */
function processFills(node: FigmaDocumentNode, result: SimplifiedNode): void {
  if (!hasValue('fills', node) || !Array.isArray(node.fills) || node.fills.length === 0) return;

  // Skip image fills
  if (hasImageFill(node)) {
    return;
  }

  const fills = node.fills.filter(isVisible);
  if (fills.length === 0) return;

  const fill = fills[0];

  if (fill.type === 'SOLID' && fill.color) {
    const { hex, opacity } = convertColor(fill.color, fill.opacity ?? 1);
    const color = opacity === 1 ? hex : formatRGBAColor(fill.color, opacity);

    if (node.type === 'TEXT') {
      result.cssStyles!.color = color;
    } else {
      result.cssStyles!.backgroundColor = color;
    }
  }
  else if (fill.type === 'GRADIENT_LINEAR') {
    const gradient = processGradient(fill);

    if (node.type === 'TEXT') {
      result.cssStyles!.background = gradient;
      result.cssStyles!.webkitBackgroundClip = 'text';
      result.cssStyles!.backgroundClip = 'text';
      result.cssStyles!.webkitTextFillColor = 'transparent';
    } else {
      result.cssStyles!.background = gradient;
    }
  }
}

/**
 * Process node's stroke properties
 */
function processStrokes(node: FigmaDocumentNode, result: SimplifiedNode): void {
  if ((node as any).type === 'TEXT') return;

  const strokes = buildSimplifiedStrokes(node);
  if (strokes.colors.length === 0) return;

  const stroke = strokes.colors[0];

  if (typeof stroke === 'string') {
    result.cssStyles!.borderColor = stroke;
    if (strokes.strokeWeight) {
      result.cssStyles!.borderWidth = strokes.strokeWeight;
    }
    result.cssStyles!.borderStyle = 'solid';
  }
  else if (typeof stroke === 'object' && 'type' in stroke) {
    if (stroke.type === 'SOLID' && stroke.color) {
      const { hex, opacity } = convertColor(stroke.color);
      result.cssStyles!.borderColor = opacity === 1 ? hex : formatRGBAColor(stroke.color);
      if (strokes.strokeWeight) {
        result.cssStyles!.borderWidth = strokes.strokeWeight;
      }
      result.cssStyles!.borderStyle = 'solid';
    }
    else if (stroke.type === 'GRADIENT_LINEAR') {
      const gradient = processGradient(stroke);
      result.cssStyles!.borderImage = gradient;
      result.cssStyles!.borderImageSlice = '1';
      if (strokes.strokeWeight) {
        result.cssStyles!.borderWidth = strokes.strokeWeight;
      }
    }
  }
}

/**
 * Process node's effects properties
 */
function processEffects(node: FigmaDocumentNode, result: SimplifiedNode): void {
  const effects = buildSimplifiedEffects(node);
  if (effects.boxShadow) result.cssStyles!.boxShadow = effects.boxShadow;
  if (effects.filter) result.cssStyles!.filter = effects.filter;
  if (effects.backdropFilter) result.cssStyles!.backdropFilter = effects.backdropFilter;
}

/**
 * Process node's corner radius properties
 */
function processCornerRadius(node: FigmaDocumentNode, result: SimplifiedNode): void {
  if (!hasValue('cornerRadius', node)) return;

  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    // Process uniform corner radius (rounded)
    result.cssStyles!.borderRadius = formatPxValue(node.cornerRadius);
  } else if (node.cornerRadius === 'mixed' && hasValue('rectangleCornerRadii', node, isRectangleCornerRadii)) {
    // Process non-uniform corner radius (top-left, top-right, bottom-right, bottom-left) - rounded
    result.cssStyles!.borderRadius = generateCSSShorthand({
      top: Math.round(node.rectangleCornerRadii[0]),
      right: Math.round(node.rectangleCornerRadii[1]),
      bottom: Math.round(node.rectangleCornerRadii[2]),
      left: Math.round(node.rectangleCornerRadii[3])
    }) || '0';
  }
}

/**
 * Convert text style to CSS style
 * @param textStyle Figma text style
 * @returns CSS style object (default values omitted)
 */
function textStyleToCss(textStyle: TextStyle): CSSStyle {
  const cssStyle: CSSStyle = {};

  if (textStyle.fontFamily) cssStyle.fontFamily = textStyle.fontFamily;
  if (textStyle.fontSize) cssStyle.fontSize = formatPxValue(textStyle.fontSize);

  // fontWeight: omit default value 400
  if (textStyle.fontWeight && textStyle.fontWeight !== 400) {
    cssStyle.fontWeight = textStyle.fontWeight;
  }

  // Process text alignment (omit default value 'left')
  if (textStyle.textAlignHorizontal) {
    switch(textStyle.textAlignHorizontal) {
      case 'LEFT':
        // Omit default value
        break;
      case 'CENTER':
        cssStyle.textAlign = 'center';
        break;
      case 'RIGHT':
        cssStyle.textAlign = 'right';
        break;
      case 'JUSTIFIED':
        cssStyle.textAlign = 'justify';
        break;
    }
  }

  // Process vertical alignment (omit default value 'top')
  if (textStyle.textAlignVertical) {
    switch(textStyle.textAlignVertical) {
      case 'TOP':
        // Omit default value
        break;
      case 'CENTER':
        cssStyle.verticalAlign = 'middle';
        break;
      case 'BOTTOM':
        cssStyle.verticalAlign = 'bottom';
        break;
    }
  }

  return cssStyle;
}

/**
 * Select export format based on node characteristics
 * Note: SVG format is now determined by icon-detection algorithm, this function is only used for image fills
 */
function suggestExportFormat(node: FigmaDocumentNode | SimplifiedNode): 'PNG' | 'JPG' | 'SVG' {
  // For image fills, default to PNG format
  return 'PNG';
}
