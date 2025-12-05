/**
 * CSS 输出优化工具
 * 用于减少输出大小和提高可读性
 */

// ==================== 数值精度优化 ====================

/**
 * 四舍五入数值到指定精度
 * @param value 原始数值
 * @param precision 小数位数，默认 0（整数）
 */
export function roundValue(value: number, precision: number = 0): number {
  if (precision === 0) {
    return Math.round(value);
  }
  const multiplier = Math.pow(10, precision);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * 格式化 px 值，四舍五入到整数
 * @param value 像素值
 */
export function formatPxValue(value: number): string {
  return `${Math.round(value)}px`;
}

/**
 * 格式化数值，用于 gap 等属性，四舍五入到整数
 * @param value 数值
 */
export function formatNumericValue(value: number): string {
  return `${Math.round(value)}px`;
}

// ==================== 浏览器默认值 ====================

/**
 * 浏览器/Tailwind 默认值
 * 这些值可以省略不输出
 */
export const BROWSER_DEFAULTS: Record<string, string | number | undefined> = {
  // 文本默认值
  textAlign: 'left',
  verticalAlign: 'top',
  fontWeight: 400,

  // Flex 默认值
  flexDirection: 'row',
  justifyContent: 'flex-start',
  alignItems: 'stretch',

  // 定位默认值（如果所有元素都是 absolute，可以省略）
  // position: 'static',  // 暂不省略，因为我们显式使用 absolute

  // 其他
  opacity: '1',
  borderStyle: 'none',
};

/**
 * 检查值是否为默认值
 */
export function isDefaultValue(key: string, value: string | number | undefined): boolean {
  if (value === undefined) return true;

  const defaultValue = BROWSER_DEFAULTS[key];
  if (defaultValue === undefined) return false;

  // 处理数字和字符串比较
  if (typeof defaultValue === 'number' && typeof value === 'number') {
    return defaultValue === value;
  }

  return String(defaultValue) === String(value);
}

/**
 * 省略默认样式值
 * @param styles CSS 样式对象
 * @returns 优化后的样式对象
 */
export function omitDefaultStyles<T extends Record<string, unknown>>(styles: T): Partial<T> {
  const result: Partial<T> = {};

  for (const [key, value] of Object.entries(styles)) {
    // 跳过 undefined
    if (value === undefined) continue;

    // 跳过默认值
    if (isDefaultValue(key, value as string | number)) continue;

    // 保留非默认值
    (result as Record<string, unknown>)[key] = value;
  }

  return result;
}

// ==================== 间距分析 ====================

/**
 * 分析间距一致性
 * @param gaps 间距数组
 * @param tolerancePercent 容差百分比，默认 20%
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

  // 计算平均值
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  // 计算方差
  const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avg, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);

  // 判断一致性：标准差小于平均值的指定百分比
  const tolerance = avg * (tolerancePercent / 100);
  const isConsistent = stdDev <= tolerance;

  // 四舍五入到整数
  const roundedGap = roundValue(avg);

  return { isConsistent, averageGap: avg, roundedGap, variance };
}

/**
 * 将间距四舍五入到常用值
 * 常用值: 0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64
 */
export function roundToCommonGap(gap: number): number {
  const COMMON_GAPS = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128];

  // 找最接近的常用值
  let closest = COMMON_GAPS[0];
  let minDiff = Math.abs(gap - closest);

  for (const commonGap of COMMON_GAPS) {
    const diff = Math.abs(gap - commonGap);
    if (diff < minDiff) {
      minDiff = diff;
      closest = commonGap;
    }
  }

  // 如果差距太大（超过 4px），使用四舍五入值
  if (minDiff > 4) {
    return roundValue(gap);
  }

  return closest;
}

// ==================== 导出信息优化 ====================

/**
 * 优化 exportInfo，省略与节点 id 相同的 nodeId
 */
export function optimizeExportInfo(
  nodeId: string,
  exportInfo: { type: string; format: string; nodeId?: string; fileName?: string }
): { type: string; format: string; nodeId?: string; fileName?: string } {
  const result = { ...exportInfo };

  // 如果 nodeId 与节点 id 相同，省略
  if (result.nodeId === nodeId) {
    delete result.nodeId;
  }

  return result;
}
