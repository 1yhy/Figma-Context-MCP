/**
 * 根据节点名称生成文件名
 */
export function generateFileName(name: string, format: string): string {
  // 移除不合法的文件名字符
  const sanitizedName = name.replace(/[/\\?%*:|"<>]/g, '_')
                            .replace(/\s+/g, '_')
                            .toLowerCase();

  // 如果名称已经包含扩展名，则保留原名
  if (sanitizedName.includes(`.${format.toLowerCase()}`)) {
    return sanitizedName;
  }

  return `${sanitizedName}.${format.toLowerCase()}`;
}

/**
 * 根据节点特征选择合适的导出格式
 */
export function suggestExportFormat(
  node: any,
  isSVGNode: (node: any) => boolean,
): 'PNG' | 'JPG' | 'SVG' {
  // SVG格式
  if (isSVGNode(node)) {
    return 'SVG';
  }
  return 'PNG';
}
