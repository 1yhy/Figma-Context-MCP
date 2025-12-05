import type { SimplifiedNode, ExportInfo } from "~/services/simplify-node-response.js";

// ==================== Type Definitions ====================

/** Node with fill properties */
interface NodeWithFills {
  fills?: Array<{ type: string; imageRef?: string }>;
}

/** Node with styles and children */
interface NodeWithChildren {
  id: string;
  name: string;
  type: string;
  cssStyles?: { backgroundImage?: string; top?: string; left?: string };
  children?: NodeWithChildren[];
  exportInfo?: ExportInfo;
}

// ==================== Image Detection ====================

/**
 * Check whether the node has an image fill
 */
export function hasImageFill(node: NodeWithFills): boolean {
  return node.fills?.some((fill) => fill.type === 'IMAGE' && fill.imageRef) || false;
}

/**
 * Detect and mark image groups
 */
export function detectAndMarkImageGroup(
  node: NodeWithChildren,
  suggestExportFormat: (node: NodeWithChildren) => string,
  generateFileName: (name: string, format: string) => string
): void {
  // Only handle groups and frames
  if (node.type !== 'GROUP' && node.type !== 'FRAME') return;

  // Without children it cannot be an image group
  if (!node.children || node.children.length === 0) return;

  // Check whether all children are image types
  const allChildrenAreImages = node.children.every((child) =>
    (child.type === 'IMAGE') ||
    (child.type === 'RECTANGLE' && hasImageFill(child as NodeWithFills)) ||
    (child.type === 'ELLIPSE' && hasImageFill(child as NodeWithFills)) ||
    (child.type === 'VECTOR' && hasImageFill(child as NodeWithFills)) ||
    (child.type === 'FRAME' && child.cssStyles?.backgroundImage)
  );

  // Mark the node as an image group
  if (allChildrenAreImages) {
    const format = suggestExportFormat(node);
    node.exportInfo = {
      type: 'IMAGE_GROUP',
      format: format as 'PNG' | 'JPG' | 'SVG',
      nodeId: node.id,
      fileName: generateFileName(node.name, format),
    };

    // Remove child information and export as a whole
    delete node.children;
  }
}

// ==================== Node Sorting ====================

/**
 * Sort nodes by position (top to bottom, left to right)
 */
export function sortNodesByPosition<T extends { cssStyles?: { top?: string; left?: string } }>(
  nodes: T[]
): T[] {
  return [...nodes].sort((a, b) => {
    // Sort by the top value (top to bottom)
    const aTop = a.cssStyles?.top ? parseFloat(a.cssStyles.top) : 0;
    const bTop = b.cssStyles?.top ? parseFloat(b.cssStyles.top) : 0;

    if (aTop !== bTop) {
      return aTop - bTop;
    }

    // When top values are equal, sort by left (left to right)
    const aLeft = a.cssStyles?.left ? parseFloat(a.cssStyles.left) : 0;
    const bLeft = b.cssStyles?.left ? parseFloat(b.cssStyles.left) : 0;
    return aLeft - bLeft;
  });
}

// ==================== Temporary Property Cleanup ====================

/**
 * Clean up temporary computed properties
 */
export function cleanupTemporaryProperties(node: SimplifiedNode): void {
  // Remove absolute coordinates
  delete node._absoluteX;
  delete node._absoluteY;

  // Recursively clean child nodes
  if (node.children && node.children.length > 0) {
    node.children.forEach(cleanupTemporaryProperties);
  }
}
