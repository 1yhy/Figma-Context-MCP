/**
 * 布局检测算法
 * 从绝对定位的设计稿元素中推断 Flex 布局
 *
 * 核心算法流程：
 * 1. 提取元素边界框 (Bounding Box)
 * 2. Y轴重叠检测分组为"行"
 * 3. X轴重叠检测分组为"列"
 * 4. 分析间距一致性
 * 5. 检测对齐方式
 * 6. 递归构建布局树
 */

// ==================== 类型定义 ====================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementRect extends BoundingBox {
  index: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export interface LayoutGroup {
  elements: ElementRect[];
  direction: 'row' | 'column' | 'none';
  gap: number;
  isGapConsistent: boolean;
  justifyContent: string;
  alignItems: string;
  bounds: BoundingBox;
}

export interface LayoutAnalysisResult {
  direction: 'row' | 'column' | 'none';
  confidence: number;
  gap: number;
  isGapConsistent: boolean;
  justifyContent: string;
  alignItems: string;
  rows: ElementRect[][];
  columns: ElementRect[][];
  overlappingElements: ElementRect[];
}

// ==================== 边界框工具函数 ====================

/**
 * 从样式对象提取边界框
 */
export function extractBoundingBox(cssStyles: Record<string, unknown>): BoundingBox | null {
  if (!cssStyles) return null;

  const x = parseFloat(String(cssStyles.left || '0').replace('px', ''));
  const y = parseFloat(String(cssStyles.top || '0').replace('px', ''));
  const width = parseFloat(String(cssStyles.width || '0').replace('px', ''));
  const height = parseFloat(String(cssStyles.height || '0').replace('px', ''));

  if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
    return null;
  }

  return { x, y, width, height };
}

/**
 * 将边界框转换为元素矩形（包含计算属性）
 */
export function toElementRect(box: BoundingBox, index: number): ElementRect {
  return {
    ...box,
    index,
    right: box.x + box.width,
    bottom: box.y + box.height,
    centerX: box.x + box.width / 2,
    centerY: box.y + box.height / 2,
  };
}

/**
 * 计算一组元素的外接矩形
 */
export function calculateBounds(rects: ElementRect[]): BoundingBox {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const minX = Math.min(...rects.map(r => r.x));
  const minY = Math.min(...rects.map(r => r.y));
  const maxX = Math.max(...rects.map(r => r.right));
  const maxY = Math.max(...rects.map(r => r.bottom));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// ==================== 重叠检测 ====================

/**
 * 检查两个元素在 Y 轴上是否重叠（用于行检测）
 * 如果两个元素的垂直范围有交集，则认为它们在同一行
 */
export function isOverlappingY(a: ElementRect, b: ElementRect, tolerance: number = 0): boolean {
  return !(a.bottom + tolerance < b.y || b.bottom + tolerance < a.y);
}

/**
 * 检查两个元素在 X 轴上是否重叠（用于列检测）
 * 如果两个元素的水平范围有交集，则认为它们在同一列
 */
export function isOverlappingX(a: ElementRect, b: ElementRect, tolerance: number = 0): boolean {
  return !(a.right + tolerance < b.x || b.right + tolerance < a.x);
}

/**
 * 检查两个元素是否完全重叠（需要 absolute 定位）
 */
export function isFullyOverlapping(a: ElementRect, b: ElementRect, threshold: number = 0.5): boolean {
  const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  const overlapArea = overlapX * overlapY;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const minArea = Math.min(areaA, areaB);

  return minArea > 0 && overlapArea / minArea > threshold;
}

// ==================== 行列分组算法 ====================

/**
 * 将元素按 Y 轴重叠分组为"行"
 * 核心算法：如果两个元素在 Y 轴上有重叠，它们属于同一行
 */
export function groupIntoRows(rects: ElementRect[], tolerance: number = 2): ElementRect[][] {
  if (rects.length === 0) return [];
  if (rects.length === 1) return [[rects[0]]];

  // 按 Y 坐标排序
  const sorted = [...rects].sort((a, b) => a.y - b.y);

  const rows: ElementRect[][] = [];
  let currentRow: ElementRect[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const elem = sorted[i];

    // 检查是否与当前行的任意元素在 Y 轴上重叠
    const overlapsWithRow = currentRow.some(rowElem => isOverlappingY(rowElem, elem, tolerance));

    if (overlapsWithRow) {
      currentRow.push(elem);
    } else {
      // 当前行完成，按 X 排序后保存
      rows.push(currentRow.sort((a, b) => a.x - b.x));
      currentRow = [elem];
    }
  }

  // 保存最后一行
  if (currentRow.length > 0) {
    rows.push(currentRow.sort((a, b) => a.x - b.x));
  }

  return rows;
}

/**
 * 将元素按 X 轴重叠分组为"列"
 * 核心算法：如果两个元素在 X 轴上有重叠，它们属于同一列
 */
export function groupIntoColumns(rects: ElementRect[], tolerance: number = 2): ElementRect[][] {
  if (rects.length === 0) return [];
  if (rects.length === 1) return [[rects[0]]];

  // 按 X 坐标排序
  const sorted = [...rects].sort((a, b) => a.x - b.x);

  const columns: ElementRect[][] = [];
  let currentColumn: ElementRect[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const elem = sorted[i];

    // 检查是否与当前列的任意元素在 X 轴上重叠
    const overlapsWithColumn = currentColumn.some(colElem => isOverlappingX(colElem, elem, tolerance));

    if (overlapsWithColumn) {
      currentColumn.push(elem);
    } else {
      // 当前列完成，按 Y 排序后保存
      columns.push(currentColumn.sort((a, b) => a.y - b.y));
      currentColumn = [elem];
    }
  }

  // 保存最后一列
  if (currentColumn.length > 0) {
    columns.push(currentColumn.sort((a, b) => a.y - b.y));
  }

  return columns;
}

/**
 * 检测完全重叠的元素（需要 absolute 定位）
 */
export function findOverlappingElements(rects: ElementRect[]): ElementRect[] {
  const overlapping: Set<number> = new Set();

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (isFullyOverlapping(rects[i], rects[j])) {
        overlapping.add(rects[i].index);
        overlapping.add(rects[j].index);
      }
    }
  }

  return rects.filter(r => overlapping.has(r.index));
}

