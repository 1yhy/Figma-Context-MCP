# 设计稿转代码 - Flex 布局检测算法研究文档

## 目录

1. [研究背景](#1-研究背景)
2. [行业方案分析](#2-行业方案分析)
3. [核心算法原理](#3-核心算法原理)
4. [算法实现详解](#4-算法实现详解)
5. [测试验证](#5-测试验证)
6. [最佳实践与建议](#6-最佳实践与建议)
7. [参考资源](#7-参考资源)

---

## 1. 研究背景

### 1.1 问题描述

设计稿（如 Figma）中的元素通常使用**绝对定位**（x, y, width, height），而前端代码需要使用**相对布局**（Flexbox, Grid）才能实现响应式设计。

**核心挑战**：如何从扁平的绝对定位元素列表中，准确推断出 Flex 布局结构？

### 1.2 难点分析

| 难点 | 描述 |
|------|------|
| 行列识别 | 如何判断元素是水平排列还是垂直排列？ |
| 嵌套结构 | 如何将扁平列表转换为嵌套的 DOM 树？ |
| 间距计算 | 如何判断 gap 是否一致，是否应该使用 gap 属性？ |
| 对齐检测 | 如何检测 justify-content 和 align-items？ |
| 重叠处理 | 如何处理需要 absolute 定位的重叠元素？ |
| 容差处理 | 设计稿中的微小偏移如何容错？ |

---

## 2. 行业方案分析

### 2.1 主流工具对比

| 工具 | 开发者 | 布局检测方式 | 开源 |
|------|--------|------------|------|
| **FigmaToCode** | bernaferrari | 依赖 Figma Auto Layout 数据 | ✓ |
| **Grida** | gridaco | 规则 + ML 混合 | ✓ |
| **imgcook** | 阿里巴巴 | 规则系统 + 机器学习 | ✗ |
| **Anima** | Anima | 约束推断 | ✗ |

### 2.2 FigmaToCode 分析

**GitHub**: https://github.com/bernaferrari/FigmaToCode

**特点**：
- 不做布局推断，直接映射 Figma 的 Auto Layout 属性
- 使用 AltNodes 作为中间表示层
- 对于非 Auto Layout 的设计，使用 absolute 定位

**局限**：
- 依赖设计师正确使用 Auto Layout
- 对于旧设计稿或手动布局的设计无能为力

### 2.3 imgcook 布局算法（阿里巴巴）

**文档**: https://www.alibabacloud.com/blog/imgcook-3-0-series-layout-algorithm-design-based-code-generation_597856

**核心流程**：
```
平面化 JSON → 行列分组 → 布局推断 → 语义化 → 代码生成
```

**关键技术**：
1. **页面分割**：将页面拆分为不同子模块
2. **分组算法**：确定元素的包含关系
3. **循环识别**：识别列表/重复元素
4. **多状态识别**：识别同一组件的不同状态

**技术选型**：
- 规则系统用于布局算法（需要接近 100% 可用性）
- 机器学习用于组件识别（可容忍一定误差）

### 2.4 学术研究

**论文**: "A layout inference algorithm for Graphical User Interfaces"

**核心思想**：
1. 将坐标定位转换为基于有向图和 Allen 关系的相对定位
2. 使用模式匹配和图重写的探索算法
3. 生成多个布局方案，选择最优解

---

## 3. 核心算法原理

### 3.1 Y轴重叠检测法（行分组）

**原理**：如果两个元素在 Y 轴上有重叠，它们属于同一行。

```
元素 A: y=10, height=30  →  Y范围 [10, 40]
元素 B: y=20, height=30  →  Y范围 [20, 50]

[10, 40] 和 [20, 50] 有交集 → 同一行
```

**算法**：
```typescript
function isOverlappingY(a: Rect, b: Rect, tolerance = 0): boolean {
  return !(a.bottom + tolerance < b.y || b.bottom + tolerance < a.y);
}
```

### 3.2 X轴重叠检测法（列分组）

**原理**：如果两个元素在 X 轴上有重叠，它们属于同一列。

```typescript
function isOverlappingX(a: Rect, b: Rect, tolerance = 0): boolean {
  return !(a.right + tolerance < b.x || b.right + tolerance < a.x);
}
```

### 3.3 布局方向判断

**算法流程**：
1. 将元素按 Y 轴重叠分组为"行"
2. 将元素按 X 轴重叠分组为"列"
3. 比较行分组和列分组的质量分数
4. 选择分数更高的布局方向

**质量分数计算**：
- 分组数量合理性（理想：单一分组）
- 间距一致性
- 交叉轴对齐程度
- 元素覆盖率

### 3.4 间距一致性分析

**原理**：使用标准差判断间距是否一致。

```typescript
function analyzeGaps(gaps: number[], tolerancePercent = 20) {
  const avg = sum(gaps) / gaps.length;
  const stdDev = sqrt(variance(gaps));

  // 标准差 <= 平均值 * 20% 认为一致
  const isConsistent = stdDev <= avg * (tolerancePercent / 100);

  return { isConsistent, average: avg };
}
```

**间距圆整**：
```typescript
const COMMON_GAPS = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64];

function roundToCommonGap(gap: number): number {
  // 找最接近的常用值，如果差距 > 4px 则使用四舍五入
}
```

### 3.5 对齐方式检测

**水平对齐**：
- 左对齐：所有元素的 `left` 值相近
- 右对齐：所有元素的 `right` 值相近
- 居中对齐：所有元素的 `centerX` 值相近

**垂直对齐**：
- 顶对齐：所有元素的 `top` 值相近
- 底对齐：所有元素的 `bottom` 值相近
- 居中对齐：所有元素的 `centerY` 值相近

**CSS 映射**：
```typescript
// Row 布局
justifyContent = horizontal alignment  // flex-start, center, flex-end
alignItems = vertical alignment        // flex-start, center, flex-end

// Column 布局
justifyContent = vertical alignment
alignItems = horizontal alignment
```

### 3.6 重叠元素检测

**原理**：使用 IoU（Intersection over Union）检测重叠程度。

```typescript
function isFullyOverlapping(a: Rect, b: Rect, threshold = 0.5): boolean {
  const overlapArea = calculateOverlapArea(a, b);
  const minArea = Math.min(area(a), area(b));

  return overlapArea / minArea > threshold;
}
```

**处理策略**：
- 重叠元素需要使用 `position: absolute`
- 非重叠元素可以使用 Flex 布局

---

## 4. 算法实现详解

### 4.1 数据结构

```typescript
// 元素边界框
interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 扩展的元素矩形（包含计算属性）
interface ElementRect extends BoundingBox {
  index: number;
  right: number;   // x + width
  bottom: number;  // y + height
  centerX: number; // x + width/2
  centerY: number; // y + height/2
}

// 布局分析结果
interface LayoutAnalysisResult {
  direction: 'row' | 'column' | 'none';
  confidence: number;
  gap: number;
  isGapConsistent: boolean;
  justifyContent: string;
  alignItems: string;
  rows: ElementRect[][];
  columns: ElementRect[][];
  overlappingElements: ElementRect[];
}

// 布局树节点
interface LayoutNode {
  type: 'container' | 'element';
  direction?: 'row' | 'column';
  gap?: number;
  justifyContent?: string;
  alignItems?: string;
  children?: LayoutNode[];
  elementIndex?: number;
  needsAbsolute?: boolean;
}
```

### 4.2 行分组算法

```typescript
function groupIntoRows(rects: ElementRect[], tolerance = 2): ElementRect[][] {
  if (rects.length <= 1) return [rects];

  // 1. 按 Y 坐标排序
  const sorted = [...rects].sort((a, b) => a.y - b.y);

  const rows: ElementRect[][] = [];
  let currentRow: ElementRect[] = [sorted[0]];

  // 2. 遍历检查重叠
  for (let i = 1; i < sorted.length; i++) {
    const elem = sorted[i];

    // 检查是否与当前行的任意元素在 Y 轴上重叠
    const overlapsWithRow = currentRow.some(
      rowElem => isOverlappingY(rowElem, elem, tolerance)
    );

    if (overlapsWithRow) {
      currentRow.push(elem);
    } else {
      // 当前行完成，按 X 排序后保存
      rows.push(currentRow.sort((a, b) => a.x - b.x));
      currentRow = [elem];
    }
  }

  // 3. 保存最后一行
  if (currentRow.length > 0) {
    rows.push(currentRow.sort((a, b) => a.x - b.x));
  }

  return rows;
}
```

### 4.3 布局方向检测

```typescript
function detectLayoutDirection(rects: ElementRect[]) {
  const rows = groupIntoRows(rects);
  const columns = groupIntoColumns(rects);

  // 计算行布局分数
  const rowScore = calculateLayoutScore(rows, 'row', rects.length);

  // 计算列布局分数
  const columnScore = calculateLayoutScore(columns, 'column', rects.length);

  // 选择分数更高的布局
  if (rowScore.score > columnScore.score && rowScore.score > 0.3) {
    return { direction: 'row', confidence: rowScore.score };
  } else if (columnScore.score > rowScore.score && columnScore.score > 0.3) {
    return { direction: 'column', confidence: columnScore.score };
  }

  return { direction: 'none', confidence: 0 };
}
```

### 4.4 布局分数计算

```typescript
function calculateLayoutScore(groups, direction, totalElements) {
  let score = 0;

  // 1. 分组数量合理性
  if (groups.length === 1 && groups[0].length === totalElements) {
    score += 0.4;  // 完美分组
  } else if (groups.length <= 3) {
    score += 0.2;  // 分组合理
  }

  // 2. 间距一致性
  for (const group of groups) {
    if (group.length >= 2) {
      const gaps = calculateGaps(group, direction);
      const gapAnalysis = analyzeGaps(gaps);
      if (gapAnalysis.isConsistent) {
        score += 0.3 / groups.length;
      }
    }
  }

  // 3. 交叉轴对齐
  for (const group of groups) {
    if (group.length >= 2) {
      const alignment = analyzeAlignment(group);
      if (alignment !== 'none') {
        score += 0.2 / groups.length;
      }
    }
  }

  // 4. 主要分布集中度
  const largestGroup = groups.reduce((a, b) =>
    a.length > b.length ? a : b
  );
  if (largestGroup.length >= totalElements * 0.7) {
    score += 0.1;
  }

  return { score: Math.min(1, score) };
}
```

### 4.5 递归布局树构建

```typescript
function buildLayoutTree(rects: ElementRect[], depth = 0): LayoutNode {
  // 单个元素直接返回
  if (rects.length === 1) {
    return { type: 'element', elementIndex: rects[0].index };
  }

  // 达到最大深度
  if (depth >= 5) {
    return {
      type: 'container',
      direction: 'column',
      children: rects.map(r => ({ type: 'element', elementIndex: r.index }))
    };
  }

  // 分析布局
  const analysis = analyzeLayout(rects);

  // 处理重叠元素
  const overlappingNodes = analysis.overlappingElements.map(r => ({
    type: 'element',
    elementIndex: r.index,
    needsAbsolute: true
  }));

  // 过滤掉重叠元素
  const nonOverlapping = rects.filter(
    r => !analysis.overlappingElements.some(o => o.index === r.index)
  );

  if (analysis.direction === 'none') {
    return {
      type: 'container',
      direction: 'column',
      children: [...nonOverlapping.map(r => ({
        type: 'element',
        elementIndex: r.index
      })), ...overlappingNodes]
    };
  }

  // 根据布局方向分组并递归
  const groups = analysis.direction === 'row' ? analysis.rows : analysis.columns;
  const children = groups.map(group => {
    if (group.length === 1) {
      return { type: 'element', elementIndex: group[0].index };
    }
    return buildLayoutTree(group, depth + 1);
  });

  return {
    type: 'container',
    direction: analysis.direction,
    gap: analysis.isGapConsistent && analysis.gap > 0 ? analysis.gap : undefined,
    justifyContent: analysis.justifyContent !== 'flex-start' ? analysis.justifyContent : undefined,
    alignItems: analysis.alignItems !== 'stretch' ? analysis.alignItems : undefined,
    children: [...children, ...overlappingNodes]
  };
}
```

---

## 5. 测试验证

### 5.1 测试数据

使用真实的 Figma 导出数据进行测试：
- 数据来源：TikTok 风格的短视频卡片设计
- 节点数量：17 个
- 包含：文本、图标（SVG向量组）、容器

### 5.2 测试结果

```
总容器数: 4
  - Flex Row: 0 (0.0%)
  - Flex Column: 1 (25.0%)
  - Absolute (重叠): 3 (75.0%)
  - Mixed/Unknown: 0 (0.0%)
```

**分析**：
- 主 Group 被正确识别为 **flex-column** 布局
- 3 个图标组（由重叠的 SVG 向量组成）被正确识别需要 **absolute** 定位
- 算法正确处理了重叠元素的情况

### 5.3 单元测试结果

| 测试项 | 结果 |
|--------|------|
| 边界框提取 | ✓ 通过 |
| 行分组算法 | ✓ 通过 |
| 列分组算法 | ✓ 通过 |
| 一致间距检测 (16px, stdDev=0.63) | ✓ 通过 |
| 不一致间距检测 | ✓ 通过 |
| 左对齐检测 | ✓ 通过 |
| 居中对齐检测 | ✓ 通过 |
| 布局树构建 | ✓ 通过 |

---

## 6. 最佳实践与建议

### 6.1 算法调优参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 重叠容差 | 2px | Y/X 轴重叠检测的容差 |
| 间距一致性阈值 | 20% | 标准差/平均值的比例阈值 |
| 对齐容差 | 3px 或 2% | 对齐检测的容差（取较大值） |
| 布局置信度阈值 | 0.3 | 低于此值认为无明确布局 |
| 最大递归深度 | 5 | 布局树构建的最大深度 |

### 6.2 处理特殊情况

**1. 图标/SVG 向量组**
- 通常由多个重叠的向量组成
- 应识别为需要 absolute 定位
- 建议导出为单个 SVG 图片

**2. 复杂嵌套布局**
- 使用递归分析
- 限制最大深度防止过度嵌套
- 对于超复杂布局，可能需要人工干预

**3. 设计师未使用 Auto Layout**
- 依赖本算法推断布局
- 建议设计师学习使用 Auto Layout
- 可以提供布局建议/警告

### 6.3 与 Figma Auto Layout 的配合

当 Figma 节点包含 `layoutMode` 属性时，优先使用 Figma 的布局数据：

```typescript
function processNode(node: FigmaNode) {
  // 优先使用 Figma 的 Auto Layout 数据
  if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') {
    return {
      direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
      gap: node.itemSpacing,
      // ... 映射其他属性
    };
  }

  // 否则使用推断算法
  return inferLayout(node.children);
}
```

### 6.4 性能优化建议

1. **缓存计算结果**：对于相同的节点集合，缓存布局分析结果
2. **并行处理**：对于独立的子树，可以并行分析
3. **早期剪枝**：如果分组数量过多，可以提前放弃推断
4. **增量更新**：设计变更时只重新分析受影响的部分

---

## 7. 参考资源

### 7.1 开源项目

| 项目 | 链接 | 说明 |
|------|------|------|
| FigmaToCode | https://github.com/bernaferrari/FigmaToCode | Figma 转代码插件 |
| Grida Code | https://github.com/gridaco/code | 设计转代码引擎 |
| Facebook Yoga | https://github.com/facebook/yoga | C++ Flexbox 布局引擎 |
| Taffy | https://github.com/DioxusLabs/taffy | Rust Flexbox/Grid 引擎 |

### 7.2 文档与文章

- [imgcook 布局算法](https://www.alibabacloud.com/blog/imgcook-3-0-series-layout-algorithm-design-based-code-generation_597856) - 阿里巴巴
- [GUI 布局推断算法论文](https://www.sciencedirect.com/science/article/abs/pii/S0950584915001718) - 学术研究
- [Flexbox 布局引擎实现](https://tchayen.com/how-to-write-a-flexbox-layout-engine) - 600 行代码实现
- [Figma Auto Layout 文档](https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout) - 官方指南

### 7.3 本项目文件

| 文件 | 说明 |
|------|------|
| `src/utils/layout-detection.ts` | 核心布局检测算法实现 |
| `src/transformers/layout-optimizer.ts` | 布局优化器（集成版） |
| `test/test-layout-detection.ts` | 单元测试 |
| `test/test-full-layout-analysis.ts` | 集成测试 |
| `test/generate-html-preview.ts` | HTML 预览生成器 |

---

## 附录：算法流程图

```
                    ┌─────────────────┐
                    │  输入: 元素列表  │
                    │ (绝对定位坐标)  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  提取边界框     │
                    │ (x,y,w,h)      │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌─────────────────┐           ┌─────────────────┐
     │  Y轴重叠分组    │           │  X轴重叠分组    │
     │   (检测行)      │           │   (检测列)      │
     └────────┬────────┘           └────────┬────────┘
              │                             │
              ▼                             ▼
     ┌─────────────────┐           ┌─────────────────┐
     │  计算行布局分数  │           │  计算列布局分数  │
     └────────┬────────┘           └────────┬────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  比较分数       │
                    │  选择方向       │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌─────────────────┐           ┌─────────────────┐
     │  检测重叠元素   │           │  分析间距/对齐  │
     │ (需要absolute) │           │                 │
     └────────┬────────┘           └────────┬────────┘
              │                             │
              └──────────────┬──────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  递归构建       │
                    │  布局树         │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  生成 CSS       │
                    │  flex 属性      │
                    └─────────────────┘
```

---

*文档版本: 1.0*
*最后更新: 2025-12-05*
