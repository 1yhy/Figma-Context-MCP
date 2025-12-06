import { isFrame, isLayout, isRectangle } from "~/utils/validation.js";
import type {
  Node as FigmaDocumentNode,
  HasFramePropertiesTrait,
  HasLayoutTrait,
} from "@figma/rest-api-spec";
import { generateCSSShorthand } from "~/utils/css.js";

export interface SimplifiedLayout {
  mode: "none" | "row" | "column";
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between" | "baseline" | "stretch";
  alignItems?: "flex-start" | "flex-end" | "center" | "space-between" | "baseline" | "stretch";
  alignSelf?: "flex-start" | "flex-end" | "center" | "stretch";
  wrap?: boolean;
  gap?: string;
  locationRelativeToParent?: {
    x: number;
    y: number;
  };
  dimensions?: {
    width?: number;
    height?: number;
    aspectRatio?: number;
  };
  padding?: string;
  sizing?: {
    horizontal?: "fixed" | "fill" | "hug";
    vertical?: "fixed" | "fill" | "hug";
  };
  overflowScroll?: ("x" | "y")[];
  position?: "absolute";
}

// Convert Figma's layout config into a more typical flex-like schema
export function buildSimplifiedLayout(
  n: FigmaDocumentNode,
  parent?: FigmaDocumentNode,
): SimplifiedLayout {
  const frameValues = buildSimplifiedFrameValues(n);
  const layoutValues = buildSimplifiedLayoutValues(n, parent, frameValues.mode) || {};

  return { ...frameValues, ...layoutValues };
}

/**
 * Convert Figma's primaryAxisAlignItems to CSS justifyContent
 * Primary axis: horizontal for row, vertical for column
 */
function convertJustifyContent(
  axisAlign?: HasFramePropertiesTrait["primaryAxisAlignItems"],
  stretch?: {
    children: FigmaDocumentNode[];
    mode: "row" | "column";
  },
) {
  // Check if all children fill the main axis (stretch behavior)
  if (stretch) {
    const { children, mode } = stretch;
    const shouldStretch =
      children.length > 0 &&
      children.every((c) => {
        if ("layoutPositioning" in c && c.layoutPositioning === "ABSOLUTE") return true;
        // Primary axis: horizontal for row, vertical for column
        if (mode === "row") {
          return "layoutSizingHorizontal" in c && c.layoutSizingHorizontal === "FILL";
        } else {
          return "layoutSizingVertical" in c && c.layoutSizingVertical === "FILL";
        }
      });

    if (shouldStretch) return "stretch";
  }

  switch (axisAlign) {
    case "MIN":
      // MIN, AKA flex-start, is the default alignment
      return undefined;
    case "MAX":
      return "flex-end";
    case "CENTER":
      return "center";
    case "SPACE_BETWEEN":
      return "space-between";
    default:
      return undefined;
  }
}

/**
 * Convert Figma's counterAxisAlignItems to CSS alignItems
 * Counter axis: vertical for row, horizontal for column
 * Note: SPACE_BETWEEN is not valid for counter axis in Figma
 */
function convertAlignItems(
  axisAlign?: HasFramePropertiesTrait["counterAxisAlignItems"],
  stretch?: {
    children: FigmaDocumentNode[];
    mode: "row" | "column";
  },
) {
  // Check if all children fill the cross axis (stretch behavior)
  if (stretch) {
    const { children, mode } = stretch;
    const shouldStretch =
      children.length > 0 &&
      children.every((c) => {
        if ("layoutPositioning" in c && c.layoutPositioning === "ABSOLUTE") return true;
        // Counter axis: vertical for row, horizontal for column
        if (mode === "row") {
          return "layoutSizingVertical" in c && c.layoutSizingVertical === "FILL";
        } else {
          return "layoutSizingHorizontal" in c && c.layoutSizingHorizontal === "FILL";
        }
      });

    if (shouldStretch) return "stretch";
  }

  switch (axisAlign) {
    case "MIN":
      // MIN, AKA flex-start, is the default alignment
      return undefined;
    case "MAX":
      return "flex-end";
    case "CENTER":
      return "center";
    case "BASELINE":
      return "baseline";
    default:
      return undefined;
  }
}

function convertSelfAlign(align?: HasLayoutTrait["layoutAlign"]) {
  switch (align) {
    case "MIN":
      // MIN, AKA flex-start, is the default alignment
      return undefined;
    case "MAX":
      return "flex-end";
    case "CENTER":
      return "center";
    case "STRETCH":
      return "stretch";
    default:
      return undefined;
  }
}