// ==================== 间距分析 ====================

/**
 * 计算一组元素之间的间距
 */
export function calculateGaps(rects: ElementRect[], direction: 'horizontal' | 'vertical'): number[] {
  if (rects.length < 2) return [];

  const sorted = direction === 'horizontal'
    ? [...rects].sort((a, b) => a.x - b.x)
    : [...rects].sort((a, b) => a.y - b.y);

  const gaps: number[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    const gap = direction === 'horizontal'
      ? next.x - current.right
      : next.y - current.bottom;

    // 只记录正的间距
    if (gap >= 0) {
      gaps.push(gap);
    }
  }

  return gaps;
}

/**
 * 分析间距一致性
 */
export function analyzeGaps(gaps: number[], tolerancePercent: number = 20): {
  isConsistent: boolean;
  average: number;
  rounded: number;
  stdDev: number;
} {
  if (gaps.length === 0) {
    return { isConsistent: true, average: 0, rounded: 0, stdDev: 0 };
  }

  if (gaps.length === 1) {
    const rounded = roundToCommonValue(gaps[0]);
    return { isConsistent: true, average: gaps[0], rounded, stdDev: 0 };
  }

  const sum = gaps.reduce((a, b) => a + b, 0);
  const average = sum / gaps.length;

  const variance = gaps.reduce((acc, gap) => acc + Math.pow(gap - average, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);

  // 判断一致性：标准差小于平均值的指定百分比
  const tolerance = average * (tolerancePercent / 100);
  const isConsistent = average === 0 || stdDev <= tolerance;

  const rounded = roundToCommonValue(average);

  return { isConsistent, average, rounded, stdDev };
}

/**
 * 将间距四舍五入到常用值
 */
export function roundToCommonValue(value: number): number {
  const COMMON_VALUES = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128];

  // 找最接近的常用值
  let closest = COMMON_VALUES[0];
  let minDiff = Math.abs(value - closest);

  for (const common of COMMON_VALUES) {
    const diff = Math.abs(value - common);
    if (diff < minDiff) {
      minDiff = diff;
      closest = common;
    }
  }

  // 如果差距太大（超过 4px），使用四舍五入值
  if (minDiff > 4) {
    return Math.round(value);
  }

  return closest;
}

// ==================== 对齐方式检测 ====================

/**
 * 检测一组值是否对齐
 */
export function areValuesAligned(values: number[], tolerance: number = 3): boolean {
  if (values.length < 2) return true;

  const first = values[0];
  return values.every(v => Math.abs(v - first) <= tolerance);
}

/**
 * 分析对齐方式
 */
