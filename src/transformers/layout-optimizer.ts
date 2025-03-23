import { SimplifiedNode, SimplifiedDesign } from "~/services/simplify-node-response.js";
import { SpatialProjectionAnalyzer, Rect } from "~/utils/spatial-projection.js";

/**
 * 布局优化器 - 优化UI设计的布局结构
 */
export class LayoutOptimizer {
  private static containerIdCounter = 1;

  /**
   * 优化设计的布局结构
   *
   * @param design 原始简化设计
   * @returns 优化后的设计
   */
  static optimizeDesign(design: SimplifiedDesign): SimplifiedDesign {
    // 如果没有节点数据，直接返回
    if (!design.nodes) {
      return design;
    }

    // 递归优化节点树
    const optimizedNodes = design.nodes.map(node => this.optimizeNodeTree(node));

    // 更新设计
    return {
      ...design,
      nodes: optimizedNodes
    };
  }

  /**
   * 递归优化节点树
   *
   * @param node 节点
   * @returns 优化后的节点
   */
  static optimizeNodeTree(node: SimplifiedNode): SimplifiedNode {
    // 如果没有子节点，直接返回
    if (!node.children || node.children.length === 0) {
      return node;
    }

    // 递归处理每个子节点
    const optimizedChildren = node.children.map(child => this.optimizeNodeTree(child));

    // 对容器节点进行行列布局分析
    return this.optimizeContainer({
      ...node,
      children: optimizedChildren
    });
  }

  /**
   * 优化容器布局
   *
   * @param node 容器节点
   * @returns 优化后的容器节点
   */
  static optimizeContainer(node: SimplifiedNode): SimplifiedNode {
    // 如果没有子节点或只有一个子节点，直接返回
    if (!node.children || node.children.length <= 1) {
      return node;
    }

    // 分析是否是FRAME或GROUP类型的容器
    const isContainer = node.type === 'FRAME' || node.type === 'GROUP';

    // 分析子节点的空间关系，确定是行布局还是列布局
    const { isRow, isColumn, rowGap, columnGap,
            justifyContent, alignItems } = this.analyzeLayoutDirection(node.children);

    // 如果是有效的行或列布局
    if (isRow || isColumn) {
      // 如果是容器节点，直接添加flex样式而不创建新容器
      if (isContainer) {
        const direction = isRow ? 'row' : 'column';
        const gap = isRow ? rowGap : columnGap;

        // 在原容器上添加flex样式
        return {
          ...node,
          cssStyles: {
            ...node.cssStyles,
            display: 'flex',
            flexDirection: direction,
            ...(gap > 0 ? { gap: `${Math.round(gap)}px` } : {}),
            ...(justifyContent ? { justifyContent } : {}),
            ...(alignItems ? { alignItems } : {})
          },
          children: node.children
        };
      }
      // 不是容器节点但子节点有明确的布局关系，创建新的布局容器
      else {
        // 分析是否需要对子节点进行分组
        const groups = this.groupChildrenByLayout(node.children, isRow);

        // 如果分组后只有一个组且包含所有子节点，直接返回带flex样式的原节点
        if (groups.length === 1 && groups[0].length === node.children.length) {
          const direction = isRow ? 'row' : 'column';
          const gap = isRow ? rowGap : columnGap;

          return {
            ...node,
            cssStyles: {
              ...node.cssStyles,
              display: 'flex',
              flexDirection: direction,
              ...(gap > 0 ? { gap: `${Math.round(gap)}px` } : {}),
              ...(justifyContent ? { justifyContent } : {}),
              ...(alignItems ? { alignItems } : {})
            },
            children: node.children
          };
        }

        // 需要分组的情况
        const groupContainers = groups.map((group, index) => {
          // 如果组内只有一个元素，直接返回该元素
          if (group.length === 1) {
            return group[0];
          }

          // 为多元素组创建容器
          const direction = isRow ? 'column' : 'row';
          return this.createLayoutContainer(`group-${index}`, direction, group);
        });

        // 返回包含分组容器的父节点
        const direction = isRow ? 'row' : 'column';
        return {
          ...node,
          cssStyles: {
            ...node.cssStyles,
            display: 'flex',
            flexDirection: direction,
            ...(justifyContent ? { justifyContent } : {}),
            ...(alignItems ? { alignItems } : {})
          },
          children: groupContainers
        };
      }
    }

    // 如果没有明显的行列布局，则保持原样
    return node;
  }

