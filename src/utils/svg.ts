import type { SimplifiedNode } from "~/services/simplify-node-response.js";

// ==================== 常量定义 ====================

/** SVG 节点类型 */
const SVG_NODE_TYPES = ["VECTOR", "ELLIPSE", "LINE", "POLYGON", "STAR", "BOOLEAN_OPERATION"] as const;

/** 可能包含 SVG 的容器类型 */
const SVG_CONTAINER_TYPES = ["FRAME", "GROUP"] as const;

type SVGNodeType = (typeof SVG_NODE_TYPES)[number];
type SVGContainerType = (typeof SVG_CONTAINER_TYPES)[number];

// ==================== 类型守卫 ====================

/**
 * 检查节点类型是否为 SVG 类型
 */
function isSVGNodeType(type: string): type is SVGNodeType {
  return SVG_NODE_TYPES.includes(type as SVGNodeType);
}

/**
 * 检查节点类型是否为 SVG 容器类型
 */
function isSVGContainerType(type: string): type is SVGContainerType {
  return SVG_CONTAINER_TYPES.includes(type as SVGContainerType);
}

// ==================== 主要函数 ====================

/** 用于类型检查的节点接口 */
interface NodeLike {
  type?: string;
  exportSettings?: { format?: string[] };
  cssStyles?: Record<string, unknown>;
  exportInfo?: { format?: string };
  children?: NodeLike[];
}

/**
 * 从节点获取背景图片
 */
function getBackgroundImage(node: NodeLike): string | undefined {
  return node.cssStyles?.backgroundImage as string | undefined;
}

/**
 * 判断节点是否为 SVG 元素
 *
 * 判断条件：
 * 1. 导出设置指定为 SVG
 * 2. 节点类型为 SVG 类型且无背景图片
 * 3. 节点已标记为 SVG 导出格式
 * 4. 容器节点的所有子元素都是 SVG 相关
 */
export function isSVGNode(node: NodeLike): boolean {
  const nodeType = node.type || "";

  // 1. 检查导出设置
  if (node.exportSettings?.format?.[0] === "SVG") {
    return true;
  }

  // 2. 节点类型为 SVG 类型且不包含背景图片
  if (isSVGNodeType(nodeType) && !getBackgroundImage(node)) {
    return true;
  }

  // 3. 节点已明确标记为 SVG 导出格式
  if (node.exportInfo?.format === "SVG") {
    return true;
  }

  // 4. 容器节点：检查是否所有子元素都是 SVG 相关
  if (isSVGContainerType(nodeType) && Array.isArray(node.children) && node.children.length > 0) {
    const allChildrenAreSVG = node.children.every((child) => isNodeSVGRelated(child));
    if (allChildrenAreSVG) {
      return true;
    }
  }

  return false;
}

/**
 * 递归检查节点是否为 SVG 相关节点
 */
function isNodeSVGRelated(node: NodeLike): boolean {
  const nodeType = node.type || "";

  // 如果是 SVG 节点类型，直接返回 true
  if (isSVGNodeType(nodeType)) {
    return true;
  }

  // 如果是容器节点，检查是否所有子节点都是 SVG 相关的
  if (isSVGContainerType(nodeType) && Array.isArray(node.children) && node.children.length > 0) {
    return node.children.every(isNodeSVGRelated);
  }

  // 其他类型节点都不是 SVG 相关的
  return false;
}

/**
 * 自下而上处理 SVG 节点
 *
 * 递归处理节点树，将纯 SVG 容器标记为 SVG 导出
 *
 * @param node 要处理的节点
 * @param generateFileName 文件名生成函数
 * @returns 是否为 SVG 节点
 */
export function processSVGNodesBottomUp(
  node: SimplifiedNode,
  generateFileName: (name: string, format: string) => string,
): boolean {
  // 无子节点时直接判断当前节点
  if (!node.children || node.children.length === 0) {
    return isSVGNode(node);
  }

  // 先递归处理所有子节点（自下而上的关键步骤）
  const childResults = node.children.map((child) => processSVGNodesBottomUp(child, generateFileName));

  // 处理容器节点
  if (isSVGContainerType(node.type)) {
    // 检查所有子节点是否都已被标记为 SVG 或本身就是 SVG
    const allChildrenAreSVG = node.children.every((child) => isSVGNode(child));

    if (allChildrenAreSVG) {
      // 删除子节点，标记为整体 SVG 导出
      delete node.children;
      node.exportInfo = {
        type: "IMAGE",
        format: "SVG",
        nodeId: node.id,
        fileName: generateFileName(node.name, "SVG"),
      };
      return true;
    }
  }

  // 如果不满足 SVG 条件，检查当前节点本身是否为 SVG
  return isSVGNode(node);
}