export function analyzeAlignment(rects: ElementRect[], bounds: BoundingBox): {
  horizontal: 'left' | 'center' | 'right' | 'stretch' | 'none';
  vertical: 'top' | 'center' | 'bottom' | 'stretch' | 'none';
} {
  if (rects.length === 0) {
    return { horizontal: 'none', vertical: 'none' };
  }

  const tolerance = Math.max(3, Math.min(bounds.width, bounds.height) * 0.02);

  // 水平对齐分析
  const lefts = rects.map(r => r.x);
  const rights = rects.map(r => r.right);
  const centerXs = rects.map(r => r.centerX);
  const widths = rects.map(r => r.width);

  let horizontal: 'left' | 'center' | 'right' | 'stretch' | 'none' = 'none';

  if (areValuesAligned(lefts, tolerance)) {
    horizontal = 'left';
  } else if (areValuesAligned(rights, tolerance)) {
    horizontal = 'right';
  } else if (areValuesAligned(centerXs, tolerance)) {
    horizontal = 'center';
  } else if (areValuesAligned(widths, tolerance) && widths[0] >= bounds.width * 0.9) {
    horizontal = 'stretch';
  }

  // 垂直对齐分析
  const tops = rects.map(r => r.y);
  const bottoms = rects.map(r => r.bottom);
  const centerYs = rects.map(r => r.centerY);
  const heights = rects.map(r => r.height);

  let vertical: 'top' | 'center' | 'bottom' | 'stretch' | 'none' = 'none';

  if (areValuesAligned(tops, tolerance)) {
    vertical = 'top';
  } else if (areValuesAligned(bottoms, tolerance)) {
    vertical = 'bottom';
  } else if (areValuesAligned(centerYs, tolerance)) {
    vertical = 'center';
  } else if (areValuesAligned(heights, tolerance) && heights[0] >= bounds.height * 0.9) {
    vertical = 'stretch';
  }

  return { horizontal, vertical };
}

/**
 * 转换对齐方式为 CSS justify-content 值
 */
export function toJustifyContent(alignment: string, hasGaps: boolean): string {
  switch (alignment) {
    case 'left':
    case 'top':
      return 'flex-start';
    case 'right':
    case 'bottom':
      return 'flex-end';
    case 'center':
      return 'center';
    case 'stretch':
      return hasGaps ? 'space-between' : 'flex-start';
    default:
      return 'flex-start';
  }
}

/**
 * 转换对齐方式为 CSS align-items 值
 */
export function toAlignItems(alignment: string): string {
  switch (alignment) {
    case 'left':
    case 'top':
      return 'flex-start';
    case 'right':
    case 'bottom':
      return 'flex-end';
    case 'center':
      return 'center';
    case 'stretch':
      return 'stretch';
    default:
      return 'stretch';
  }
}

// ==================== 布局方向检测 ====================

/**
 * 检测最佳布局方向
 * 核心逻辑：比较行分组和列分组的质量
 */
export function detectLayoutDirection(rects: ElementRect[]): {
  direction: 'row' | 'column' | 'none';
  confidence: number;
  reason: string;
} {
  if (rects.length < 2) {
    return { direction: 'none', confidence: 0, reason: '元素数量不足' };
  }

  const rows = groupIntoRows(rects);
  const columns = groupIntoColumns(rects);

  // 计算行布局分数
  const rowScore = calculateLayoutScore(rows, 'row', rects.length);

  // 计算列布局分数
  const columnScore = calculateLayoutScore(columns, 'column', rects.length);

  // 选择分数更高的布局
  if (rowScore.score > columnScore.score && rowScore.score > 0.3) {
    return {
      direction: 'row',
      confidence: rowScore.score,
      reason: rowScore.reason,
    };
  } else if (columnScore.score > rowScore.score && columnScore.score > 0.3) {
    return {
      direction: 'column',
      confidence: columnScore.score,
      reason: columnScore.reason,
    };
  }

  return { direction: 'none', confidence: 0, reason: '无明确布局模式' };
}

/**
 * 计算布局分数
 */
