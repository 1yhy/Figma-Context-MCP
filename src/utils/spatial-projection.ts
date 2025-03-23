import { SimplifiedNode } from "~/services/simplify-node-response.js";

/**
 * 表示一个矩形区域
 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 节点之间的空间关系类型
 */
export enum NodeRelationship {
  /** 包含关系 - 一个节点完全包含另一个节点 */
  CONTAINS = 'contains',

  /** 相交关系 - 两个节点有部分重叠 */
  INTERSECTS = 'intersects',

  /** 相离关系 - 两个节点没有重叠 */
  SEPARATE = 'separate'
}

/**
 * 投影线条，用于表示空间划分
 */
export interface ProjectionLine {
  /** 起始位置 */
  position: number;
  /** 投影方向: 'horizontal'(水平线) 或 'vertical'(垂直线) */
  direction: 'horizontal' | 'vertical';
  /** 覆盖的节点索引 */
  nodeIndices: number[];
}

/**
 * 安全地解析CSS数值，处理所有可能的无效输入
 * @param value CSS值字符串
 * @param defaultValue 解析失败时的默认值
 */
function safeParseFloat(value: string | undefined | null, defaultValue: number = 0): number {
  if (!value) return defaultValue;

  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 安全地获取节点的坐标值
 */
function getNodePosition(node: SimplifiedNode): { left: number; top: number } {
  let left = 0;
  let top = 0;

  // 优先使用绝对坐标
  if (typeof node._absoluteX === 'number') {
    left = node._absoluteX;
  } else if (node.cssStyles?.left) {
    left = safeParseFloat(node.cssStyles.left);
  }

  if (typeof node._absoluteY === 'number') {
    top = node._absoluteY;
  } else if (node.cssStyles?.top) {
    top = safeParseFloat(node.cssStyles.top);
  }

  return { left, top };
}

/**
 * 矩形相关的工具函数
 */
export class RectUtils {
  /**
   * 从SimplifiedNode创建Rect对象
   */
  static fromNode(node: SimplifiedNode): Rect | null {
    if (!node.cssStyles || !node.cssStyles.width || !node.cssStyles.height) {
      return null;
    }

    // 解析宽高，确保有默认值
    const width = safeParseFloat(node.cssStyles.width, 0);
    const height = safeParseFloat(node.cssStyles.height, 0);

    // 如果宽高为0，则不是有效矩形
    if (width <= 0 || height <= 0) {
      return null;
    }

    // 获取位置
    const { left, top } = getNodePosition(node);

    return { left, top, width, height };
  }

  /**
   * 判断一个矩形是否包含另一个矩形
   */
  static contains(a: Rect, b: Rect): boolean {
    return (
      a.left <= b.left &&
      a.top <= b.top &&
      a.left + a.width >= b.left + b.width &&
      a.top + a.height >= b.top + b.height
    );
  }

  /**
   * 判断两个矩形是否相交
   */
  static intersects(a: Rect, b: Rect): boolean {
    return !(
      a.left + a.width <= b.left ||
      b.left + b.width <= a.left ||
      a.top + a.height <= b.top ||
      b.top + b.height <= a.top
    );
  }

  /**
   * 计算两个矩形的交集
   */
  static intersection(a: Rect, b: Rect): Rect | null {
    if (!RectUtils.intersects(a, b)) {
      return null;
    }

    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.left + a.width, b.left + b.width);
    const bottom = Math.min(a.top + a.height, b.top + b.height);

    return {
      left,
      top,
      width: right - left,
      height: bottom - top
    };
  }

  /**
   * 分析两个节点之间的空间关系
   */
  static analyzeRelationship(a: Rect, b: Rect): NodeRelationship {
    if (RectUtils.contains(a, b)) {
      return NodeRelationship.CONTAINS;
    } else if (RectUtils.contains(b, a)) {
      return NodeRelationship.CONTAINS;
    } else if (RectUtils.intersects(a, b)) {
      return NodeRelationship.INTERSECTS;
    } else {
      return NodeRelationship.SEPARATE;
    }
  }
}

/**
 * 二维空间投影分析器
 */
