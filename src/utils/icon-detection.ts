/**
 * Icon Detection Algorithm
 *
 * 基于业界研究的图标/可合并图层检测算法
 *
 * 核心策略：
 * 1. 优先使用 Figma exportSettings（设计师标记）
 * 2. 智能检测：基于尺寸、类型比例、结构深度
 * 3. 自下而上合并：子图标组先合并，再判断父节点
 */

// ==================== 类型定义 ====================

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  exportSettings?: Array<{
    format: string;
    suffix?: string;
    constraint?: {
      type: string;
      value: number;
    };
  }>;
  fills?: Array<{
    type: string;
    visible?: boolean;
    imageRef?: string;
    blendMode?: string;
  }>;
  effects?: Array<{
    type: string;
    visible?: boolean;
  }>;
  strokes?: Array<unknown>;
}

export interface IconDetectionResult {
  nodeId: string;
  nodeName: string;
  shouldMerge: boolean;
  exportFormat: "SVG" | "PNG";
  reason: string;
  size?: { width: number; height: number };
  childCount?: number;
}

export interface DetectionConfig {
  // 尺寸阈值
  maxIconSize: number; // 最大图标尺寸 (px)
  minIconSize: number; // 最小图标尺寸 (px)

  // 类型分析
  mergeableRatio: number; // 可合并类型占比阈值

  // 结构约束
  maxDepth: number; // 最大嵌套深度
  maxChildren: number; // 最大子元素数量

  // exportSettings 策略
  respectExportSettingsMaxSize: number; // 只尊重此尺寸以下的 exportSettings
}

// ==================== 常量定义 ====================

/** 默认检测配置 */
export const DEFAULT_CONFIG: DetectionConfig = {
  maxIconSize: 300,
  minIconSize: 8,
  mergeableRatio: 0.6, // 60% 可合并类型即可
  maxDepth: 5,
  maxChildren: 100,
  respectExportSettingsMaxSize: 400, // 只尊重 400px 以下的 exportSettings
};

/** 容器节点类型 */
const CONTAINER_TYPES = ["GROUP", "FRAME", "COMPONENT", "INSTANCE"] as const;

/** 可合并的图形类型（可以被 SVG 表示） */
const MERGEABLE_TYPES = [
  "VECTOR",
  "RECTANGLE",
  "ELLIPSE",
  "LINE",
  "POLYGON",
  "STAR",
  "BOOLEAN_OPERATION",
  "REGULAR_POLYGON",
] as const;

/** 单独不应导出的类型（通常是背景或UI元素） */
const SINGLE_ELEMENT_EXCLUDE_TYPES = ["RECTANGLE"] as const;

/** 排除类型（有这些则不应合并为图标） */
const EXCLUDE_TYPES = ["TEXT", "COMPONENT", "INSTANCE"] as const;

/** 需要导出为 PNG 的情况 */
const PNG_REQUIRED_EFFECTS = [
  "DROP_SHADOW",
  "INNER_SHADOW",
  "LAYER_BLUR",
  "BACKGROUND_BLUR",
] as const;

// ==================== 辅助函数 ====================

function isContainerType(type: string): boolean {
  return CONTAINER_TYPES.includes(type as (typeof CONTAINER_TYPES)[number]);
}

function isMergeableType(type: string): boolean {
  return MERGEABLE_TYPES.includes(type as (typeof MERGEABLE_TYPES)[number]);
}

function isExcludeType(type: string): boolean {
  return EXCLUDE_TYPES.includes(type as (typeof EXCLUDE_TYPES)[number]);
}

/**
 * 获取节点尺寸
 */
function getNodeSize(node: FigmaNode): { width: number; height: number } | null {
  if (!node.absoluteBoundingBox) return null;
  return {
    width: node.absoluteBoundingBox.width,
    height: node.absoluteBoundingBox.height,
  };
}

/**
 * 检查节点是否有图片填充
 */
function hasImageFill(node: FigmaNode): boolean {
  if (!node.fills) return false;
  return node.fills.some(
    (fill) => fill.type === "IMAGE" && fill.visible !== false && fill.imageRef,
  );
}

/**
 * 检查节点是否有复杂效果（需要 PNG）
 */
function hasComplexEffects(node: FigmaNode): boolean {
  if (!node.effects) return false;
  return node.effects.some(
    (effect) =>
      effect.visible !== false &&
      PNG_REQUIRED_EFFECTS.includes(effect.type as (typeof PNG_REQUIRED_EFFECTS)[number]),
  );
}

/**
 * 递归计算节点树深度
 */
function calculateDepth(node: FigmaNode, currentDepth: number = 0): number {
  if (!node.children || node.children.length === 0) {
    return currentDepth;
  }
  return Math.max(...node.children.map((child) => calculateDepth(child, currentDepth + 1)));
}

/**
 * 递归计算总子节点数量
 */