function calculateLayoutScore(
  groups: ElementRect[][],
  direction: 'row' | 'column',
  totalElements: number
): { score: number; reason: string } {
  if (groups.length === 0) {
    return { score: 0, reason: '无分组' };
  }

  // 分数因素：
  // 1. 分组数量合理性 (理想情况：每行/列只有一个或少数几个组)
  // 2. 每组内元素的间距一致性
  // 3. 元素覆盖率

  let score = 0;
  const reasons: string[] = [];

  // 1. 如果是行布局，理想情况是只有一行（所有元素水平排列）
  //    如果是列布局，理想情况是只有一列（所有元素垂直排列）
  if (groups.length === 1 && groups[0].length === totalElements) {
    score += 0.4;
    reasons.push('完美分组');
  } else if (groups.length <= 3) {
    score += 0.2;
    reasons.push('分组合理');
  }

  // 2. 分析间距一致性
  for (const group of groups) {
    if (group.length >= 2) {
      const gapDirection = direction === 'row' ? 'horizontal' : 'vertical';
      const gaps = calculateGaps(group, gapDirection);
      const gapAnalysis = analyzeGaps(gaps);

      if (gapAnalysis.isConsistent && gaps.length > 0) {
        score += 0.3 / groups.length;
        reasons.push(`间距一致(${Math.round(gapAnalysis.average)}px)`);
      }
    }
  }

  // 3. 检查交叉轴对齐
  for (const group of groups) {
    if (group.length >= 2) {
      const bounds = calculateBounds(group);
      const alignment = analyzeAlignment(group, bounds);
      const crossAlignment = direction === 'row' ? alignment.vertical : alignment.horizontal;

      if (crossAlignment !== 'none') {
        score += 0.2 / groups.length;
        reasons.push(`对齐良好(${crossAlignment})`);
      }
    }
  }

  // 4. 检查主轴上的元素分布
  const largestGroup = groups.reduce((a, b) => a.length > b.length ? a : b);
  if (largestGroup.length >= totalElements * 0.7) {
    score += 0.1;
    reasons.push('主要分布集中');
  }

  return {
    score: Math.min(1, score),
    reason: reasons.join(', ') || '无明显特征',
  };
}

// ==================== 完整布局分析 ====================

/**
 * 完整的布局分析
 * 返回布局方向、间距、对齐方式等所有信息
 */
export function analyzeLayout(rects: ElementRect[]): LayoutAnalysisResult {
  if (rects.length < 2) {
    return {
      direction: 'none',
      confidence: 0,
      gap: 0,
      isGapConsistent: true,
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      rows: [rects],
      columns: [rects],
      overlappingElements: [],
    };
  }

  // 检测重叠元素
  const overlappingElements = findOverlappingElements(rects);

  // 过滤掉重叠元素后分析布局
  const nonOverlapping = rects.filter(r => !overlappingElements.some(o => o.index === r.index));

  if (nonOverlapping.length < 2) {
    return {
      direction: 'none',
      confidence: 0,
      gap: 0,
      isGapConsistent: true,
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      rows: [rects],
      columns: [rects],
      overlappingElements,
    };
  }

  // 检测布局方向
  const { direction, confidence } = detectLayoutDirection(nonOverlapping);

  // 分组
  const rows = groupIntoRows(nonOverlapping);
  const columns = groupIntoColumns(nonOverlapping);

  // 计算间距
  const gapDirection = direction === 'row' ? 'horizontal' : 'vertical';
  const gaps = calculateGaps(
    direction === 'row' ? nonOverlapping.sort((a, b) => a.x - b.x) : nonOverlapping.sort((a, b) => a.y - b.y),
    gapDirection
  );
  const gapAnalysis = analyzeGaps(gaps);

  // 分析对齐方式
  const bounds = calculateBounds(nonOverlapping);
  const alignment = analyzeAlignment(nonOverlapping, bounds);

  // 确定 CSS 属性
  let justifyContent: string;
  let alignItems: string;

  if (direction === 'row') {
    justifyContent = toJustifyContent(alignment.horizontal, gaps.length > 0);
    alignItems = toAlignItems(alignment.vertical);
  } else if (direction === 'column') {
    justifyContent = toJustifyContent(alignment.vertical, gaps.length > 0);
    alignItems = toAlignItems(alignment.horizontal);
  } else {
    justifyContent = 'flex-start';
    alignItems = 'stretch';
  }

  return {
    direction,
    confidence,
    gap: gapAnalysis.rounded,
    isGapConsistent: gapAnalysis.isConsistent,
    justifyContent,
    alignItems,
    rows,
    columns,
    overlappingElements,
  };
}

// ==================== 递归布局树构建 ====================

export interface LayoutNode {
  type: 'container' | 'element';
  direction?: 'row' | 'column';
  gap?: number;
  justifyContent?: string;
  alignItems?: string;
  children?: LayoutNode[];
  elementIndex?: number;
  bounds: BoundingBox;
  needsAbsolute?: boolean;
}

/**
 * 递归构建布局树
 * 将扁平的元素列表转换为嵌套的布局结构
 */
