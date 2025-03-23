/**
 * 判断节点是否为SVG元素
 */
export function isSVGNode(node: any) {
  // 节点类型为VECTOR
  if (node.type === 'VECTOR' && !node.cssStyles?.backgroundImage) {
    return true;
  }

  // 节点已明确标记为SVG导出格式
  if (node.exportInfo && node.exportInfo.format === 'SVG') {
    return true;
  }

  // 节点为图标组：FRAME或GROUP包含VECTOR子元素且不包含TEXT子元素
  if ((node.type === 'FRAME' || node.type === 'GROUP') &&
      node.children && Array.isArray(node.children)) {

    const hasVector = node.children.some((child: any) => child.type === 'VECTOR');
    const hasText = node.children.some((child: any) => child.type === 'TEXT');

    if (hasVector && !hasText) {
      return true;
    }

    // 检查一级嵌套中的VECTOR
    const hasNestedVector = node.children.some((child: any) =>
      (child.type === 'FRAME' || child.type === 'GROUP') &&
      child.children &&
      Array.isArray(child.children) &&
      child.children.some((grandchild: any) => grandchild.type === 'VECTOR')
    );

    if (hasNestedVector && !hasText) {
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
  if (!node.children || node.children.length === 0) {
    return isSVGNode(node);
  }

  // 处理框架和组的子节点
  if ((node.type === 'FRAME' || node.type === 'GROUP') &&
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
