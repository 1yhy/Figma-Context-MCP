/**
 * Color Conversion Utilities
 *
 * Functions for converting between Figma color formats and CSS color values.
 *
 * @module utils/color
 */

import type { Paint, RGBA } from "@figma/rest-api-spec";
import type { CSSHexColor, CSSRGBAColor, SimplifiedFill } from "~/types/index.js";

// ==================== Type Definitions ====================

export interface ColorValue {
  hex: CSSHexColor;
  opacity: number;
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

// ==================== Fill Parsing ====================

/**
 * Convert Figma Paint to simplified fill format
 */
export function parsePaint(raw: Paint): SimplifiedFill {
  if (raw.type === "IMAGE") {
    const imagePaint = raw as { type: "IMAGE"; imageRef?: string; scaleMode?: string };
    return {
      type: "IMAGE",
      imageRef: imagePaint.imageRef,
      scaleMode: imagePaint.scaleMode,
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
    raw.type === "GRADIENT_LINEAR" ||
    raw.type === "GRADIENT_RADIAL" ||
    raw.type === "GRADIENT_ANGULAR" ||
    raw.type === "GRADIENT_DIAMOND"
  ) {
    const gradientPaint = raw as {
      type: typeof raw.type;
      gradientHandlePositions?: Array<{ x: number; y: number }>;
      gradientStops?: Array<{ position: number; color: RGBA }>;
    };
    return {
      type: raw.type,
      gradientHandlePositions: gradientPaint.gradientHandlePositions,
      gradientStops: gradientPaint.gradientStops?.map(({ position, color }) => ({
        position,
        color: convertColor(color).hex,
      })),
    };
  }

  throw new Error(`Unknown paint type: ${raw.type}`);
}
