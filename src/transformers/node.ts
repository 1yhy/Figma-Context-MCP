/**
 * 检查节点是否有图片填充
 */
export function hasImageFill(node: any): boolean {
  return node.fills?.some((fill: any) => fill.type === 'IMAGE' && fill.imageRef) || false;
}

/**
 * 检测并标记图片组
 */
export function detectAndMarkImageGroup(
  node: any,
  suggestExportFormat: (node: any) => string,
  generateFileName: (name: string, format: string) => string
): void {
  // 只处理组和框架
  if (node.type !== 'GROUP' && node.type !== 'FRAME') return;

  // 没有子元素则不是图片组
  if (!node.children || node.children.length === 0) return;

  // 检查是否所有子元素都是图片类型
  const allChildrenAreImages = node.children.every((child: any) =>
    (child.type === 'IMAGE') ||
    (child.type === 'RECTANGLE' && hasImageFill(child)) ||
    (child.type === 'ELLIPSE' && hasImageFill(child)) ||
    (child.type === 'VECTOR' && hasImageFill(child)) ||
    (child.type === 'FRAME' && child.cssStyles?.backgroundImage)
  );

  // 标记图片组
  if (allChildrenAreImages) {
    const format = suggestExportFormat(node);
    node.exportInfo = {
      type: 'IMAGE_GROUP',
      format,
      nodeId: node.id,
      fileName: generateFileName(node.name, format),
    };

    // 删除子元素信息，整体导出
    delete node.children;
  }
}

/**
 * 对节点按照位置排序
 */
export function sortNodesByPosition(nodes: any[]): any[] {
  return [...nodes].sort((a, b) => {
    // 按top值排序（从上到下）
    const aTop = a.cssStyles?.top ? parseFloat(a.cssStyles.top) : 0;
    const bTop = b.cssStyles?.top ? parseFloat(b.cssStyles.top) : 0;

    if (aTop !== bTop) {
      return aTop - bTop;
    }

    // top值相同时按left值排序（从左到右）
    const aLeft = a.cssStyles?.left ? parseFloat(a.cssStyles.left) : 0;
    const bLeft = b.cssStyles?.left ? parseFloat(b.cssStyles.left) : 0;
    return aLeft - bLeft;
  });
}

/**
 * 清理临时计算属性
 */
export function cleanupTemporaryProperties(node: any): void {
  // 删除绝对坐标
  delete node._absoluteX;
  delete node._absoluteY;

  // 递归清理子节点
  if (node.children && node.children.length > 0) {
    node.children.forEach(cleanupTemporaryProperties);
  }
}
