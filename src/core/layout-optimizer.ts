import { SimplifiedNode, SimplifiedDesign } from "~/services/simplify-node-response.js";
import { sanitizeNameForId } from "~/utils/file.js";
import { analyzeGapConsistency, roundToCommonGap } from "~/utils/css-optimize.js";

/**
 * Layout optimizer - optimizes UI layout structures
 */
export class LayoutOptimizer {
  /** Container ID counter, reset on every optimizeDesign call */
  private static containerIdCounter = 0;

  /**
   * Generate a unique container ID
   */
  private static generateContainerId(name: string): string {
    this.containerIdCounter++;
    const sanitizedName = sanitizeNameForId(name);
    return `layout-container-${this.containerIdCounter}-${sanitizedName}`;
  }

  /**
   * Optimize the design layout structure
   *
   * @param design Original simplified design
   * @returns Optimized design
   */
  static optimizeDesign(design: SimplifiedDesign): SimplifiedDesign {
    // Reset the counter to avoid accumulating across calls
    this.containerIdCounter = 0;

    // If no node data is present, return as is
    if (!design.nodes) {
      return design;
    }

    // Recursively optimize the node tree
    const optimizedNodes = design.nodes.map(node => this.optimizeNodeTree(node));

    // Update the design
    return {
      ...design,
      nodes: optimizedNodes
    };
  }

  /**
   * Recursively optimize the node tree
   *
   * @param node Node
   * @returns Optimized node
   */
  static optimizeNodeTree(node: SimplifiedNode): SimplifiedNode {
    // Return immediately if there are no children
    if (!node.children || node.children.length === 0) {
      return node;
    }

    // Recursively process each child node
    const optimizedChildren = node.children.map(child => this.optimizeNodeTree(child));

    // Analyze row/column layout for container nodes
    return this.optimizeContainer({
      ...node,
      children: optimizedChildren
    });
  }

  /**
   * Optimize container layout
   *
   * @param node Container node
   * @returns Optimized container node
   */
  static optimizeContainer(node: SimplifiedNode): SimplifiedNode {
    // Return immediately when zero or one child exists
    if (!node.children || node.children.length <= 1) {
      return node;
    }

    // Check whether this is a FRAME or GROUP container
    const isContainer = node.type === 'FRAME' || node.type === 'GROUP';

    // Analyze child spatial relationships to determine row or column layout
    const { isRow, isColumn, rowGap, columnGap, isGapConsistent,
            justifyContent, alignItems } = this.analyzeLayoutDirection(node.children);

    // When layout is a valid row or column
    if (isRow || isColumn) {
      // If already a container node, add flex styles directly instead of creating another wrapper
      if (isContainer) {
        const direction = isRow ? 'row' : 'column';
        const gap = isRow ? rowGap : columnGap;

        // Build flex styles (omit defaults)
        const flexStyles: Record<string, string> = {
          display: 'flex',
        };
        // Only set the direction explicitly for column (row is the default)
        if (direction === 'column') {
          flexStyles.flexDirection = direction;
        }
        // Only add gap when spacing is consistent and greater than zero
        if (gap > 0 && isGapConsistent) {
          flexStyles.gap = `${gap}px`;
        }
        if (justifyContent) flexStyles.justifyContent = justifyContent;
        if (alignItems) flexStyles.alignItems = alignItems;

        return {
          ...node,
          cssStyles: {
            ...node.cssStyles,
            ...flexStyles
          },
          children: node.children
        };
      }
      // If not a container but children share a clear layout, create a new layout container
      else {
        // Determine whether the children should be grouped
        const groups = this.groupChildrenByLayout(node.children, isRow);

        // If grouping yields one group containing all children, return the original node with flex styles
        if (groups.length === 1 && groups[0].length === node.children.length) {
          const direction = isRow ? 'row' : 'column';
          const gap = isRow ? rowGap : columnGap;

          const flexStyles: Record<string, string> = {
            display: 'flex',
          };
          if (direction === 'column') {
            flexStyles.flexDirection = direction;
          }
          if (gap > 0 && isGapConsistent) {
            flexStyles.gap = `${gap}px`;
          }
          if (justifyContent) flexStyles.justifyContent = justifyContent;
          if (alignItems) flexStyles.alignItems = alignItems;

          return {
            ...node,
            cssStyles: {
              ...node.cssStyles,
              ...flexStyles
            },
            children: node.children
          };
        }

        // Cases where grouping is required
        const groupContainers = groups.map((group, index) => {
          // Return the element itself when a group has only one member
          if (group.length === 1) {
            return group[0];
          }

          // Create a container for groups with multiple elements
          const direction = isRow ? 'column' : 'row';
          return this.createLayoutContainer(`group-${index}`, direction, group);
        });

        // Return the parent containing the grouped containers
        const direction = isRow ? 'row' : 'column';
        const flexStyles: Record<string, string> = {
          display: 'flex',
        };
        if (direction === 'column') {
          flexStyles.flexDirection = direction;
        }
        if (justifyContent) flexStyles.justifyContent = justifyContent;
        if (alignItems) flexStyles.alignItems = alignItems;

        return {
          ...node,
          cssStyles: {
            ...node.cssStyles,
            ...flexStyles
          },
          children: groupContainers
        };
      }
    }

    // If no clear row or column layout is detected, leave it unchanged
    return node;
  }