export class SpatialProjectionAnalyzer {
  /**
   * 将简化节点列表转换为矩形列表
   */
  static nodesToRects(nodes: SimplifiedNode[]): Rect[] {
    return nodes
      .map(node => RectUtils.fromNode(node))
      .filter((rect): rect is Rect => rect !== null);
  }

  /**
   * 生成水平投影线（用于确定行）
   * @param rects 矩形列表
   * @param tolerance 坐标容差（像素）
   */
  static generateHorizontalProjectionLines(rects: Rect[], tolerance: number = 1): ProjectionLine[] {
    if (rects.length === 0) return [];

    // 收集所有节点的顶部和底部坐标
    const yCoordinates: number[] = [];
    rects.forEach(rect => {
      yCoordinates.push(rect.top);
      yCoordinates.push(rect.top + rect.height);
    });

    // 排序并过滤相近的坐标
    yCoordinates.sort((a, b) => a - b);
    const uniqueYCoordinates: number[] = [];

    for (let i = 0; i < yCoordinates.length; i++) {
      if (i === 0 || Math.abs(yCoordinates[i] - yCoordinates[i-1]) > tolerance) {
        uniqueYCoordinates.push(yCoordinates[i]);
      }
    }

    // 为每一个Y坐标创建投影线
    return uniqueYCoordinates.map(y => {
      const line: ProjectionLine = {
        position: y,
        direction: 'horizontal',
        nodeIndices: []
      };

      // 找出与这条线相交的所有节点
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (y >= rect.top && y <= rect.top + rect.height) {
          line.nodeIndices.push(i);
        }
      }

      return line;
    });
  }

  /**
   * 生成垂直投影线（用于确定列）
   * @param rects 矩形列表
   * @param tolerance 坐标容差（像素）
   */
  static generateVerticalProjectionLines(rects: Rect[], tolerance: number = 1): ProjectionLine[] {
    if (rects.length === 0) return [];

    // 收集所有节点的左侧和右侧坐标
    const xCoordinates: number[] = [];
    rects.forEach(rect => {
      xCoordinates.push(rect.left);
      xCoordinates.push(rect.left + rect.width);
    });

    // 排序并过滤相近的坐标
    xCoordinates.sort((a, b) => a - b);
    const uniqueXCoordinates: number[] = [];

    for (let i = 0; i < xCoordinates.length; i++) {
      if (i === 0 || Math.abs(xCoordinates[i] - xCoordinates[i-1]) > tolerance) {
        uniqueXCoordinates.push(xCoordinates[i]);
      }
    }

    // 为每一个X坐标创建投影线
    return uniqueXCoordinates.map(x => {
      const line: ProjectionLine = {
        position: x,
        direction: 'vertical',
        nodeIndices: []
      };

      // 找出与这条线相交的所有节点
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (x >= rect.left && x <= rect.left + rect.width) {
          line.nodeIndices.push(i);
        }
      }

      return line;
    });
  }

  /**
   * 将节点按行分组
   * @param nodes 节点列表
   * @param tolerance 容差（像素）
   */
  static groupNodesByRows(nodes: SimplifiedNode[], tolerance: number = 1): SimplifiedNode[][] {
    const rects = this.nodesToRects(nodes);
    if (rects.length === 0) return [nodes];

    // 获取节点的垂直投影（水平线）
    const projectionLines = this.generateHorizontalProjectionLines(rects, tolerance);

    // 找到行的分割点
    const rows: SimplifiedNode[][] = [];

    for (let i = 0; i < projectionLines.length - 1; i++) {
      const currentLine = projectionLines[i];
      const nextLine = projectionLines[i + 1];

      // 检查这两条线之间是否有节点
      const nodesBetweenLines = new Set<number>();

      // 找出完全位于这两条线之间的节点
      for (let j = 0; j < rects.length; j++) {
        const rect = rects[j];
        if (rect.top >= currentLine.position && rect.top + rect.height <= nextLine.position) {
          nodesBetweenLines.add(j);
        }
      }

      // 如果有节点，创建一个新行
      if (nodesBetweenLines.size > 0) {
        // 把这些节点按照从左到右排序
        const rowNodes = Array.from(nodesBetweenLines)
          .map(index => nodes[index])
          .sort((a, b) => {
            const { left: aLeft } = getNodePosition(a);
            const { left: bLeft } = getNodePosition(b);
            return aLeft - bLeft;
          });

        rows.push(rowNodes);
      }
    }

    // 处理没有分组的节点
    if (rows.length === 0) {
      // 如果没有找到行，则将所有节点作为一行
      rows.push([...nodes]);
    }

    return rows;
  }

  /**
   * 将一行节点按列分组
   * @param rowNodes 一行中的节点
   * @param tolerance 容差（像素）
   */
  static groupRowNodesByColumns(rowNodes: SimplifiedNode[], tolerance: number = 1): SimplifiedNode[][] {
    const rects = this.nodesToRects(rowNodes);
    if (rects.length === 0) return [rowNodes];

    // 获取节点的水平投影（垂直线）
    const projectionLines = this.generateVerticalProjectionLines(rects, tolerance);

    // 找到列的分割点
    const columns: SimplifiedNode[][] = [];

    for (let i = 0; i < projectionLines.length - 1; i++) {
      const currentLine = projectionLines[i];
      const nextLine = projectionLines[i + 1];

      // 检查这两条线之间是否有节点
      const nodesBetweenLines = new Set<number>();

      // 找出完全位于这两条线之间的节点
      for (let j = 0; j < rects.length; j++) {
        const rect = rects[j];
        if (rect.left >= currentLine.position && rect.left + rect.width <= nextLine.position) {
          nodesBetweenLines.add(j);
        }
      }

      // 如果有节点，创建一个新列
      if (nodesBetweenLines.size > 0) {
        const colNodes = Array.from(nodesBetweenLines).map(index => rowNodes[index]);
        columns.push(colNodes);
      }
    }

    // 处理没有分组的节点
    if (columns.length === 0) {
      // 如果没有找到列，则将所有节点作为一列
      columns.push([...rowNodes]);
    }

    return columns;
  }

  /**
   * 处理节点空间关系，构建包含关系
   * @param nodes 节点列表
   */
  static processNodeRelationships(nodes: SimplifiedNode[]): SimplifiedNode[] {
    if (nodes.length <= 1) return [...nodes];

    const rects = this.nodesToRects(nodes);
    if (rects.length !== nodes.length) {
      return nodes; // 无法处理所有节点，直接返回
    }

    // 找出所有的包含关系
    const containsRelations: [number, number][] = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = 0; j < rects.length; j++) {
        if (i !== j && RectUtils.contains(rects[i], rects[j])) {
          containsRelations.push([i, j]); // 节点i包含节点j
        }
      }
    }

    // 建立包含关系图
    const childrenMap = new Map<number, Set<number>>();
    const parentMap = new Map<number, number | null>();

    // 初始化所有节点都没有父节点
    for (let i = 0; i < nodes.length; i++) {
      parentMap.set(i, null);
      childrenMap.set(i, new Set<number>());
    }

    // 处理包含关系
    for (const [parent, child] of containsRelations) {
      childrenMap.get(parent)?.add(child);
      parentMap.set(child, parent);
    }

    // 修正多级包含关系，确保每个节点只有最直接的父节点
    for (const [child, parent] of parentMap.entries()) {
      if (parent === null) continue;

      // 检查父节点是否也有父节点
      let currentParent = parent;
      let grandParent = parentMap.get(currentParent);

      while (grandParent !== null) {
        // 如果祖父节点也直接包含当前子节点，则删除父节点到子节点的直接关系
        if (childrenMap.get(grandParent)?.has(child)) {
          childrenMap.get(currentParent)?.delete(child);
        }

        currentParent = grandParent;
        grandParent = parentMap.get(currentParent);
      }
    }

    // 构建新的节点树结构
    const rootIndices = Array.from(parentMap.entries())
      .filter(([_, parent]) => parent === null)
      .map(([index]) => index);

    const result: SimplifiedNode[] = [];

    // 递归构建节点树
    const buildNodeTree = (nodeIndex: number): SimplifiedNode => {
      const node = { ...nodes[nodeIndex] };
      const childIndices = Array.from(childrenMap.get(nodeIndex) || []);

      if (childIndices.length > 0) {
        node.children = childIndices.map(buildNodeTree);
      }

      return node;
    };

    // 从所有根节点开始构建
    for (const rootIndex of rootIndices) {
      result.push(buildNodeTree(rootIndex));
    }

    return result;
  }
}