export function buildLayoutTree(rects: ElementRect[], depth: number = 0, maxDepth: number = 5): LayoutNode {
  const bounds = calculateBounds(rects);

  // 单个元素直接返回
  if (rects.length === 1) {
    return {
      type: 'element',
      elementIndex: rects[0].index,
      bounds,
    };
  }

  // 达到最大深度，返回简单容器
  if (depth >= maxDepth) {
    return {
      type: 'container',
      direction: 'column',
      children: rects.map(r => ({
        type: 'element' as const,
        elementIndex: r.index,
        bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
      })),
      bounds,
    };
  }

  // 分析布局
  const analysis = analyzeLayout(rects);

  // 处理重叠元素
  const overlappingNodes: LayoutNode[] = analysis.overlappingElements.map(r => ({
    type: 'element' as const,
    elementIndex: r.index,
    bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
    needsAbsolute: true,
  }));

  // 过滤掉重叠元素
  const nonOverlapping = rects.filter(
    r => !analysis.overlappingElements.some(o => o.index === r.index)
  );

  if (nonOverlapping.length === 0) {
    // 所有元素都重叠
    return {
      type: 'container',
      children: overlappingNodes,
      bounds,
    };
  }

  if (analysis.direction === 'none' || analysis.confidence < 0.3) {
    // 无明确布局，使用默认垂直布局
    return {
      type: 'container',
      direction: 'column',
      children: [
        ...nonOverlapping.map(r => ({
          type: 'element' as const,
          elementIndex: r.index,
          bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
        })),
        ...overlappingNodes,
      ],
      bounds,
    };
  }

  // 根据布局方向分组
  const groups = analysis.direction === 'row' ? analysis.rows : analysis.columns;

  // 递归处理每个分组
  const children: LayoutNode[] = groups.map(group => {
    if (group.length === 1) {
      return {
        type: 'element' as const,
        elementIndex: group[0].index,
        bounds: { x: group[0].x, y: group[0].y, width: group[0].width, height: group[0].height },
      };
    }

    // 对于多元素分组，检查是否需要进一步分析（交叉方向）
    const crossDirection = analysis.direction === 'row' ? 'column' : 'row';
    const crossGroups = crossDirection === 'row'
      ? groupIntoRows(group)
      : groupIntoColumns(group);

    if (crossGroups.length > 1) {
      // 需要嵌套布局
      return buildLayoutTree(group, depth + 1, maxDepth);
    }

    // 简单分组，不需要嵌套
    const groupBounds = calculateBounds(group);
    return {
      type: 'container' as const,
      direction: crossDirection,
      children: group.map(r => ({
        type: 'element' as const,
        elementIndex: r.index,
        bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
      })),
      bounds: groupBounds,
    };
  });

  return {
    type: 'container',
    direction: analysis.direction,
    gap: analysis.isGapConsistent && analysis.gap > 0 ? analysis.gap : undefined,
    justifyContent: analysis.justifyContent !== 'flex-start' ? analysis.justifyContent : undefined,
    alignItems: analysis.alignItems !== 'stretch' ? analysis.alignItems : undefined,
    children: [...children, ...overlappingNodes],
    bounds,
  };
}

// ==================== 调试和可视化 ====================

/**
 * 生成布局分析报告（用于调试）
 */
export function generateLayoutReport(rects: ElementRect[]): string {
  const analysis = analyzeLayout(rects);
  const tree = buildLayoutTree(rects);

  const lines: string[] = [
    '=== 布局分析报告 ===',
    '',
    `元素数量: ${rects.length}`,
    `检测方向: ${analysis.direction} (置信度: ${(analysis.confidence * 100).toFixed(1)}%)`,
    `间距: ${analysis.gap}px (一致性: ${analysis.isGapConsistent ? '是' : '否'})`,
    `justifyContent: ${analysis.justifyContent}`,
    `alignItems: ${analysis.alignItems}`,
    '',
    `行分组: ${analysis.rows.length} 行`,
    ...analysis.rows.map((row, i) => `  行${i + 1}: ${row.length} 个元素 [${row.map(r => r.index).join(', ')}]`),
    '',
    `列分组: ${analysis.columns.length} 列`,
    ...analysis.columns.map((col, i) => `  列${i + 1}: ${col.length} 个元素 [${col.map(r => r.index).join(', ')}]`),
    '',
    `重叠元素: ${analysis.overlappingElements.length} 个`,
    '',
    '=== 布局树 ===',
    JSON.stringify(tree, null, 2),
  ];

  return lines.join('\n');
}
