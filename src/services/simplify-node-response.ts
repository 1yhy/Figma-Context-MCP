import type {
  GetFileNodesResponse,
  Node as FigmaDocumentNode,
  GetFileResponse,
  Paint,
} from "@figma/rest-api-spec";
import {
  isVisible,
  parsePaint,
  convertColor,
  formatRGBAColor,
  generateCSSShorthand,
  isVisibleInParent
} from "~/utils/common.js";
import {
  isRectangleCornerRadii,
  hasValue
} from "~/utils/identity.js";
import { buildSimplifiedEffects } from "~/transformers/effects.js";
import { buildSimplifiedStrokes } from "~/transformers/style.js";
import { generateFileName, suggestExportFormat as suggestFormat } from "~/utils/file.js";
import { isSVGNode, processSVGNodesBottomUp } from "~/utils/svg.js";
import {
  hasImageFill,
  detectAndMarkImageGroup as markImageGroup,
  sortNodesByPosition,
  cleanupTemporaryProperties
} from "~/transformers/node.js";
import { LayoutOptimizer } from "~/transformers/layout-optimizer.js";

// -------------------- SIMPLIFIED STRUCTURES --------------------

export type CSSHexColor = `#${string}`;
export type CSSRGBAColor = `rgba(${number}, ${number}, ${number}, ${number})`;

// 添加图片资源类型
export type ImageResource = {
  // 图片引用ID，下载图片的必要属性
  imageRef: string;
};

// 导出信息，包含需要的图片导出属性
export type ExportInfo = {
  // 导出类型 (单图片/图片组)
  type: 'IMAGE' | 'IMAGE_GROUP';
  // 推荐的导出格式
  format: 'PNG' | 'JPG' | 'SVG';
  // 图片节点ID，用于API调用
  nodeId?: string;
  // 建议的文件名
  fileName?: string;
};

export type TextStyle = Partial<{
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  textAlignHorizontal: string;
  textAlignVertical: string;
  lineHeightPx: number;
}>;

// CSS样式对象，包含所有可能的CSS属性
export type CSSStyle = {
  // 文本样式
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string | number;
  textAlign?: string;
  verticalAlign?: string;
  lineHeight?: string;

  // 颜色和背景
  color?: string;
  backgroundColor?: string;
  background?: string;

  // 布局
  width?: string;
  height?: string;
  margin?: string;
  padding?: string;
  position?: string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string;

  // 边框和圆角
  border?: string;
  borderRadius?: string;
  borderWidth?: string;
  borderStyle?: string;
  borderColor?: string;

  // 特效
  boxShadow?: string;
  filter?: string;
  backdropFilter?: string;
  opacity?: string;

  // 添加任何其他需要的CSS属性
  [key: string]: string | number | undefined;
};

export interface SimplifiedDesign {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: SimplifiedNode[];
}

export interface SimplifiedNode {
  id: string;
  name: string;
  type: string; // e.g. FRAME, TEXT, INSTANCE, RECTANGLE, etc.
  // text
  text?: string;
  // 旧的样式对象，保留向后兼容性
  style?: TextStyle;
  // 新的CSS样式对象
  cssStyles?: CSSStyle;
  // appearance
  fills?: SimplifiedFill[];
  // 导出信息
  exportInfo?: ExportInfo;
  // children
  children?: SimplifiedNode[];
  // 内部使用的绝对坐标，用于计算子节点相对位置
  _absoluteX?: number;
  _absoluteY?: number;
}

export type SimplifiedFill = {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE';
  // 颜色可以是十六进制表示
  color?: string;
  // 或者是对象表示
  rgba?: {
    r: number;
    g: number;
    b: number;
    a: number;
  };
  opacity?: number;
  // 渐变属性
  gradientHandlePositions?: Array<{x: number, y: number}>;
  gradientStops?: Array<{
    position: number;
    color: string;
  }>;
  imageRef?: string;
};

// 在文件顶部添加导出类型
export type FigmaNodeType = 'FRAME' | 'GROUP' | 'TEXT' | 'VECTOR' | 'RECTANGLE' | 'ELLIPSE' | 'INSTANCE' | 'COMPONENT' | 'DOCUMENT' | 'CANVAS' | string;

// ---------------------- PARSING ----------------------
export function parseFigmaResponse(data: GetFileResponse | GetFileNodesResponse): SimplifiedDesign {
  // 提取基本信息
  const { name, lastModified, thumbnailUrl } = data;

  // 处理节点
  let nodes: FigmaDocumentNode[] = [];
  if ('document' in data) {
    // 如果是整个文件的响应
    nodes = data.document.children;
  } else if ('nodes' in data) {
    // 如果是特定节点的响应
    const nodeData = Object.values(data.nodes).filter(
      (node): node is { document: FigmaDocumentNode } =>
        node !== null && typeof node === 'object' && 'document' in node
    );

    nodes = nodeData.map(n => n.document);
  }

  // 提取节点并生成简化数据
  const simplifiedNodes = extractNodes(nodes);

  // 清理临时属性
  simplifiedNodes.forEach(cleanupTemporaryProperties);

  // 应用布局优化
  const optimizedDesign = LayoutOptimizer.optimizeDesign({
    name,
    lastModified,
    thumbnailUrl: thumbnailUrl || '',
    nodes: simplifiedNodes
  });

  return optimizedDesign;
}

