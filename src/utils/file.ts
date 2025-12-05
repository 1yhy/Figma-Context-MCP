// ==================== Name Processing ====================

/**
 * Clean illegal characters from name (for file names)
 *
 * @param name Original name
 * @param separator Separator, defaults to '_'
 * @returns Sanitized name
 */
export function sanitizeName(name: string, separator: string = "_"): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, separator) // Replace illegal filesystem characters
    .replace(/\s+/g, separator) // Replace whitespace characters
    .replace(new RegExp(`${separator}+`, "g"), separator) // Merge consecutive separators
    .toLowerCase();
}

/**
 * Clean name for ID generation (only keep alphanumeric and hyphens)
 *
 * @param name Original name
 * @returns Sanitized name
 */
export function sanitizeNameForId(name: string): string {
  return name
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase();
}

/**
 * Generate file name based on node name
 */
export function generateFileName(name: string, format: string): string {
  const sanitizedName = sanitizeName(name, "_");
  const lowerFormat = format.toLowerCase();

  // If the name already includes the extension, keep the original name
  if (sanitizedName.includes(`.${lowerFormat}`)) {
    return sanitizedName;
  }

  return `${sanitizedName}.${lowerFormat}`;
}

// ==================== Export Format Detection ====================

/**
 * Node interface for format detection
 */
export interface FormatDetectionNode {
  type?: string;
  exportSettings?: { format?: string[] };
  cssStyles?: { backgroundImage?: string };
  exportInfo?: { format?: string };
  children?: FormatDetectionNode[];
}

/**
 * Choose appropriate export format based on node characteristics
 *
 * @param node Node object
 * @param isSVGNode SVG detection function
 * @returns Recommended export format
 */
export function suggestExportFormat(
  node: FormatDetectionNode,
  isSVGNode: (node: FormatDetectionNode) => boolean,
): "PNG" | "JPG" | "SVG" {
  if (isSVGNode(node)) {
    return "SVG";
  }
  return "PNG";
}
