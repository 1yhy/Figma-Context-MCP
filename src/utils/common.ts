import type { Paint, RGBA } from "@figma/rest-api-spec";
import { CSSHexColor, CSSRGBAColor, SimplifiedFill } from "~/services/simplify-node-response.js";

// ==================== Type Definitions ====================

export type StyleId = `${string}_${string}` & { __brand: "StyleId" };

export interface ColorValue {
  hex: CSSHexColor;
  opacity: number;
}

/** Properties for visibility checking */
export interface VisibilityProperties {
  visible?: boolean;
  opacity?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  absoluteRenderBounds?: { x: number; y: number; width: number; height: number } | null;
}

/** Properties for parent container clipping check */
export interface ParentClipProperties {
  clipsContent?: boolean;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
}

// ==================== Object Processing ====================

/**
 * Remove empty arrays and empty objects from an object
 */
export function removeEmptyKeys<T>(input: T): T {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => removeEmptyKeys(item)) as T;
  }

  const result = {} as T;
  for (const key in input) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const value = input[key];
      const cleanedValue = removeEmptyKeys(value);

      if (
        cleanedValue !== undefined &&
        !(Array.isArray(cleanedValue) && cleanedValue.length === 0) &&
        !(
          typeof cleanedValue === "object" &&
          cleanedValue !== null &&
          Object.keys(cleanedValue).length === 0
        )
      ) {
        result[key] = cleanedValue;
      }
    }
  }

  return result;
}

// ==================== Color Conversion ====================

/**
 * Convert hex color and opacity to rgba format
 */
export function hexToRgba(hex: string, opacity: number = 1): string {
  hex = hex.replace("#", "");

  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const validOpacity = Math.min(Math.max(opacity, 0), 1);

  return `rgba(${r}, ${g}, ${b}, ${validOpacity})`;
}

/**
 * Convert Figma RGBA color to { hex, opacity }
 */
export function convertColor(color: RGBA, opacity = 1): ColorValue {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = Math.round(opacity * color.a * 100) / 100;

  const hex = ("#" +
    ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()) as CSSHexColor;

  return { hex, opacity: a };
}

/**
 * Convert Figma RGBA to CSS rgba() format
 */
export function formatRGBAColor(color: RGBA, opacity = 1): CSSRGBAColor {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = Math.round(opacity * color.a * 100) / 100;

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ==================== CSS Generation ====================

/**
 * Generate CSS shorthand properties (such as padding, margin, border-radius)
 *
 * @example
 * generateCSSShorthand({ top: 10, right: 10, bottom: 10, left: 10 }) // "10px"
 * generateCSSShorthand({ top: 10, right: 20, bottom: 10, left: 20 }) // "10px 20px"
 */
export function generateCSSShorthand(
  values: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  },
  options: {
    ignoreZero?: boolean;
    suffix?: string;
  } = {},
): string | undefined {
  const { ignoreZero = true, suffix = "px" } = options;
  const { top, right, bottom, left } = values;

  if (ignoreZero && top === 0 && right === 0 && bottom === 0 && left === 0) {
    return undefined;
  }

  if (top === right && right === bottom && bottom === left) {
    return `${top}${suffix}`;
  }

  if (right === left) {
    if (top === bottom) {
      return `${top}${suffix} ${right}${suffix}`;
    }
    return `${top}${suffix} ${right}${suffix} ${bottom}${suffix}`;
  }

  return `${top}${suffix} ${right}${suffix} ${bottom}${suffix} ${left}${suffix}`;
}

// ==================== ID Generation ====================

/**
 * Generate unique variable ID
 */
export function generateVarId(prefix: string = "var"): StyleId {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }

  return `${prefix}_${result}` as StyleId;
}

// ==================== Fill Parsing ====================

/**
 * Convert Figma Paint to simplified fill format
 */
export function parsePaint(raw: Paint): SimplifiedFill {
  if (raw.type === "IMAGE") {
    return {
      type: "IMAGE",
      imageRef: raw.imageRef,
      scaleMode: raw.scaleMode,
    };
  }

  if (raw.type === "SOLID") {
    const { hex, opacity } = convertColor(raw.color!, raw.opacity);
    if (opacity === 1) {
      return hex;
    }
    return formatRGBAColor(raw.color!, opacity);
  }

  if (
    ["GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"].includes(
      raw.type,
    )
  ) {
    return {
      type: raw.type,
      gradientHandlePositions: raw.gradientHandlePositions,
      gradientStops: raw.gradientStops.map(({ position, color }) => ({
        position,
        color: convertColor(color),
      })),
    };
  }

  throw new Error(`Unknown paint type: ${raw.type}`);
}

// ==================== Visibility Check ====================

/**
 * Check if an element is visible
 */
export function isVisible(element: VisibilityProperties): boolean {
  if (element.visible === false) {
    return false;
  }

  if (element.opacity === 0) {
    return false;
  }

  if (element.absoluteRenderBounds === null) {
    return false;
  }

  return true;
}

/**
 * Check if an element is visible within its parent container (considering clipping)
 */
export function isVisibleInParent(
  element: VisibilityProperties,
  parent: ParentClipProperties,
): boolean {
  if (!isVisible(element)) {
    return false;
  }

  if (
    parent &&
    parent.clipsContent === true &&
    element.absoluteBoundingBox &&
    parent.absoluteBoundingBox
  ) {
    const elementBox = element.absoluteBoundingBox;
    const parentBox = parent.absoluteBoundingBox;

    const outsideParent =
      elementBox.x >= parentBox.x + parentBox.width ||
      elementBox.x + elementBox.width <= parentBox.x ||
      elementBox.y >= parentBox.y + parentBox.height ||
      elementBox.y + elementBox.height <= parentBox.y;

    if (outsideParent) {
      return false;
    }
  }

  return true;
}