function countTotalChildren(node: FigmaNode): number {
  if (!node.children || node.children.length === 0) {
    return 0;
  }
  return node.children.reduce((sum, child) => sum + 1 + countTotalChildren(child), 0);
}

/**
 * 检查子树中是否包含排除类型
 */
function hasExcludeTypeInTree(node: FigmaNode): boolean {
  if (isExcludeType(node.type)) {
    return true;
  }
  if (node.children) {
    return node.children.some((child) => hasExcludeTypeInTree(child));
  }
  return false;
}

/**
 * 检查子树中是否有图片填充
 */
function hasImageFillInTree(node: FigmaNode): boolean {
  if (hasImageFill(node)) {
    return true;
  }
  if (node.children) {
    return node.children.some((child) => hasImageFillInTree(child));
  }
  return false;
}

/**
 * 检查子树中是否有复杂效果
 */
function hasComplexEffectsInTree(node: FigmaNode): boolean {
  if (hasComplexEffects(node)) {
    return true;
  }
  if (node.children) {
    return node.children.some((child) => hasComplexEffectsInTree(child));
  }
  return false;
}

/**
 * 计算可合并类型在直接子元素中的占比
 */
function calculateMergeableRatio(node: FigmaNode): number {
  if (!node.children || node.children.length === 0) {
    return isMergeableType(node.type) ? 1 : 0;
  }

  const total = node.children.length;
  const mergeable = node.children.filter(
    (child) => isMergeableType(child.type) || isContainerType(child.type),
  ).length;

  return mergeable / total;
}

/**
 * 递归检查所有叶子节点是否都是可合并类型
 */
function areAllLeavesMergeable(node: FigmaNode): boolean {
  // 如果是叶子节点
  if (!node.children || node.children.length === 0) {
    return isMergeableType(node.type);
  }

  // 如果是容器，递归检查所有子节点
  if (isContainerType(node.type)) {
    return node.children.every((child) => areAllLeavesMergeable(child));
  }

  // 其他类型
  return isMergeableType(node.type);
}

// ==================== 主检测函数 ====================

/**
 * 检测单个节点是否应该作为图标整体导出
 */
export function detectIcon(
  node: FigmaNode,
  config: DetectionConfig = DEFAULT_CONFIG,
): IconDetectionResult {
  const result: IconDetectionResult = {
    nodeId: node.id,
    nodeName: node.name,
    shouldMerge: false,
    exportFormat: "SVG",
    reason: "",
  };

  // 1. 检查 Figma exportSettings（但有限制条件）
  if (node.exportSettings && node.exportSettings.length > 0) {
    const size = getNodeSize(node);
    const isSmallEnough =
      !size ||
      (size.width <= config.respectExportSettingsMaxSize &&
        size.height <= config.respectExportSettingsMaxSize);

    // 包含 TEXT 的容器不应该整体导出为图片（即使有 exportSettings）
    const containsText = hasExcludeTypeInTree(node);

    if (isSmallEnough && !containsText) {
      const exportSetting = node.exportSettings[0];
      result.shouldMerge = true;
      result.exportFormat = exportSetting.format === "SVG" ? "SVG" : "PNG";
      result.reason = `Designer marked export as ${exportSetting.format}`;
      result.size = size || undefined;
      return result;
    }
    // 大尺寸节点或包含TEXT的节点的 exportSettings 被忽略，继续检测子节点
  }

  // 2. 必须是容器类型或可合并的单元素
  if (!isContainerType(node.type)) {
    // 单个可合并类型节点
    if (isMergeableType(node.type)) {
      // 单独的 RECTANGLE 通常是背景或按钮，不应自动导出
      if (
        SINGLE_ELEMENT_EXCLUDE_TYPES.includes(
          node.type as (typeof SINGLE_ELEMENT_EXCLUDE_TYPES)[number],
        )
      ) {
        result.reason = `Single ${node.type} is typically a background, not exported`;
        return result;
      }

      // 检查尺寸（单个元素也要检查）
      const size = getNodeSize(node);
      if (size) {
        result.size = size;
        if (size.width > config.maxIconSize || size.height > config.maxIconSize) {
          result.reason = `Single element too large (${Math.round(size.width)}x${Math.round(size.height)} > ${config.maxIconSize})`;
          return result;
        }
      }
      result.shouldMerge = true;
      result.exportFormat = hasComplexEffects(node) ? "PNG" : "SVG";
      result.reason = "Single vector/shape element";
      return result;
    }
    result.reason = "Not a container or mergeable type";
    return result;
  }

  // 3. 检查尺寸
  const size = getNodeSize(node);
  if (size) {
    result.size = size;

    // 尺寸过大，可能是布局容器
    if (size.width > config.maxIconSize || size.height > config.maxIconSize) {
      result.reason = `Size too large (${size.width}x${size.height} > ${config.maxIconSize})`;
      return result;
    }

    // 尺寸过小
    if (size.width < config.minIconSize && size.height < config.minIconSize) {
      result.reason = `Size too small (${size.width}x${size.height} < ${config.minIconSize})`;
      return result;
    }
  }

  // 4. 检查是否包含 TEXT 等排除类型
  if (hasExcludeTypeInTree(node)) {
    result.reason = "Contains TEXT or other exclude types";
    return result;
  }

  // 5. 检查结构深度
  const depth = calculateDepth(node);
  if (depth > config.maxDepth) {
    result.reason = `Depth too deep (${depth} > ${config.maxDepth})`;
    return result;
  }

  // 6. 检查子元素数量
  const childCount = countTotalChildren(node);
  result.childCount = childCount;
  if (childCount > config.maxChildren) {
    result.reason = `Too many children (${childCount} > ${config.maxChildren})`;
    return result;
  }

  // 7. 检查可合并类型占比
  const mergeableRatio = calculateMergeableRatio(node);
  if (mergeableRatio < config.mergeableRatio) {
    result.reason = `Mergeable ratio too low (${(mergeableRatio * 100).toFixed(1)}% < ${config.mergeableRatio * 100}%)`;
    return result;
  }

  // 8. 检查所有叶子节点是否可合并
  if (!areAllLeavesMergeable(node)) {
    result.reason = "Not all leaf nodes are mergeable types";
    return result;
  }

  // 9. 确定导出格式
  if (hasImageFillInTree(node)) {
    result.exportFormat = "PNG";
    result.reason = "Contains image fills, export as PNG";
  } else if (hasComplexEffectsInTree(node)) {
    result.exportFormat = "PNG";
    result.reason = "Contains complex effects, export as PNG";
  } else {
    result.exportFormat = "SVG";
    result.reason = "All vector elements, export as SVG";
  }

  result.shouldMerge = true;
  return result;
}

