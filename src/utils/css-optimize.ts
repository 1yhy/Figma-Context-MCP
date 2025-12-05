/**
 * CSS output optimization utilities
 * Used to reduce output size and improve readability
 */

// ==================== Numeric Precision Optimization ====================

/**
 * Round a number to specified precision
 * @param value Original number
 * @param precision Number of decimal places, default 0 (integer)
 */
export function roundValue(value: number, precision: number = 0): number {
  if (precision === 0) {
    return Math.round(value);
  }
  const multiplier = Math.pow(10, precision);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Format px value, rounded to integer
 * @param value Pixel value
 */
export function formatPxValue(value: number): string {
  return `${Math.round(value)}px`;
}

/**
 * Format numeric value, used for gap and other properties, rounded to integer
 * @param value Numeric value
 */
export function formatNumericValue(value: number): string {
  return `${Math.round(value)}px`;
}

// ==================== Browser Defaults ====================

/**
 * Browser/Tailwind default values
 * These values can be omitted from output
 */
export const BROWSER_DEFAULTS: Record<string, string | number | undefined> = {
  // Text defaults
  textAlign: 'left',
  verticalAlign: 'top',
  fontWeight: 400,

  // Flex defaults
  flexDirection: 'row',
  justifyContent: 'flex-start',
  alignItems: 'stretch',

  // Position defaults (if all elements are absolute, can be omitted)
  // position: 'static',  // Not omitting for now, as we explicitly use absolute

  // Other
  opacity: '1',
  borderStyle: 'none',
};

/**
 * Check if a value is the default value
 */
export function isDefaultValue(key: string, value: string | number | undefined): boolean {
  if (value === undefined) return true;

  const defaultValue = BROWSER_DEFAULTS[key];
  if (defaultValue === undefined) return false;

  // Handle number and string comparison
  if (typeof defaultValue === 'number' && typeof value === 'number') {
    return defaultValue === value;
  }

  return String(defaultValue) === String(value);
}

/**
 * Omit default style values
 * @param styles CSS style object
 * @returns Optimized style object
 */
export function omitDefaultStyles<T extends Record<string, unknown>>(styles: T): Partial<T> {
  const result: Partial<T> = {};

  for (const [key, value] of Object.entries(styles)) {
    // Skip undefined
    if (value === undefined) continue;

    // Skip default values
    if (isDefaultValue(key, value as string | number)) continue;

    // Keep non-default values
    (result as Record<string, unknown>)[key] = value;
  }

  return result;
}

// ==================== Gap Analysis ====================

/**
 * Analyze gap consistency
 * @param gaps Array of gaps
 * @param tolerancePercent Tolerance percentage, default 20%
 */
export function analyzeGapConsistency(gaps: number[], tolerancePercent: number = 20): {
  isConsistent: boolean;
  averageGap: number;
  roundedGap: number;
  variance: number;
} {
  if (gaps.length === 0) {
    return { isConsistent: true, averageGap: 0, roundedGap: 0, variance: 0 };
  }

  if (gaps.length === 1) {
    const rounded = roundValue(gaps[0]);
    return { isConsistent: true, averageGap: gaps[0], roundedGap: rounded, variance: 0 };
  }

  // Calculate average
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  // Calculate variance
  const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avg, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);

  // Determine consistency: standard deviation less than specified percentage of average
  const tolerance = avg * (tolerancePercent / 100);
  const isConsistent = stdDev <= tolerance;

  // Round to integer
  const roundedGap = roundValue(avg);

  return { isConsistent, averageGap: avg, roundedGap, variance };
}

/**
 * Round gap to common values
 * Common values: 0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64
 */
export function roundToCommonGap(gap: number): number {
  const COMMON_GAPS = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128];

  // Find closest common value
  let closest = COMMON_GAPS[0];
  let minDiff = Math.abs(gap - closest);

  for (const commonGap of COMMON_GAPS) {
    const diff = Math.abs(gap - commonGap);
    if (diff < minDiff) {
      minDiff = diff;
      closest = commonGap;
    }
  }

  // If difference is too large (over 4px), use rounded value
  if (minDiff > 4) {
    return roundValue(gap);
  }

  return closest;
}

// ==================== Export Info Optimization ====================

/**
 * Optimize exportInfo, omit nodeId if it's the same as node id
 */
export function optimizeExportInfo(
  nodeId: string,
  exportInfo: { type: string; format: string; nodeId?: string; fileName?: string }
): { type: string; format: string; nodeId?: string; fileName?: string } {
  const result = { ...exportInfo };

  // If nodeId is the same as node id, omit it
  if (result.nodeId === nodeId) {
    delete result.nodeId;
  }

  return result;
}