// 提取节点信息
function extractNodes(children: FigmaDocumentNode[], parentNode?: SimplifiedNode): SimplifiedNode[] {
  if (!Array.isArray(children)) return [];

  // 创建一个对应的原始父节点对象，用于可见性判断
  const parentForVisibility = parentNode ? {
    clipsContent: (parentNode as any).clipsContent,
    absoluteBoundingBox: parentNode._absoluteX !== undefined && parentNode._absoluteY !== undefined ? {
      x: parentNode._absoluteX,
      y: parentNode._absoluteY,
      width: parseFloat(parentNode.cssStyles?.width || '0'),
      height: parseFloat(parentNode.cssStyles?.height || '0')
    } : undefined
  } : undefined;

  const visibilityFilter = (node: FigmaDocumentNode) => {
    // 使用类型保护确保只检查有必要属性的节点
    const nodeForVisibility = {
      visible: (node as any).visible,
      opacity: (node as any).opacity,
      absoluteBoundingBox: (node as any).absoluteBoundingBox,
      absoluteRenderBounds: (node as any).absoluteRenderBounds
    };

    // 如果没有父节点信息，只检查节点自身可见性
    if (!parentForVisibility) {
      return isVisible(nodeForVisibility);
    }

    // 如果有父节点，同时考虑父节点的裁剪效果
    return isVisibleInParent(nodeForVisibility, parentForVisibility);
  };

  const nodes = children
    .filter(visibilityFilter)
    .map(node => extractNode(node, parentNode))
    .filter((node): node is SimplifiedNode => node !== null);

  // 对同级元素按照top值排序（从上到下）
  return sortNodesByPosition(nodes);
}

/**
 * 提取单个节点信息
 * 优化对SVG类型的处理
 */
function extractNode(node: FigmaDocumentNode, parentNode?: SimplifiedNode): SimplifiedNode | null {
  if (!node) return null;

  const { id, name, type } = node;

  // 创建基本节点对象
  const result: SimplifiedNode = {
    id,
    name,
    type
  };

  // 设置CSS样式
  result.cssStyles = {};


  // 添加尺寸和位置的CSS转换逻辑
  if (hasValue('absoluteBoundingBox', node) && node.absoluteBoundingBox) {

    // 添加到CSS样式
    result.cssStyles.width = `${node.absoluteBoundingBox.width}px`;
    result.cssStyles.height = `${node.absoluteBoundingBox.height}px`;

    // 对非根节点添加定位信息
    if ((node.type as string) !== 'DOCUMENT' && (node.type as string) !== 'CANVAS') {
      result.cssStyles.position = 'absolute';

      // 存储原始坐标，供子节点计算相对位置使用
      result._absoluteX = node.absoluteBoundingBox.x;
      result._absoluteY = node.absoluteBoundingBox.y;

      // 如果有父节点，计算相对位置
      if (parentNode &&
          parentNode._absoluteX !== undefined &&
          parentNode._absoluteY !== undefined) {
        result.cssStyles.left = `${node.absoluteBoundingBox.x - parentNode._absoluteX}px`;
        result.cssStyles.top = `${node.absoluteBoundingBox.y - parentNode._absoluteY}px`;
      } else {
        // 否则使用绝对位置（顶层元素）
        result.cssStyles.left = `${node.absoluteBoundingBox.x}px`;
        result.cssStyles.top = `${node.absoluteBoundingBox.y}px`;
      }
    }
  }

  // 处理文本 - 保留原始文本内容
  if (hasValue('characters', node) && typeof node.characters === 'string') {
    result.text = node.characters;

    // 对于文本节点，添加文本颜色样式
    if (hasValue('fills', node) && Array.isArray(node.fills) && node.fills.length > 0) {
      const fill = node.fills[0];
      if (fill.type === 'SOLID' && fill.color) {
        // 使用convertColor获取hex格式的颜色
        const { hex, opacity } = convertColor(fill.color, fill.opacity ?? 1);
        // 如果透明度为1，使用hex格式，否则使用rgba格式
        result.cssStyles.color = opacity === 1 ? hex : formatRGBAColor(fill.color, opacity);
      }
    }
  }

  // 提取图片信息
  processImageResources(node, result);

  // 提取通用的属性处理逻辑
  processNodeStyle(node, result);
  processFills(node, result);
  processStrokes(node, result);
  processEffects(node, result);
  processCornerRadius(node, result);

  // 递归处理子节点
  if (hasValue('children', node) && Array.isArray(node.children) && node.children.length > 0) {
    result.children = extractNodes(node.children, result);

    // 处理图片组
    detectAndMarkImageGroup(result);

    processSVGNodesBottomUp(result, generateFileName);
  }

  return result;
}