/**
 * 递归处理节点树，自下而上检测并标记图标
 *
 * @param node 根节点
 * @param config 检测配置
 * @returns 处理后的节点（带有 _iconDetection 标记）
 */
export function processNodeTree(
  node: FigmaNode,
  config: DetectionConfig = DEFAULT_CONFIG,
): FigmaNode & { _iconDetection?: IconDetectionResult } {
  const processedNode = { ...node } as FigmaNode & { _iconDetection?: IconDetectionResult };

  // 先递归处理子节点
  if (node.children && node.children.length > 0) {
    processedNode.children = node.children.map((child) => processNodeTree(child, config));

    // 检查是否所有子节点都已被标记为图标（可以合并到父节点）
    const allChildrenAreIcons = processedNode.children.every((child) => {
      const childWithDetection = child as FigmaNode & { _iconDetection?: IconDetectionResult };
      return childWithDetection._iconDetection?.shouldMerge;
    });

    // 如果所有子节点都是图标，尝试合并到当前节点
    if (allChildrenAreIcons) {
      const detection = detectIcon(processedNode, config);
      if (detection.shouldMerge) {
        processedNode._iconDetection = detection;
        // 清理子节点的标记，因为会被父节点合并
        processedNode.children.forEach((child) => {
          delete (child as FigmaNode & { _iconDetection?: IconDetectionResult })._iconDetection;
        });
        return processedNode;
      }
    }
  }

  // 检测当前节点
  const detection = detectIcon(processedNode, config);
  if (detection.shouldMerge) {
    processedNode._iconDetection = detection;
  }

  return processedNode;
}

/**
 * 从节点树中收集所有需要导出的图标
 */
export function collectExportableIcons(
  node: FigmaNode & { _iconDetection?: IconDetectionResult },
): IconDetectionResult[] {
  const results: IconDetectionResult[] = [];

  // 如果当前节点是图标，添加到结果
  if (node._iconDetection?.shouldMerge) {
    results.push(node._iconDetection);
    // 不再递归处理子节点，因为它们会被合并
    return results;
  }

  // 递归处理子节点
  if (node.children) {
    for (const child of node.children) {
      results.push(
        ...collectExportableIcons(child as FigmaNode & { _iconDetection?: IconDetectionResult }),
      );
    }
  }

  return results;
}

/**
 * 分析节点树并返回图标检测报告
 */
export function analyzeNodeTree(
  node: FigmaNode,
  config: DetectionConfig = DEFAULT_CONFIG,
): {
  processedTree: FigmaNode & { _iconDetection?: IconDetectionResult };
  exportableIcons: IconDetectionResult[];
  summary: {
    totalIcons: number;
    svgCount: number;
    pngCount: number;
  };
} {
  const processedTree = processNodeTree(node, config);
  const exportableIcons = collectExportableIcons(processedTree);

  const summary = {
    totalIcons: exportableIcons.length,
    svgCount: exportableIcons.filter((i) => i.exportFormat === "SVG").length,
    pngCount: exportableIcons.filter((i) => i.exportFormat === "PNG").length,
  };

  return { processedTree, exportableIcons, summary };
}
