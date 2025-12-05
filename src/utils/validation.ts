/**
 * Validation Utilities
 *
 * Type guards, validators, and visibility checks for Figma nodes.
 *
 * @module utils/validation
 */

import type {
  Rectangle,
  HasLayoutTrait,
  StrokeWeights,
  HasFramePropertiesTrait,
} from "@figma/rest-api-spec";
import { isTruthy } from "remeda";
import type { CSSHexColor, CSSRGBAColor } from "~/types/index.js";

export { isTruthy };

// ==================== Visibility Types ====================

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

// ==================== Visibility Checks ====================

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

// ==================== Type Guards ====================

export function hasValue<K extends PropertyKey, T>(
  key: K,
  obj: unknown,
  typeGuard?: (val: unknown) => val is T,
): obj is Record<K, T> {
  const isObject = typeof obj === "object" && obj !== null;
  if (!isObject || !(key in obj)) return false;
  const val = (obj as Record<K, unknown>)[key];
  return typeGuard ? typeGuard(val) : val !== undefined;
}

export function isFrame(val: unknown): val is HasFramePropertiesTrait {
  return (
    typeof val === "object" &&
    !!val &&
    "clipsContent" in val &&
    typeof val.clipsContent === "boolean"
  );
}

export function isLayout(val: unknown): val is HasLayoutTrait {
  return (
    typeof val === "object" &&
    !!val &&
    "absoluteBoundingBox" in val &&
    typeof val.absoluteBoundingBox === "object" &&
    !!val.absoluteBoundingBox &&
    "x" in val.absoluteBoundingBox &&
    "y" in val.absoluteBoundingBox &&
    "width" in val.absoluteBoundingBox &&
    "height" in val.absoluteBoundingBox
  );
}

export function isStrokeWeights(val: unknown): val is StrokeWeights {
  return (
    typeof val === "object" &&
    val !== null &&
    "top" in val &&
    "right" in val &&
    "bottom" in val &&
    "left" in val
  );
}

export function isRectangle<T, K extends string>(
  key: K,
  obj: T,
): obj is T & { [P in K]: Rectangle } {
  const recordObj = obj as Record<K, unknown>;
  return (
    typeof obj === "object" &&
    !!obj &&
    key in recordObj &&
    typeof recordObj[key] === "object" &&
    !!recordObj[key] &&
    "x" in recordObj[key] &&
    "y" in recordObj[key] &&
    "width" in recordObj[key] &&
    "height" in recordObj[key]
  );
}

export function isRectangleCornerRadii(val: unknown): val is number[] {
  return Array.isArray(val) && val.length === 4 && val.every((v) => typeof v === "number");
}

export function isCSSColorValue(val: unknown): val is CSSRGBAColor | CSSHexColor {
  return typeof val === "string" && (val.startsWith("#") || val.startsWith("rgba"));
}