/**
 * 检测并标记图片组
 */
function detectAndMarkImageGroup(node: SimplifiedNode): void {
  markImageGroup(node,
    (n) => suggestExportFormat(n),
    generateFileName
  );
}

/**
 * 提取节点中的图片资源
 */
function processImageResources(node: FigmaDocumentNode, result: SimplifiedNode): void {
  // 检查fills和background中的图片资源
  const imageResources: ImageResource[] = [];

  // 从fills中提取图片资源
  if (hasValue('fills', node) && Array.isArray(node.fills)) {
    const fillImages = node.fills.filter(fill =>
      fill.type === 'IMAGE' && fill.imageRef
    ).map(fill => ({
      imageRef: fill.imageRef,
    }));

    imageResources.push(...fillImages);
  }

  // 从background中提取图片资源
  if (hasValue('background', node) && Array.isArray(node.background)) {
    const bgImages = node.background.filter(bg =>
      bg.type === 'IMAGE' && bg.imageRef
    ).map(bg => ({
      imageRef: bg.imageRef,
    }));

    imageResources.push(...bgImages);
  }

  // 如果找到图片资源，保存并添加导出信息
  if (imageResources.length > 0) {
    // 设置CSS背景图片属性 - 使用第一个图片
    if (!result.cssStyles) {
      result.cssStyles = {};
    }

    const primaryImage = imageResources[0];
    result.cssStyles.backgroundImage = `url({{FIGMA_IMAGE:${primaryImage.imageRef}}})`;

    // 添加导出信息
    const format = suggestExportFormat(result);
    result.exportInfo = {
      type: 'IMAGE',
      format,
      nodeId: result.id,
      fileName: generateFileName(result.name, format)
    };
  }
}

/**
 * 处理节点的样式属性
 */
function processNodeStyle(node: FigmaDocumentNode, result: SimplifiedNode): void {
  if (!hasValue('style', node)) return;

  const style = node.style as any;

  // 转换文本样式
  const textStyle: TextStyle = {
    fontFamily: style?.fontFamily,
    fontSize: style?.fontSize,
    fontWeight: style?.fontWeight,
    textAlignHorizontal: style?.textAlignHorizontal,
    textAlignVertical: style?.textAlignVertical
  };

  // 处理行高
  if (style?.lineHeightPx) {
    const cssStyle = textStyleToCss(textStyle);
    cssStyle.lineHeight = `${style.lineHeightPx}px`;
    Object.assign(result.cssStyles!, cssStyle);
  } else {
    Object.assign(result.cssStyles!, textStyleToCss(textStyle));
  }
}

function processGradient(gradient: Paint): string {
  if (!gradient.gradientHandlePositions || !gradient.gradientStops) return '';

  const stops = gradient.gradientStops.map(stop => {
    const color = convertColor(stop.color, stop.color.a);
    return `${color.hex} ${stop.position * 100}%`;
  }).join(', ');

  // 获取起点和终点
  const [start, end] = gradient.gradientHandlePositions;

  // 计算角度
  // 在Figma中，渐变方向是从起点到终点
  // 而在CSS中，0度是从下到上，顺时针旋转
  let angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);

  // 将Figma的角度转换为CSS角度
  // 1. 首先将角度转为以上方为0度的系统
  angle = angle - 90;
  // 2. 因为CSS中0度是从下到上，所以我们需要翻转角度
  angle = 180 - angle;
  // 3. 确保角度在0-360度之间
  angle = ((angle % 360) + 360) % 360;

  return `linear-gradient(${angle}deg, ${stops})`;
}

/**
 * 处理节点的填充属性
 */
function processFills(node: FigmaDocumentNode, result: SimplifiedNode): void {
  if (!hasValue('fills', node) || !Array.isArray(node.fills) || node.fills.length === 0) return;

  // 跳过图片填充
  if (hasImageFill(node)) {
    return;
  }

  const fills = node.fills.filter(isVisible);
  if (fills.length === 0) return;

  const fill = fills[0];

  if (fill.type === 'SOLID' && fill.color) {
    const { hex, opacity } = convertColor(fill.color, fill.opacity ?? 1);
    const color = opacity === 1 ? hex : formatRGBAColor(fill.color, opacity);

    if (node.type === 'TEXT') {
      result.cssStyles!.color = color;
    } else {
      result.cssStyles!.backgroundColor = color;
    }
  }
  else if (fill.type === 'GRADIENT_LINEAR') {
    const gradient = processGradient(fill);

    if (node.type === 'TEXT') {
      result.cssStyles!.background = gradient;
      result.cssStyles!.webkitBackgroundClip = 'text';
      result.cssStyles!.backgroundClip = 'text';
      result.cssStyles!.webkitTextFillColor = 'transparent';
    } else {
      result.cssStyles!.background = gradient;
    }
  }
}