  /**
   * 分析节点的布局方向
   */
  static analyzeLayoutDirection(nodes: SimplifiedNode[]): {
    isRow: boolean;
    isColumn: boolean;
    rowGap: number;
    columnGap: number;
    justifyContent: string | null;
    alignItems: string | null;
  } {
    // 打印容器名称，帮助调试
    const containerName = nodes[0]?.name || "未知容器";
    console.log(`分析容器: ${containerName}, 子节点数量: ${nodes.length}`);

    const rects = nodes
      .map(node => {
        if (!node.cssStyles) return null;

        const left = parseFloat(node.cssStyles.left as string || '0');
        const top = parseFloat(node.cssStyles.top as string || '0');
        const width = parseFloat(node.cssStyles.width as string || '0');
        const height = parseFloat(node.cssStyles.height as string || '0');

        return { left, top, width, height };
      })
      .filter((rect): rect is { left: number; top: number; width: number; height: number } => rect !== null);

    if (rects.length < 2) {
      return {
        isRow: false,
        isColumn: false,
        rowGap: 0,
        columnGap: 0,
        justifyContent: null,
        alignItems: null
      };
    }

    // 分析水平和垂直方向的对齐情况
    const {
      horizontalAlignment,
      verticalAlignment,
      horizontalGap,
      verticalGap
    } = this.analyzeAlignment(rects);

    // 计算行和列的可信度分数
    const rowScore = this.calculateRowScore(rects, horizontalAlignment, verticalAlignment);
    const columnScore = this.calculateColumnScore(rects, horizontalAlignment, verticalAlignment);

    console.log(`容器: ${containerName}, 行分数: ${rowScore.toFixed(2)}, 列分数: ${columnScore.toFixed(2)}`);

    // 降低识别阈值，更容易识别布局
    const isRow = rowScore > columnScore && rowScore > 0.4;
    const isColumn = columnScore > rowScore && columnScore > 0.4;

    // 确定对齐方式
    let justifyContent: string | null = null;
    let alignItems: string | null = null;

    if (isRow) {
      justifyContent = this.getJustifyContent(horizontalAlignment);
      alignItems = this.getAlignItems(verticalAlignment);
    } else if (isColumn) {
      justifyContent = this.getJustifyContent(verticalAlignment);
      alignItems = this.getAlignItems(horizontalAlignment);
    }

    return {
      isRow,
      isColumn,
      rowGap: horizontalGap,
      columnGap: verticalGap,
      justifyContent,
      alignItems
    };
  }

  /**
   * 分析节点的对齐情况
   */
  static analyzeAlignment(rects: { left: number; top: number; width: number; height: number }[]): {
    horizontalAlignment: string;
    verticalAlignment: string;
    horizontalGap: number;
    verticalGap: number;
  } {
    // 计算水平方向的位置和间距
    const lefts = rects.map(rect => rect.left);
    const rights = rects.map(rect => rect.left + rect.width);

    const minLeft = Math.min(...lefts);
    const maxRight = Math.max(...rights);

    // 计算垂直方向的位置和间距
    const tops = rects.map(rect => rect.top);
    const bottoms = rects.map(rect => rect.top + rect.height);

    const minTop = Math.min(...tops);
    const maxBottom = Math.max(...bottoms);

    // 判断水平对齐情况
    const leftAligned = this.areValuesAligned(lefts);
    const rightAligned = this.areValuesAligned(rights);
    const centerHAligned = this.areValuesAligned(rects.map(rect => rect.left + rect.width / 2));

    // 判断垂直对齐情况
    const topAligned = this.areValuesAligned(tops);
    const bottomAligned = this.areValuesAligned(bottoms);
    const centerVAligned = this.areValuesAligned(rects.map(rect => rect.top + rect.height / 2));

    // 确定水平对齐方式
    let horizontalAlignment = 'none';
    if (leftAligned) horizontalAlignment = 'left';
    else if (rightAligned) horizontalAlignment = 'right';
    else if (centerHAligned) horizontalAlignment = 'center';

    // 确定垂直对齐方式
    let verticalAlignment = 'none';
    if (topAligned) verticalAlignment = 'top';
    else if (bottomAligned) verticalAlignment = 'bottom';
    else if (centerVAligned) verticalAlignment = 'center';

    // 计算平均间距
    const horizontalGap = this.calculateAverageGap(rects, 'horizontal');
    const verticalGap = this.calculateAverageGap(rects, 'vertical');

    return {
      horizontalAlignment,
      verticalAlignment,
      horizontalGap,
      verticalGap
    };
  }

