// ==================== 名称处理 ====================

/**
 * 清理名称中的非法字符（用于文件名）
 *
 * @param name 原始名称
 * @param separator 分隔符，默认为 '_'
 * @returns 清理后的名称
 */
export function sanitizeName(name: string, separator: string = '_'): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, separator)  // 替换文件系统非法字符
    .replace(/\s+/g, separator)             // 替换空白字符
    .replace(new RegExp(`${separator}+`, 'g'), separator)  // 合并连续分隔符
    .toLowerCase();
}

/**
 * 清理名称用于 ID 生成（仅保留字母数字和连字符）
 *
 * @param name 原始名称
 * @returns 清理后的名称
 */
export function sanitizeNameForId(name: string): string {
  return name
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();
}

/**
 * 根据节点名称生成文件名
 */
export function generateFileName(name: string, format: string): string {
  const sanitizedName = sanitizeName(name, '_');
  const lowerFormat = format.toLowerCase();

  // 如果名称已经包含扩展名，则保留原名
  if (sanitizedName.includes(`.${lowerFormat}`)) {
    return sanitizedName;
  }

  return `${sanitizedName}.${lowerFormat}`;
}

// ==================== 导出格式推断 ====================

/**
 * 用于格式推断的节点接口
 */
export interface FormatDetectionNode {
  type?: string;
  exportSettings?: { format?: string[] };
  cssStyles?: { backgroundImage?: string };
  exportInfo?: { format?: string };
  children?: FormatDetectionNode[];
}

/**
 * 根据节点特征选择合适的导出格式
 *
 * @param node 节点对象
 * @param isSVGNode SVG 检测函数
 * @returns 推荐的导出格式
 */
export function suggestExportFormat(
  node: FormatDetectionNode,
  isSVGNode: (node: FormatDetectionNode) => boolean,
): 'PNG' | 'JPG' | 'SVG' {
  if (isSVGNode(node)) {
    return 'SVG';
  }
  return 'PNG';
}