/**
 * 处理节点的边框属性
 */
function processStrokes(node: FigmaDocumentNode, result: SimplifiedNode): void {
  if ((node as any).type === 'TEXT') return;

  const strokes = buildSimplifiedStrokes(node);
  if (strokes.colors.length === 0) return;

  const stroke = strokes.colors[0];

  if (typeof stroke === 'string') {
    result.cssStyles!.borderColor = stroke;
    if (strokes.strokeWeight) {
      result.cssStyles!.borderWidth = strokes.strokeWeight;
    }
    result.cssStyles!.borderStyle = 'solid';
  }
  else if (typeof stroke === 'object' && 'type' in stroke) {
    if (stroke.type === 'SOLID' && stroke.color) {
      const { hex, opacity } = convertColor(stroke.color);
      result.cssStyles!.borderColor = opacity === 1 ? hex : formatRGBAColor(stroke.color);
      if (strokes.strokeWeight) {
        result.cssStyles!.borderWidth = strokes.strokeWeight;
      }
      result.cssStyles!.borderStyle = 'solid';
    }
    else if (stroke.type === 'GRADIENT_LINEAR') {
      const gradient = processGradient(stroke);
      result.cssStyles!.borderImage = gradient;
      result.cssStyles!.borderImageSlice = '1';
      if (strokes.strokeWeight) {
        result.cssStyles!.borderWidth = strokes.strokeWeight;
      }
    }
  }
}

/**
 * 处理节点的特效属性
 */
function processEffects(node: FigmaDocumentNode, result: SimplifiedNode): void {
  const effects = buildSimplifiedEffects(node);
  if (effects.boxShadow) result.cssStyles!.boxShadow = effects.boxShadow;
  if (effects.filter) result.cssStyles!.filter = effects.filter;
  if (effects.backdropFilter) result.cssStyles!.backdropFilter = effects.backdropFilter;
}

/**
 * 处理节点的圆角属性
 */
function processCornerRadius(node: FigmaDocumentNode, result: SimplifiedNode): void {
  if (!hasValue('cornerRadius', node)) return;

  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    // 处理均匀圆角
    result.cssStyles!.borderRadius = `${node.cornerRadius}px`;
  } else if (node.cornerRadius === 'mixed' && hasValue('rectangleCornerRadii', node, isRectangleCornerRadii)) {
    // 处理不均匀圆角 (左上、右上、右下、左下)
    result.cssStyles!.borderRadius = generateCSSShorthand({
      top: node.rectangleCornerRadii[0],
      right: node.rectangleCornerRadii[1],
      bottom: node.rectangleCornerRadii[2],
      left: node.rectangleCornerRadii[3]
    }) || '0';
  }
}

/**
 * 将文本样式转换为CSS样式
 * @param textStyle Figma文本样式
 * @returns CSS样式对象
 */
function textStyleToCss(textStyle: TextStyle): CSSStyle {
  const cssStyle: CSSStyle = {};

  if (textStyle.fontFamily) cssStyle.fontFamily = textStyle.fontFamily;
  if (textStyle.fontSize) cssStyle.fontSize = `${textStyle.fontSize}px`;
  if (textStyle.fontWeight) cssStyle.fontWeight = textStyle.fontWeight;

  // 处理文本对齐
  if (textStyle.textAlignHorizontal) {
    switch(textStyle.textAlignHorizontal) {
      case 'LEFT':
        cssStyle.textAlign = 'left';
        break;
      case 'CENTER':
        cssStyle.textAlign = 'center';
        break;
      case 'RIGHT':
        cssStyle.textAlign = 'right';
        break;
      case 'JUSTIFIED':
        cssStyle.textAlign = 'justify';
        break;
    }
  }

  // 处理垂直对齐
  if (textStyle.textAlignVertical) {
    switch(textStyle.textAlignVertical) {
      case 'TOP':
        cssStyle.verticalAlign = 'top';
        break;
      case 'CENTER':
        cssStyle.verticalAlign = 'middle';
        break;
      case 'BOTTOM':
        cssStyle.verticalAlign = 'bottom';
        break;
    }
  }

  return cssStyle;
}

/**
 * 根据节点特征选择导出格式
 */
function suggestExportFormat(node: FigmaDocumentNode | SimplifiedNode): 'PNG' | 'JPG' | 'SVG' {
  return suggestFormat(node, isSVGNode);
}