  /**
   * 判断一组值是否对齐（在一定容差范围内）
   */
  static areValuesAligned(values: number[], tolerance: number = 2): boolean {
    if (values.length < 2) return true;

    const firstValue = values[0];
    return values.every(value => Math.abs(value - firstValue) <= tolerance);
  }

  /**
   * 计算平均间距
   */
  static calculateAverageGap(
    rects: { left: number; top: number; width: number; height: number }[],
    direction: 'horizontal' | 'vertical'
  ): number {
    if (rects.length < 2) return 0;

    // 排序节点
    const sortedRects = [...rects].sort((a, b) => {
      if (direction === 'horizontal') {
        return a.left - b.left;
      } else {
        return a.top - b.top;
      }
    });

    // 计算相邻节点间的间距
    const gaps: number[] = [];
    for (let i = 0; i < sortedRects.length - 1; i++) {
      const current = sortedRects[i];
      const next = sortedRects[i + 1];

      if (direction === 'horizontal') {
        const gap = next.left - (current.left + current.width);
        if (gap > 0) gaps.push(gap);
      } else {
        const gap = next.top - (current.top + current.height);
        if (gap > 0) gaps.push(gap);
      }
    }

    // 计算平均间距
    if (gaps.length === 0) return 0;
    return gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  }

  /**
   * 计算行布局的可信度分数
   */
  static calculateRowScore(
    rects: { left: number; top: number; width: number; height: number }[],
    horizontalAlignment: string,
    verticalAlignment: string
  ): number {
    if (rects.length < 2) return 0;

    // 排序节点
    const sortedByLeft = [...rects].sort((a, b) => a.left - b.left);

    // 计算相邻节点间的水平间距
    let consecutiveHorizontalGaps = 0;
    for (let i = 0; i < sortedByLeft.length - 1; i++) {
      const current = sortedByLeft[i];
      const next = sortedByLeft[i + 1];

      const gap = next.left - (current.left + current.width);
      if (gap >= 0 && gap <= 50) consecutiveHorizontalGaps++;
    }

    // 计算水平分布的均匀性
    const horizontalDistribution = consecutiveHorizontalGaps / (sortedByLeft.length - 1);

    // 垂直对齐增加分数
    const verticalAlignmentScore = (verticalAlignment !== 'none') ? 0.3 : 0;

    // 综合评分
    return horizontalDistribution * 0.7 + verticalAlignmentScore;
  }

  /**
   * 计算列布局的可信度分数
   */
  static calculateColumnScore(
    rects: { left: number; top: number; width: number; height: number }[],
    horizontalAlignment: string,
    verticalAlignment: string
  ): number {
    if (rects.length < 2) return 0;

    // 排序节点
    const sortedByTop = [...rects].sort((a, b) => a.top - b.top);

    // 计算相邻节点间的垂直间距
    let consecutiveVerticalGaps = 0;
    for (let i = 0; i < sortedByTop.length - 1; i++) {
      const current = sortedByTop[i];
      const next = sortedByTop[i + 1];

      const gap = next.top - (current.top + current.height);
      if (gap >= 0 && gap <= 50) consecutiveVerticalGaps++;
    }

    // 计算垂直分布的均匀性
    const verticalDistribution = consecutiveVerticalGaps / (sortedByTop.length - 1);

    // 水平对齐增加分数
    const horizontalAlignmentScore = (horizontalAlignment !== 'none') ? 0.3 : 0;

    // 综合评分
    return verticalDistribution * 0.7 + horizontalAlignmentScore;
  }