// interpret sizing
function convertSizing(
  s?: HasLayoutTrait["layoutSizingHorizontal"] | HasLayoutTrait["layoutSizingVertical"],
) {
  if (s === "FIXED") return "fixed";
  if (s === "FILL") return "fill";
  if (s === "HUG") return "hug";
  return undefined;
}

function buildSimplifiedFrameValues(n: FigmaDocumentNode): SimplifiedLayout | { mode: "none" } {
  if (!isFrame(n)) {
    return { mode: "none" };
  }

  const frameValues: SimplifiedLayout = {
    mode:
      !n.layoutMode || n.layoutMode === "NONE"
        ? "none"
        : n.layoutMode === "HORIZONTAL"
          ? "row"
          : "column",
  };

  const overflowScroll: SimplifiedLayout["overflowScroll"] = [];
  if (n.overflowDirection?.includes("HORIZONTAL")) overflowScroll.push("x");
  if (n.overflowDirection?.includes("VERTICAL")) overflowScroll.push("y");
  if (overflowScroll.length > 0) frameValues.overflowScroll = overflowScroll;

  if (frameValues.mode === "none") {
    return frameValues;
  }

  // Convert Figma alignment to CSS flex properties
  frameValues.justifyContent = convertJustifyContent(n.primaryAxisAlignItems ?? "MIN", {
    children: n.children,
    mode: frameValues.mode,
  });
  frameValues.alignItems = convertAlignItems(n.counterAxisAlignItems ?? "MIN", {
    children: n.children,
    mode: frameValues.mode,
  });
  frameValues.alignSelf = convertSelfAlign(n.layoutAlign);

  // Only include wrap if it's set to WRAP, since flex layouts don't default to wrapping
  frameValues.wrap = n.layoutWrap === "WRAP" ? true : undefined;
  frameValues.gap = n.itemSpacing ? `${n.itemSpacing ?? 0}px` : undefined;
  // gather padding
  if (n.paddingTop || n.paddingBottom || n.paddingLeft || n.paddingRight) {
    frameValues.padding = generateCSSShorthand({
      top: n.paddingTop ?? 0,
      right: n.paddingRight ?? 0,
      bottom: n.paddingBottom ?? 0,
      left: n.paddingLeft ?? 0,
    });
  }

  return frameValues;
}

function buildSimplifiedLayoutValues(
  n: FigmaDocumentNode,
  parent: FigmaDocumentNode | undefined,
  mode: "row" | "column" | "none",
): SimplifiedLayout | undefined {
  if (!isLayout(n)) return undefined;

  const layoutValues: SimplifiedLayout = { mode };

  layoutValues.sizing = {
    horizontal: convertSizing(n.layoutSizingHorizontal),
    vertical: convertSizing(n.layoutSizingVertical),
  };

  // Only include positioning-related properties if parent layout isn't flex or if the node is absolute
  if (isFrame(parent) && (parent?.layoutMode === "NONE" || n.layoutPositioning === "ABSOLUTE")) {
    if (n.layoutPositioning === "ABSOLUTE") {
      layoutValues.position = "absolute";
    }
    if (n.absoluteBoundingBox && parent.absoluteBoundingBox) {
      layoutValues.locationRelativeToParent = {
        x: n.absoluteBoundingBox.x - (parent?.absoluteBoundingBox?.x ?? n.absoluteBoundingBox.x),
        y: n.absoluteBoundingBox.y - (parent?.absoluteBoundingBox?.y ?? n.absoluteBoundingBox.y),
      };
    }
    return layoutValues;
  }

  // Handle dimensions based on layout growth and alignment
  if (isRectangle("absoluteBoundingBox", n) && isRectangle("absoluteBoundingBox", parent)) {
    const dimensions: { width?: number; height?: number; aspectRatio?: number } = {};

    // Only include dimensions that aren't meant to stretch
    if (mode === "row") {
      if (!n.layoutGrow && n.layoutSizingHorizontal === "FIXED")
        dimensions.width = n.absoluteBoundingBox.width;
      if (n.layoutAlign !== "STRETCH" && n.layoutSizingVertical === "FIXED")
        dimensions.height = n.absoluteBoundingBox.height;
    } else if (mode === "column") {
      // column
      if (n.layoutAlign !== "STRETCH" && n.layoutSizingHorizontal === "FIXED")
        dimensions.width = n.absoluteBoundingBox.width;
      if (!n.layoutGrow && n.layoutSizingVertical === "FIXED")
        dimensions.height = n.absoluteBoundingBox.height;

      if (n.preserveRatio) {
        dimensions.aspectRatio = n.absoluteBoundingBox?.width / n.absoluteBoundingBox?.height;
      }
    }

    if (Object.keys(dimensions).length > 0) {
      layoutValues.dimensions = dimensions;
    }
  }

  return layoutValues;
}
