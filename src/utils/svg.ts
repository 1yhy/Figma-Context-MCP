// SVG可能的节点类型
const SVG_NODE_TYPES = ['VECTOR', 'ELLIPSE', 'LINE', 'POLYGON', 'STAR', 'BOOLEAN_OPERATION'] as const;

// 可能包含SVG的容器类型
const SVG_CONTAINER_TYPES = ['FRAME', 'GROUP'] as const;

/**
 * 判断节点是否为SVG元素
 */
export function isSVGNode(node: any) {
  if (node.exportSettings?.format?.[0] === 'SVG') {
    return true;
  }

  // 节点类型为SVG类型且不包含背景图片
  if (SVG_NODE_TYPES.includes(node.type) && !node.cssStyles?.backgroundImage) {
    return true;
  }

  // 节点已明确标记为SVG导出格式
  if (node.exportInfo && node.exportInfo.format === 'SVG') {
    return true;
  }

  // 节点为图标组：FRAME或GROUP包含SVG子元素
  if (SVG_CONTAINER_TYPES.includes(node.type) &&
      node.children && Array.isArray(node.children)) {

    // 递归检查节点是否为SVG相关节点（包括其所有子节点）
    const isNodeSVGRelated = (node: any): boolean => {
      // 如果是SVG节点类型，直接返回true
      if (SVG_NODE_TYPES.includes(node.type)) {
        return true;
      }

      // 如果是容器节点，检查是否所有子节点都是SVG相关的
      if (SVG_CONTAINER_TYPES.includes(node.type) &&
          node.children && Array.isArray(node.children)) {
        // 必须至少有一个子节点
        if (node.children.length === 0) {
          return false;
        }
        // 所有子节点必须都是SVG相关的
        return node.children.every(isNodeSVGRelated);
      }

      // 其他类型节点都不是SVG相关的
      return false;
    };

    // 检查当前节点的所有子节点是否都是SVG相关的
    if (node.children.length > 0 && node.children.every(isNodeSVGRelated)) {
      return true;
    }
  }

  return false;
}

/**
 * 自下而上处理SVG节点，确保SVG特性从子节点传递到父节点
 */
export function processSVGNodesBottomUp(node: any, generateFileName: (name: string, format: string) => string): boolean {
  // 无子节点时直接判断当前节点
  if (!node.children || !node.children.length) {
    return isSVGNode(node);
  }

  // 处理框架和组的子节点
  if (SVG_CONTAINER_TYPES.includes(node.type) &&
      node.children && node.children.length > 0) {

    // 如果所有子节点都是SVG，则当前节点也标记为SVG
    if (node.children.every((child: any) => isSVGNode(child))) {
      delete node.children;
      node.exportInfo = {
        type: 'IMAGE',
        format: 'SVG',
        nodeId: node.id,
        fileName: generateFileName(node.name, 'SVG')
      };
      return true;
    }
  }

  return false;
}