  /**
   * 将子节点按布局特征分组
   */
  static groupChildrenByLayout(
    nodes: SimplifiedNode[],
    isRow: boolean
  ): SimplifiedNode[][] {
    if (nodes.length <= 1) return [nodes];

    // 提取节点的位置信息
    const rects = nodes.map((node, index) => {
      if (!node.cssStyles) return null;

      const left = parseFloat(node.cssStyles.left as string || '0');
      const top = parseFloat(node.cssStyles.top as string || '0');
      const width = parseFloat(node.cssStyles.width as string || '0');
      const height = parseFloat(node.cssStyles.height as string || '0');

      return { index, left, top, width, height };
    }).filter((rect): rect is { index: number; left: number; top: number; width: number; height: number } => rect !== null);

    // 根据布局方向排序
    const sortedRects = [...rects].sort((a, b) => {
      if (isRow) {
        return a.left - b.left;
      } else {
        return a.top - b.top;
      }
    });

    // 寻找可能的分组点
    const groups: SimplifiedNode[][] = [];
    let currentGroup: SimplifiedNode[] = [nodes[sortedRects[0].index]];

    for (let i = 1; i < sortedRects.length; i++) {
      const current = sortedRects[i - 1];
      const next = sortedRects[i];

      let shouldSplit = false;

      if (isRow) {
        // 在行布局中，检查垂直位置是否有明显变化
        if (Math.abs(next.top - current.top) > 20) {
          shouldSplit = true;
        }
      } else {
        // 在列布局中，检查水平位置是否有明显变化
        if (Math.abs(next.left - current.left) > 20) {
          shouldSplit = true;
        }
      }

      if (shouldSplit) {
        // 结束当前组并开始新组
        groups.push(currentGroup);
        currentGroup = [nodes[next.index]];
      } else {
        // 继续添加到当前组
        currentGroup.push(nodes[next.index]);
      }
    }

    // 添加最后一组
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * 将justifyContent对齐方式转换为CSS值
   */
  static getJustifyContent(alignment: string): string | null {
    switch (alignment) {
      case 'left':
      case 'top':
        return 'flex-start';
      case 'right':
      case 'bottom':
        return 'flex-end';
      case 'center':
        return 'center';
      default:
        return 'space-between';
    }
  }

  /**
   * 将alignItems对齐方式转换为CSS值
   */
  static getAlignItems(alignment: string): string | null {
    switch (alignment) {
      case 'left':
      case 'top':
        return 'flex-start';
      case 'right':
      case 'bottom':
        return 'flex-end';
      case 'center':
        return 'center';
      default:
        return null;
    }
  }

  /**
   * 创建布局容器节点
   */
  static createLayoutContainer(
    name: string,
    direction: 'row' | 'column',
    children: SimplifiedNode[]
  ): SimplifiedNode {
    // 计算容器的边界框
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    // 找出所有子节点的最小外接矩形
    children.forEach(child => {
      if (!child.cssStyles) return;

      const left = parseFloat(child.cssStyles.left as string || '0');
      const top = parseFloat(child.cssStyles.top as string || '0');
      const width = parseFloat(child.cssStyles.width as string || '0');
      const height = parseFloat(child.cssStyles.height as string || '0');

      minLeft = Math.min(minLeft, left);
      minTop = Math.min(minTop, top);
      maxRight = Math.max(maxRight, left + width);
      maxBottom = Math.max(maxBottom, top + height);
    });

    // 计算对齐方式
    const { justifyContent, alignItems } = this.analyzeLayoutDirection(children);

    // 如果没有有效的子节点，返回空容器
    if (minLeft === Infinity || minTop === Infinity || maxRight === -Infinity || maxBottom === -Infinity) {
      return {
        id: `container-${this.containerIdCounter++}-${name}`,
        name: `Layout Container ${name}`,
        type: 'FRAME',
        cssStyles: {
          display: 'flex',
          flexDirection: direction,
          width: '100%',
          height: 'auto'
        },
        children
      };
    }

    // 设置容器样式和位置
    return {
      id: `container-${this.containerIdCounter++}-${name}`,
      name: `Layout Container ${name}`,
      type: 'FRAME',
      cssStyles: {
        display: 'flex',
        flexDirection: direction,
        position: 'absolute',
        left: `${minLeft}px`,
        top: `${minTop}px`,
        width: `${maxRight - minLeft}px`,
        height: `${maxBottom - minTop}px`,
        ...(justifyContent ? { justifyContent } : {}),
        ...(alignItems ? { alignItems } : {})
      },
      children
    };
  }

  /**
   * 计算方差
   */
  static calculateVariance(values: number[]): number {
    if (values.length <= 1) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, sq) => sum + sq, 0) / values.length;
  }

  // 以下是重新实现的analysisHorizontalLayout和analysisVerticalLayout方法
  // 这些方法现在是从节点数组中直接提取位置信息，不再使用外部的extractElementRects

  /**
   * 辅助方法：提取元素位置信息
   */
  static extractElementRects(elements: SimplifiedNode[]): Array<{
    index: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  }> {
    return elements
      .map((element, index) => {
        if (!element.cssStyles) return null;

        const left = parseFloat(element.cssStyles.left as string || '0');
        const top = parseFloat(element.cssStyles.top as string || '0');
        const width = parseFloat(element.cssStyles.width as string || '0');
        const height = parseFloat(element.cssStyles.height as string || '0');
        const right = left + width;
        const bottom = top + height;
        const centerX = left + width / 2;
        const centerY = top + height / 2;

        return { index, left, top, right, bottom, width, height, centerX, centerY };
      })
      .filter(rect => rect !== null) as Array<{
        index: number;
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
        centerX: number;
        centerY: number;
      }>;
  }

  /**
   * 分析水平布局特征
   */
  static analyzeHorizontalLayout(
    rects: ReturnType<typeof LayoutOptimizer.extractElementRects>,
    bounds: { left: number; top: number; right: number; bottom: number; width: number; height: number }
  ): {
    distributionScore: number;
    alignmentScore: number;
    leftAligned: boolean;
    rightAligned: boolean;
    centerAligned: boolean;
    averageGap: number;
    gapConsistency: number;
    gaps: number[];
  } {
    // 按左边界排序
    const sortedByLeft = [...rects].sort((a, b) => a.left - b.left);

    // 计算水平间距
    const gaps: number[] = [];
    let consecutiveGaps = 0;
    let totalGapWidth = 0;

    for (let i = 0; i < sortedByLeft.length - 1; i++) {
      const current = sortedByLeft[i];
      const next = sortedByLeft[i + 1];
      const gap = next.left - current.right;

      if (gap >= 0) {
        gaps.push(gap);
        totalGapWidth += gap;
        consecutiveGaps++;
      }
    }

    // 计算水平分布得分
    const distributionScore = consecutiveGaps / (sortedByLeft.length - 1);

    // 分析水平对齐
    const lefts = sortedByLeft.map(r => r.left);
    const rights = sortedByLeft.map(r => r.right);
    const centers = sortedByLeft.map(r => r.centerX);

    // 计算相对于容器宽度的对齐容差
    const relativeTolerance = Math.max(5, bounds.width * 0.01); // 至少5px或容器宽度的1%

    const leftAligned = this.areValuesAligned(lefts, relativeTolerance);
    const rightAligned = this.areValuesAligned(rights, relativeTolerance);
    const centerAligned = this.areValuesAligned(centers, relativeTolerance);

    // 计算对齐得分
    const alignmentScore = (leftAligned || rightAligned || centerAligned) ? 0.5 : 0;

    // 计算平均间距
    const averageGap = gaps.length > 0 ? totalGapWidth / gaps.length : 0;

    // 计算间距一致性：间距方差越小，一致性越高
    const gapConsistency = gaps.length > 1 ?
      1 - this.calculateVariance(gaps) / (averageGap * averageGap + 0.1) : 0;

    return {
      distributionScore,
      alignmentScore,
      leftAligned,
      rightAligned,
      centerAligned,
      averageGap,
      gapConsistency,
      gaps
    };
  }

  /**
   * 分析垂直布局特征
   */
  static analyzeVerticalLayout(
    rects: ReturnType<typeof LayoutOptimizer.extractElementRects>,
    bounds: { left: number; top: number; right: number; bottom: number; width: number; height: number }
  ): {
    distributionScore: number;
    alignmentScore: number;
    topAligned: boolean;
    bottomAligned: boolean;
    centerAligned: boolean;
    averageGap: number;
    gapConsistency: number;
    gaps: number[];
  } {
    // 按顶边界排序
    const sortedByTop = [...rects].sort((a, b) => a.top - b.top);

    // 计算垂直间距
    const gaps: number[] = [];
    let consecutiveGaps = 0;
    let totalGapHeight = 0;

    for (let i = 0; i < sortedByTop.length - 1; i++) {
      const current = sortedByTop[i];
      const next = sortedByTop[i + 1];
      const gap = next.top - current.bottom;

      if (gap >= 0) {
        gaps.push(gap);
        totalGapHeight += gap;
        consecutiveGaps++;
      }
    }

    // 计算垂直分布得分
    const distributionScore = consecutiveGaps / (sortedByTop.length - 1);

    // 分析垂直对齐
    const tops = sortedByTop.map(r => r.top);
    const bottoms = sortedByTop.map(r => r.bottom);
    const centers = sortedByTop.map(r => r.centerY);

    // 计算相对于容器高度的对齐容差
    const relativeTolerance = Math.max(5, bounds.height * 0.01); // 至少5px或容器高度的1%

    const topAligned = this.areValuesAligned(tops, relativeTolerance);
    const bottomAligned = this.areValuesAligned(bottoms, relativeTolerance);
    const centerAligned = this.areValuesAligned(centers, relativeTolerance);

    // 计算对齐得分
    const alignmentScore = (topAligned || bottomAligned || centerAligned) ? 0.5 : 0;

    // 计算平均间距
    const averageGap = gaps.length > 0 ? totalGapHeight / gaps.length : 0;

    // 计算间距一致性
    const gapConsistency = gaps.length > 1 ?
      1 - this.calculateVariance(gaps) / (averageGap * averageGap + 0.1) : 0;

    return {
      distributionScore,
      alignmentScore,
      topAligned,
      bottomAligned,
      centerAligned,
      averageGap,
      gapConsistency,
      gaps
    };
  }

  /**
   * 计算边界
   */
  static calculateBounds(rects: ReturnType<typeof LayoutOptimizer.extractElementRects>) {
    const left = Math.min(...rects.map(r => r.left));
    const top = Math.min(...rects.map(r => r.top));
    const right = Math.max(...rects.map(r => r.right));
    const bottom = Math.max(...rects.map(r => r.bottom));

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  /**
   * 根据布局特征生成flex属性
   */
  static generateFlexProperties(
    isRow: boolean,
    mainAxisInfo: ReturnType<typeof LayoutOptimizer.analyzeHorizontalLayout> | ReturnType<typeof LayoutOptimizer.analyzeVerticalLayout>,
    crossAxisInfo: ReturnType<typeof LayoutOptimizer.analyzeHorizontalLayout> | ReturnType<typeof LayoutOptimizer.analyzeVerticalLayout>
  ): Record<string, any> {
    const properties: Record<string, any> = {
      flexDirection: isRow ? 'row' : 'column'
    };

    // 设置间距
    if (mainAxisInfo.averageGap > 0) {
      properties.gap = `${Math.round(mainAxisInfo.averageGap)}px`;
    }

    // 设置主轴对齐方式
    let justifyContent = 'flex-start';

    if (isRow) {
      // 在水平布局中，处理水平方向的对齐
      const horizontalInfo = mainAxisInfo as ReturnType<typeof LayoutOptimizer.analyzeHorizontalLayout>;
      if (horizontalInfo.rightAligned) {
        justifyContent = 'flex-end';
      } else if (horizontalInfo.centerAligned) {
        justifyContent = 'center';
      } else if (horizontalInfo.gaps.length > 0 && horizontalInfo.gapConsistency > 0.7) {
        justifyContent = 'space-between';
      }
    } else {
      // 在垂直布局中，处理垂直方向的对齐
      const verticalInfo = mainAxisInfo as ReturnType<typeof LayoutOptimizer.analyzeVerticalLayout>;
      if (verticalInfo.bottomAligned) {
        justifyContent = 'flex-end';
      } else if (verticalInfo.centerAligned) {
        justifyContent = 'center';
      } else if (verticalInfo.gaps.length > 0 && verticalInfo.gapConsistency > 0.7) {
        justifyContent = 'space-between';
      }
    }

    properties.justifyContent = justifyContent;

    // 设置交叉轴对齐方式
    let alignItems = 'flex-start';

    if (isRow) {
      // 在水平布局中，处理垂直方向的对齐
      const verticalInfo = crossAxisInfo as ReturnType<typeof LayoutOptimizer.analyzeVerticalLayout>;
      if (verticalInfo.bottomAligned) {
        alignItems = 'flex-end';
      } else if (verticalInfo.centerAligned) {
        alignItems = 'center';
      }
    } else {
      // 在垂直布局中，处理水平方向的对齐
      const horizontalInfo = crossAxisInfo as ReturnType<typeof LayoutOptimizer.analyzeHorizontalLayout>;
      if (horizontalInfo.rightAligned) {
        alignItems = 'flex-end';
      } else if (horizontalInfo.centerAligned) {
        alignItems = 'center';
      }
    }

    properties.alignItems = alignItems;

    return properties;
  }
}