  /**
   * Analyze the layout direction of nodes
   */
  static analyzeLayoutDirection(nodes: SimplifiedNode[]): {
    isRow: boolean;
    isColumn: boolean;
    rowGap: number;
    columnGap: number;
    isGapConsistent: boolean;
    justifyContent: string | null;
    alignItems: string | null;
  } {
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
        isGapConsistent: true,
        justifyContent: null,
        alignItems: null
      };
    }

    // Analyze horizontal and vertical alignment
    const {
      horizontalAlignment,
      verticalAlignment,
      horizontalGap,
      verticalGap
    } = this.analyzeAlignment(rects);

    // Calculate confidence scores for row and column layouts
    const rowScore = this.calculateRowScore(rects, horizontalAlignment, verticalAlignment);
    const columnScore = this.calculateColumnScore(rects, horizontalAlignment, verticalAlignment);

    // Lower the detection threshold to identify layouts more readily
    const isRow = rowScore > columnScore && rowScore > 0.4;
    const isColumn = columnScore > rowScore && columnScore > 0.4;

    // Determine alignment (omit flex-start and stretch defaults)
    let justifyContent: string | null = null;
    let alignItems: string | null = null;

    if (isRow) {
      const jc = this.getJustifyContent(horizontalAlignment);
      justifyContent = jc !== 'flex-start' ? jc : null;  // Skip default values
      const ai = this.getAlignItems(verticalAlignment);
      alignItems = ai !== 'stretch' ? ai : null;  // Skip default values
    } else if (isColumn) {
      const jc = this.getJustifyContent(verticalAlignment);
      justifyContent = jc !== 'flex-start' ? jc : null;
      const ai = this.getAlignItems(horizontalAlignment);
      alignItems = ai !== 'stretch' ? ai : null;
    }

    // Select the gap metrics and consistency for the chosen direction
    const selectedGap = isRow ? horizontalGap : verticalGap;

    return {
      isRow,
      isColumn,
      rowGap: horizontalGap.gap,
      columnGap: verticalGap.gap,
      isGapConsistent: selectedGap.isConsistent,
      justifyContent,
      alignItems
    };
  }

  /**
   * Analyze node alignment
   */
  static analyzeAlignment(rects: { left: number; top: number; width: number; height: number }[]): {
    horizontalAlignment: string;
    verticalAlignment: string;
    horizontalGap: { gap: number; isConsistent: boolean };
    verticalGap: { gap: number; isConsistent: boolean };
  } {
    // Calculate positions and spacing on the horizontal axis
    const lefts = rects.map(rect => rect.left);
    const rights = rects.map(rect => rect.left + rect.width);

    // Calculate positions and spacing on the vertical axis
    const tops = rects.map(rect => rect.top);
    const bottoms = rects.map(rect => rect.top + rect.height);

    // Evaluate horizontal alignment
    const leftAligned = this.areValuesAligned(lefts);
    const rightAligned = this.areValuesAligned(rights);
    const centerHAligned = this.areValuesAligned(rects.map(rect => rect.left + rect.width / 2));

    // Evaluate vertical alignment
    const topAligned = this.areValuesAligned(tops);
    const bottomAligned = this.areValuesAligned(bottoms);
    const centerVAligned = this.areValuesAligned(rects.map(rect => rect.top + rect.height / 2));

    // Determine the horizontal alignment label
    let horizontalAlignment = 'none';
    if (leftAligned) horizontalAlignment = 'left';
    else if (rightAligned) horizontalAlignment = 'right';
    else if (centerHAligned) horizontalAlignment = 'center';

    // Determine the vertical alignment label
    let verticalAlignment = 'none';
    if (topAligned) verticalAlignment = 'top';
    else if (bottomAligned) verticalAlignment = 'bottom';
    else if (centerVAligned) verticalAlignment = 'center';

    // Compute the average gap (with consistency checks)
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
   * Check whether a set of values aligns within a tolerance
   */
  static areValuesAligned(values: number[], tolerance: number = 2): boolean {
    if (values.length < 2) return true;

    const firstValue = values[0];
    return values.every(value => Math.abs(value - firstValue) <= tolerance);
  }

  /**
   * Compute the average gap (with consistency checks)
   * @returns { gap: number, isConsistent: boolean }
   */
  static calculateAverageGap(
    rects: { left: number; top: number; width: number; height: number }[],
    direction: 'horizontal' | 'vertical'
  ): { gap: number; isConsistent: boolean } {
    if (rects.length < 2) return { gap: 0, isConsistent: true };

    // Sort nodes
    const sortedRects = [...rects].sort((a, b) => {
      if (direction === 'horizontal') {
        return a.left - b.left;
      } else {
        return a.top - b.top;
      }
    });

    // Calculate gaps between adjacent nodes
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

    // Use gap consistency analysis
    if (gaps.length === 0) return { gap: 0, isConsistent: true };

    const analysis = analyzeGapConsistency(gaps);
    // Round to a common value
    const roundedGap = roundToCommonGap(analysis.averageGap);

    return {
      gap: roundedGap,
      isConsistent: analysis.isConsistent
    };
  }

  /**
   * Calculate the confidence score for a row layout
   */
  static calculateRowScore(
    rects: { left: number; top: number; width: number; height: number }[],
    horizontalAlignment: string,
    verticalAlignment: string
  ): number {
    if (rects.length < 2) return 0;

    // Sort nodes
    const sortedByLeft = [...rects].sort((a, b) => a.left - b.left);

    // Calculate horizontal gaps between adjacent nodes
    let consecutiveHorizontalGaps = 0;
    for (let i = 0; i < sortedByLeft.length - 1; i++) {
      const current = sortedByLeft[i];
      const next = sortedByLeft[i + 1];

      const gap = next.left - (current.left + current.width);
      if (gap >= 0 && gap <= 50) consecutiveHorizontalGaps++;
    }

    // Calculate the uniformity of horizontal distribution
    const horizontalDistribution = consecutiveHorizontalGaps / (sortedByLeft.length - 1);

    // Vertical alignment increases the score
    const verticalAlignmentScore = (verticalAlignment !== 'none') ? 0.3 : 0;

    // Combine into a final score
    return horizontalDistribution * 0.7 + verticalAlignmentScore;
  }

  /**
   * Calculate the confidence score for a column layout
   */
  static calculateColumnScore(
    rects: { left: number; top: number; width: number; height: number }[],
    horizontalAlignment: string,
    verticalAlignment: string
  ): number {
    if (rects.length < 2) return 0;

    // Sort nodes
    const sortedByTop = [...rects].sort((a, b) => a.top - b.top);

    // Calculate vertical gaps between adjacent nodes
    let consecutiveVerticalGaps = 0;
    for (let i = 0; i < sortedByTop.length - 1; i++) {
      const current = sortedByTop[i];
      const next = sortedByTop[i + 1];

      const gap = next.top - (current.top + current.height);
      if (gap >= 0 && gap <= 50) consecutiveVerticalGaps++;
    }

    // Calculate the uniformity of vertical distribution
    const verticalDistribution = consecutiveVerticalGaps / (sortedByTop.length - 1);

    // Horizontal alignment increases the score
    const horizontalAlignmentScore = (horizontalAlignment !== 'none') ? 0.3 : 0;

    // Combine into a final score
    return verticalDistribution * 0.7 + horizontalAlignmentScore;
  }

  /**
   * Group child nodes based on layout characteristics
   */
  static groupChildrenByLayout(
    nodes: SimplifiedNode[],
    isRow: boolean
  ): SimplifiedNode[][] {
    if (nodes.length <= 1) return [nodes];

    // Extract positional information for nodes
    const rects = nodes.map((node, index) => {
      if (!node.cssStyles) return null;

      const left = parseFloat(node.cssStyles.left as string || '0');
      const top = parseFloat(node.cssStyles.top as string || '0');
      const width = parseFloat(node.cssStyles.width as string || '0');
      const height = parseFloat(node.cssStyles.height as string || '0');

      return { index, left, top, width, height };
    }).filter((rect): rect is { index: number; left: number; top: number; width: number; height: number } => rect !== null);

    // Sort according to the layout direction
    const sortedRects = [...rects].sort((a, b) => {
      if (isRow) {
        return a.left - b.left;
      } else {
        return a.top - b.top;
      }
    });

    // Look for potential grouping breakpoints
    const groups: SimplifiedNode[][] = [];
    let currentGroup: SimplifiedNode[] = [nodes[sortedRects[0].index]];

    for (let i = 1; i < sortedRects.length; i++) {
      const current = sortedRects[i - 1];
      const next = sortedRects[i];

      let shouldSplit = false;

      if (isRow) {
        // In a row layout, look for noticeable vertical shifts
        if (Math.abs(next.top - current.top) > 20) {
          shouldSplit = true;
        }
      } else {
        // In a column layout, look for noticeable horizontal shifts
        if (Math.abs(next.left - current.left) > 20) {
          shouldSplit = true;
        }
      }

      if (shouldSplit) {
        // End the current group and start a new one
        groups.push(currentGroup);
        currentGroup = [nodes[next.index]];
      } else {
        // Keep adding to the current group
        currentGroup.push(nodes[next.index]);
      }
    }

    // Add the final group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Convert justifyContent alignment into CSS values
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
   * Convert alignItems alignment into CSS values
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
   * Create a layout container node
   */
  static createLayoutContainer(
    name: string,
    direction: 'row' | 'column',
    children: SimplifiedNode[]
  ): SimplifiedNode {
    // Calculate the container bounding box
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    // Find the minimal bounding rectangle of all children
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

    // Calculate alignment
    const { justifyContent, alignItems } = this.analyzeLayoutDirection(children);

    // Return an empty container if no valid child nodes exist
    if (minLeft === Infinity || minTop === Infinity || maxRight === -Infinity || maxBottom === -Infinity) {
      return {
        id: this.generateContainerId(name),
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

    // Set container styles and position
    return {
      id: this.generateContainerId(name),
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
   * Calculate variance
   */
  static calculateVariance(values: number[]): number {
    if (values.length <= 1) return 0;

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, sq) => sum + sq, 0) / values.length;
  }

  // The following reimplements the analysisHorizontalLayout and analysisVerticalLayout methods
  // These methods now pull geometry directly from the node array instead of using the external extractElementRects helper

  /**
   * Helper method: extract element geometry
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
   * Analyze horizontal layout characteristics
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
    // Sort by left edges
    const sortedByLeft = [...rects].sort((a, b) => a.left - b.left);

    // Calculate horizontal gaps
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

    // Calculate the horizontal distribution score
    const distributionScore = consecutiveGaps / (sortedByLeft.length - 1);

    // Analyze horizontal alignment
    const lefts = sortedByLeft.map(r => r.left);
    const rights = sortedByLeft.map(r => r.right);
    const centers = sortedByLeft.map(r => r.centerX);

    // Calculate alignment tolerance relative to the container width
    const relativeTolerance = Math.max(5, bounds.width * 0.01); // At least 5px or 1% of the container width

    const leftAligned = this.areValuesAligned(lefts, relativeTolerance);
    const rightAligned = this.areValuesAligned(rights, relativeTolerance);
    const centerAligned = this.areValuesAligned(centers, relativeTolerance);

    // Calculate the alignment score
    const alignmentScore = (leftAligned || rightAligned || centerAligned) ? 0.5 : 0;

    // Calculate the average gap
    const averageGap = gaps.length > 0 ? totalGapWidth / gaps.length : 0;

    // Calculate gap consistency: the smaller the variance, the higher the consistency
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
   * Analyze vertical layout characteristics
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
    // Sort by top edges
    const sortedByTop = [...rects].sort((a, b) => a.top - b.top);

    // Calculate vertical gaps
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

    // Calculate the vertical distribution score
    const distributionScore = consecutiveGaps / (sortedByTop.length - 1);

    // Analyze vertical alignment
    const tops = sortedByTop.map(r => r.top);
    const bottoms = sortedByTop.map(r => r.bottom);
    const centers = sortedByTop.map(r => r.centerY);

    // Calculate alignment tolerance relative to the container height
    const relativeTolerance = Math.max(5, bounds.height * 0.01); // At least 5px or 1% of the container height

    const topAligned = this.areValuesAligned(tops, relativeTolerance);
    const bottomAligned = this.areValuesAligned(bottoms, relativeTolerance);
    const centerAligned = this.areValuesAligned(centers, relativeTolerance);

    // Calculate the alignment score
    const alignmentScore = (topAligned || bottomAligned || centerAligned) ? 0.5 : 0;

    // Calculate the average gap
    const averageGap = gaps.length > 0 ? totalGapHeight / gaps.length : 0;

    // Calculate gap consistency
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
   * Calculate bounds
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
   * Generate flex properties based on layout characteristics
   */
  static generateFlexProperties(
    isRow: boolean,
    mainAxisInfo: ReturnType<typeof LayoutOptimizer.analyzeHorizontalLayout> | ReturnType<typeof LayoutOptimizer.analyzeVerticalLayout>,
    crossAxisInfo: ReturnType<typeof LayoutOptimizer.analyzeHorizontalLayout> | ReturnType<typeof LayoutOptimizer.analyzeVerticalLayout>
  ): Record<string, any> {
    const properties: Record<string, any> = {
      flexDirection: isRow ? 'row' : 'column'
    };

    // Set gap values
    if (mainAxisInfo.averageGap > 0) {
      properties.gap = `${Math.round(mainAxisInfo.averageGap)}px`;
    }

    // Set main-axis alignment
    let justifyContent = 'flex-start';

    if (isRow) {
      // For row layouts, handle horizontal alignment
      const horizontalInfo = mainAxisInfo as ReturnType<typeof LayoutOptimizer.analyzeHorizontalLayout>;
      if (horizontalInfo.rightAligned) {
        justifyContent = 'flex-end';
      } else if (horizontalInfo.centerAligned) {
        justifyContent = 'center';
      } else if (horizontalInfo.gaps.length > 0 && horizontalInfo.gapConsistency > 0.7) {
        justifyContent = 'space-between';
      }
    } else {
      // For column layouts, handle vertical alignment
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

    // Set cross-axis alignment
    let alignItems = 'flex-start';

    if (isRow) {
      // For row layouts, handle vertical alignment
      const verticalInfo = crossAxisInfo as ReturnType<typeof LayoutOptimizer.analyzeVerticalLayout>;
      if (verticalInfo.bottomAligned) {
        alignItems = 'flex-end';
      } else if (verticalInfo.centerAligned) {
        alignItems = 'center';
      }
    } else {
      // For column layouts, handle horizontal alignment
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
