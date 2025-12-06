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

| 难点     | 描述                                           |
| -------- | ---------------------------------------------- |
| 行列识别 | 如何判断元素是水平排列还是垂直排列？           |
| 嵌套结构 | 如何将扁平列表转换为嵌套的 DOM 树？            |
| 间距计算 | 如何判断 gap 是否一致，是否应该使用 gap 属性？ |
| 对齐检测 | 如何检测 justify-content 和 align-items？      |
| 重叠处理 | 如何处理需要 absolute 定位的重叠元素？         |
| 容差处理 | 设计稿中的微小偏移如何容错？                   |

---

## 2. 行业方案分析

### 2.1 主流工具对比

| 工具            | 开发者       | 布局检测方式                | 开源 |
| --------------- | ------------ | --------------------------- | ---- |
| **FigmaToCode** | bernaferrari | 依赖 Figma Auto Layout 数据 | ✓    |
| **Grida**       | gridaco      | 规则 + ML 混合              | ✓    |
| **imgcook**     | 阿里巴巴     | 规则系统 + 机器学习         | ✗    |
| **Anima**       | Anima        | 约束推断                    | ✗    |

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
  right: number; // x + width
  bottom: number; // y + height
  centerX: number; // x + width/2
  centerY: number; // y + height/2
}

// 布局分析结果
interface LayoutAnalysisResult {
  direction: "row" | "column" | "none";
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
  type: "container" | "element";
  direction?: "row" | "column";
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
    const overlapsWithRow = currentRow.some((rowElem) => isOverlappingY(rowElem, elem, tolerance));

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
  const rowScore = calculateLayoutScore(rows, "row", rects.length);

  // 计算列布局分数
  const columnScore = calculateLayoutScore(columns, "column", rects.length);

  // 选择分数更高的布局
  if (rowScore.score > columnScore.score && rowScore.score > 0.3) {
    return { direction: "row", confidence: rowScore.score };
  } else if (columnScore.score > rowScore.score && columnScore.score > 0.3) {
    return { direction: "column", confidence: columnScore.score };
  }

  return { direction: "none", confidence: 0 };
}
```

### 4.4 布局分数计算

```typescript
function calculateLayoutScore(groups, direction, totalElements) {
  let score = 0;

  // 1. 分组数量合理性
  if (groups.length === 1 && groups[0].length === totalElements) {
    score += 0.4; // 完美分组
  } else if (groups.length <= 3) {
    score += 0.2; // 分组合理
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
      if (alignment !== "none") {
        score += 0.2 / groups.length;
      }
    }
  }

  // 4. 主要分布集中度
  const largestGroup = groups.reduce((a, b) => (a.length > b.length ? a : b));
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
    return { type: "element", elementIndex: rects[0].index };
  }

  // 达到最大深度
  if (depth >= 5) {
    return {
      type: "container",
      direction: "column",
      children: rects.map((r) => ({ type: "element", elementIndex: r.index })),
    };
  }

  // 分析布局
  const analysis = analyzeLayout(rects);

  // 处理重叠元素
  const overlappingNodes = analysis.overlappingElements.map((r) => ({
    type: "element",
    elementIndex: r.index,
    needsAbsolute: true,
  }));

  // 过滤掉重叠元素
  const nonOverlapping = rects.filter(
    (r) => !analysis.overlappingElements.some((o) => o.index === r.index),
  );

  if (analysis.direction === "none") {
    return {
      type: "container",
      direction: "column",
      children: [
        ...nonOverlapping.map((r) => ({
          type: "element",
          elementIndex: r.index,
        })),
        ...overlappingNodes,
      ],
    };
  }

  // 根据布局方向分组并递归
  const groups = analysis.direction === "row" ? analysis.rows : analysis.columns;
  const children = groups.map((group) => {
    if (group.length === 1) {
      return { type: "element", elementIndex: group[0].index };
    }
    return buildLayoutTree(group, depth + 1);
  });

  return {
    type: "container",
    direction: analysis.direction,
    gap: analysis.isGapConsistent && analysis.gap > 0 ? analysis.gap : undefined,
    justifyContent: analysis.justifyContent !== "flex-start" ? analysis.justifyContent : undefined,
    alignItems: analysis.alignItems !== "stretch" ? analysis.alignItems : undefined,
    children: [...children, ...overlappingNodes],
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

| 测试项                           | 结果   |
| -------------------------------- | ------ |
| 边界框提取                       | ✓ 通过 |
| 行分组算法                       | ✓ 通过 |
| 列分组算法                       | ✓ 通过 |
| 一致间距检测 (16px, stdDev=0.63) | ✓ 通过 |
| 不一致间距检测                   | ✓ 通过 |
| 左对齐检测                       | ✓ 通过 |
| 居中对齐检测                     | ✓ 通过 |
| 布局树构建                       | ✓ 通过 |

---

## 6. 最佳实践与建议

### 6.1 算法调优参数

| 参数           | 默认值    | 说明                       |
| -------------- | --------- | -------------------------- |
| 重叠容差       | 2px       | Y/X 轴重叠检测的容差       |
| 间距一致性阈值 | 20%       | 标准差/平均值的比例阈值    |
| 对齐容差       | 3px 或 2% | 对齐检测的容差（取较大值） |
| 布局置信度阈值 | 0.3       | 低于此值认为无明确布局     |
| 最大递归深度   | 5         | 布局树构建的最大深度       |

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
  if (node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL") {
    return {
      direction: node.layoutMode === "HORIZONTAL" ? "row" : "column",
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

| 项目          | 链接                                        | 说明                   |
| ------------- | ------------------------------------------- | ---------------------- |
| FigmaToCode   | https://github.com/bernaferrari/FigmaToCode | Figma 转代码插件       |
| Grida Code    | https://github.com/gridaco/code             | 设计转代码引擎         |
| Facebook Yoga | https://github.com/facebook/yoga            | C++ Flexbox 布局引擎   |
| Taffy         | https://github.com/DioxusLabs/taffy         | Rust Flexbox/Grid 引擎 |

### 7.2 文档与文章

- [imgcook 布局算法](https://www.alibabacloud.com/blog/imgcook-3-0-series-layout-algorithm-design-based-code-generation_597856) - 阿里巴巴
- [GUI 布局推断算法论文](https://www.sciencedirect.com/science/article/abs/pii/S0950584915001718) - 学术研究
- [Flexbox 布局引擎实现](https://tchayen.com/how-to-write-a-flexbox-layout-engine) - 600 行代码实现
- [Figma Auto Layout 文档](https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout) - 官方指南

### 7.3 本项目文件

| 文件                                   | 说明                 |
| -------------------------------------- | -------------------- |
| `src/utils/layout-detection.ts`        | 核心布局检测算法实现 |
| `src/transformers/layout-optimizer.ts` | 布局优化器（集成版） |
| `test/test-layout-detection.ts`        | 单元测试             |
| `test/test-full-layout-analysis.ts`    | 集成测试             |
| `test/generate-html-preview.ts`        | HTML 预览生成器      |

---

## 附录A：算法流程图

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

## 附录B：完整实现链路分析

本节深入分析布局检测算法的代码实现，包括完整的调用链路和核心函数。

### B.1 系统架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Layout Optimization System                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    optimizer.ts (协调层)                          │   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │   │
│  │  │  optimizeDesign()  →  optimizeNodeTree()  →  optimizeContainer() │ │
│  │  └─────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                    ┌───────────────┼───────────────┐                    │
│                    ▼               ▼               ▼                    │
│  ┌─────────────────────┐ ┌─────────────────┐ ┌─────────────────────┐   │
│  │  detector.ts        │ │  detector.ts    │ │  optimizer.ts       │   │
│  │  (重叠检测)          │ │  (布局检测)      │ │  (样式生成)          │   │
│  │                     │ │                 │ │                     │   │
│  │ detectOverlapping() │ │ analyzeLayout() │ │ generateGridCSS()   │   │
│  │ detectBackground()  │ │ detectGrid()    │ │ convertToRelative() │   │
│  └─────────────────────┘ └─────────────────┘ └─────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### B.2 核心入口函数调用链

```
src/algorithms/layout/optimizer.ts
═══════════════════════════════════════════════════════════════════════════

                          ┌─────────────────────────┐
                          │  LayoutOptimizer.       │
                          │  optimizeDesign(design) │
                          │  [optimizer.ts:36]      │
                          └───────────┬─────────────┘
                                      │
                    重置 containerIdCounter
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │  design.nodes.map((node) =>    │
                    │    optimizeNodeTree(node)      │
                    │  )                             │
                    │  [optimizer.ts:46]             │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼ (递归处理每个节点)
                    ┌─────────────────────────────────┐
                    │  optimizeNodeTree(node)         │
                    │  [optimizer.ts:61]              │
                    │                                 │
                    │  对每个子节点递归调用自身，      │
                    │  然后调用 optimizeContainer()   │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │  optimizeContainer(node)        │
                    │  [optimizer.ts:89]              │
                    │                                 │
                    │  核心优化逻辑 (见 B.3)          │
                    └─────────────────────────────────┘
```

### B.3 optimizeContainer 四步算法

```
optimizeContainer(node) - [optimizer.ts:89-356]
═══════════════════════════════════════════════════════════════════════════

输入: SimplifiedNode (带 children 的容器节点)
输出: 优化后的 SimplifiedNode

┌─────────────────────────────────────────────────────────────────────────┐
│ 前置检查                                                                 │
│ • children.length <= 1 → 直接返回                                        │
│ • 检查是否为 FRAME/GROUP 容器                                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1: 重叠检测 (Overlap Detection)                                    │
│ [optimizer.ts:98-109]                                                   │
│                                                                          │
│   elementRects = nodesToElementRects(children)                          │
│                         │                                                │
│                         ▼                                                │
│   overlapResult = detectOverlappingElements(elementRects, 0.1)          │
│                         │                                                │
│         ┌───────────────┴───────────────┐                               │
│         │                               │                               │
│         ▼                               ▼                               │
│   flowElements[]              stackedElements[]                         │
│   (参与布局)                    (保持 absolute)                          │
│                                                                          │
│   如果 flowElements.length < 2 → 跳过布局优化                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1.5: 背景元素检测 (Background Detection)                            │
│ [optimizer.ts:111-151]                                                  │
│                                                                          │
│   detectBackgroundElement(elementRects, parentWidth, parentHeight)      │
│                         │                                                │
│           ┌─────────────┴─────────────┐                                 │
│           │ hasBackground: true       │                                 │
│           │ backgroundIndex >= 0      │                                 │
│           └─────────────┬─────────────┘                                 │
│                         │                                                │
│       isBackgroundElement() ──► extractBackgroundStyles()               │
│                         │             │                                  │
│                         │             ▼                                  │
│                         │   mergedBackgroundStyles = {                  │
│                         │     backgroundColor, borderRadius,            │
│                         │     border, boxShadow...                      │
│                         │   }                                           │
│                         │                                                │
│                         ▼                                                │
│   filteredChildren = children.filter(非背景元素)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Grid 检测 (Grid Detection) - 优先于 Flex                        │
│ [optimizer.ts:165-206]                                                  │
│                                                                          │
│   if (isContainer) {                                                    │
│       gridDetection = detectGridIfApplicable(filteredChildren)          │
│                         │                                                │
│       if (gridDetection) {                                              │
│           ┌─────────────┴─────────────┐                                 │
│           │ gridResult                 │                                 │
│           │ gridIndices (参与Grid元素) │                                 │
│           └─────────────┬─────────────┘                                 │
│                         │                                                │
│           gridStyles = generateGridCSS(gridResult)                      │
│                         │                                                │
│           convertAbsoluteToRelative(..., gridIndices)                   │
│                         │                                                │
│           return 带 Grid 布局的节点 ──────────────────► [END]           │
│       }                                                                  │
│   }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Grid 未检测到)
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Flex 检测 (Flex Detection) - 后备方案                           │
│ [optimizer.ts:208-356]                                                  │
│                                                                          │
│   { isRow, isColumn, rowGap, columnGap,                                 │
│     isGapConsistent, justifyContent, alignItems }                       │
│       = analyzeLayoutDirection(filteredChildren)                        │
│                         │                                                │
│         ┌───────────────┴───────────────┐                               │
│         │                               │                               │
│    isRow = true                    isColumn = true                      │
│    direction: 'row'                direction: 'column'                  │
│         │                               │                               │
│         └───────────────┬───────────────┘                               │
│                         │                                                │
│   flexStyles = {                                                        │
│     display: 'flex',                                                    │
│     flexDirection: direction,  // 只在 column 时设置                    │
│     gap: `${gap}px`,           // 只在一致时设置                        │
│     justifyContent,                                                      │
│     alignItems                                                           │
│   }                                                                      │
│                         │                                                │
│   convertAbsoluteToRelative() → padding + 清理子元素样式                 │
│                         │                                                │
│   return 带 Flex 布局的节点                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### B.4 Flex 布局检测详细流程

```
analyzeLayoutDirection(nodes) - [optimizer.ts:361-438]
═══════════════════════════════════════════════════════════════════════════

输入: SimplifiedNode[] (子节点数组)
输出: { isRow, isColumn, rowGap, columnGap, isGapConsistent,
        justifyContent, alignItems }

                    ┌─────────────────────────────────┐
                    │  提取位置信息                    │
                    │  rects = nodes.map(node => {    │
                    │    left, top, width, height     │
                    │  })                             │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │  analyzeAlignment(rects)        │
                    │  [optimizer.ts:443-489]         │
                    │                                 │
                    │  分析水平/垂直对齐情况：         │
                    │  • leftAligned    (左对齐)      │
                    │  • rightAligned   (右对齐)      │
                    │  • centerHAligned (水平居中)    │
                    │  • topAligned     (顶对齐)      │
                    │  • bottomAligned  (底对齐)      │
                    │  • centerVAligned (垂直居中)    │
                    └───────────────┬─────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
     ┌─────────────────────────┐     ┌─────────────────────────┐
     │  calculateRowScore()    │     │  calculateColumnScore()  │
     │  [optimizer.ts:551-579] │     │  [optimizer.ts:584-612]  │
     │                         │     │                          │
     │  行布局分数计算：        │     │  列布局分数计算：         │
     │                         │     │                          │
     │  1. 按 left 排序        │     │  1. 按 top 排序          │
     │                         │     │                          │
     │  2. 计算水平间距         │     │  2. 计算垂直间距         │
     │     gap = next.left -   │     │     gap = next.top -     │
     │           current.right │     │           current.bottom │
     │                         │     │                          │
     │  3. 统计连续正间距数     │     │  3. 统计连续正间距数     │
     │     (0 <= gap <= 50px)  │     │     (0 <= gap <= 50px)   │
     │                         │     │                          │
     │  4. 分数计算：           │     │  4. 分数计算：           │
     │     distribution * 0.7  │     │     distribution * 0.7   │
     │     + alignment * 0.3   │     │     + alignment * 0.3    │
     └───────────────┬─────────┘     └───────────────┬──────────┘
                     │                               │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  布局方向决策                    │
                    │                                 │
                    │  if (rowScore > columnScore     │
                    │      && rowScore > 0.4)         │
                    │      → isRow = true             │
                    │                                 │
                    │  if (columnScore > rowScore     │
                    │      && columnScore > 0.4)      │
                    │      → isColumn = true          │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │  CSS 属性映射                    │
                    │                                 │
                    │  Row 布局:                      │
                    │    justify = horizontal align  │
                    │    align   = vertical align    │
                    │                                 │
                    │  Column 布局:                   │
                    │    justify = vertical align    │
                    │    align   = horizontal align  │
                    └─────────────────────────────────┘
```

### B.5 重叠检测算法 (IoU)

```
detectOverlappingElements(rects, iouThreshold=0.1) - [detector.ts:246-281]
═══════════════════════════════════════════════════════════════════════════

IoU (Intersection over Union) 计算:

          ┌──────────────────────────────┐
          │         Element A            │
          │    ┌──────────────────────┐  │
          │    │     Intersection     │  │
          └────┼──────────────────────┼──┘
               │     Element B        │
               └──────────────────────┘

  IoU = Intersection Area / Union Area

  where:
    Intersection = overlap_width × overlap_height
    Union = Area_A + Area_B - Intersection


算法流程:
┌────────────────────────────────────────────────────────────────┐
│  for each pair (i, j) where i < j:                             │
│                                                                 │
│    iou = calculateIoU(rects[i], rects[j])                      │
│                                                                 │
│    if (iou > 0.1):                                             │
│      stackedIndices.add(rects[i].index)                        │
│      stackedIndices.add(rects[j].index)                        │
│                                                                 │
│  结果:                                                          │
│    flowElements     = 不在 stackedIndices 中的元素              │
│    stackedElements  = 在 stackedIndices 中的元素                │
└────────────────────────────────────────────────────────────────┘

IoU 阈值分类:
┌────────────┬───────────────────────────────────────────────────┐
│ IoU 范围    │ 分类                                               │
├────────────┼───────────────────────────────────────────────────┤
│ = 0        │ none/adjacent (无重叠或相邻)                        │
│ 0 < x < 0.1│ partial (轻微重叠 - 可参与布局)                     │
│ 0.1 ≤ x < 0.5│ significant (显著重叠 - 需要 absolute)          │
│ ≥ 0.5      │ contained (严重重叠/包含关系)                       │
└────────────┴───────────────────────────────────────────────────┘
```

### B.6 间距分析算法

```
calculateGaps() + analyzeGaps() - [detector.ts:447-509]
═══════════════════════════════════════════════════════════════════════════

间距计算示例 (horizontal 方向):

     ┌────┐   gap1   ┌────┐   gap2   ┌────┐
     │ A  │ ──────── │ B  │ ──────── │ C  │
     └────┘          └────┘          └────┘
      right          left  right     left

  gap1 = B.x - A.right
  gap2 = C.x - B.right


间距一致性分析:
┌────────────────────────────────────────────────────────────────┐
│  analyzeGaps(gaps, tolerancePercent=20)                        │
│                                                                 │
│  1. 计算平均值:                                                  │
│     average = sum(gaps) / gaps.length                          │
│                                                                 │
│  2. 计算标准差:                                                  │
│     variance = Σ(gap - average)² / n                           │
│     stdDev = √variance                                         │
│                                                                 │
│  3. 一致性判断:                                                  │
│     tolerance = average × 20%                                  │
│     isConsistent = (stdDev <= tolerance)                       │
│                                                                 │
│  4. 圆整到常用值:                                                │
│     COMMON_VALUES = [0,2,4,6,8,10,12,16,20,24,32,40,48,64...]  │
│     rounded = findClosest(average, COMMON_VALUES)              │
└────────────────────────────────────────────────────────────────┘

示例:
┌──────────────────────────────────────────────────────────────┐
│  gaps = [16, 15, 17, 16]                                     │
│  average = 16                                                 │
│  stdDev = 0.71                                               │
│  tolerance = 16 × 0.2 = 3.2                                  │
│  isConsistent = (0.71 <= 3.2) = true ✓                       │
│  rounded = 16px                                              │
└──────────────────────────────────────────────────────────────┘
```

### B.7 绝对定位转相对定位

```
convertAbsoluteToRelative() - [optimizer.ts:1591-1685]
═══════════════════════════════════════════════════════════════════════════

原始布局 (绝对定位):
┌────────────────────────────────────────────────┐
│ Parent Container                               │
│  ┌──────────────────────────────────────────┐  │
│  │ ← paddingLeft                             │  │
│  │    ┌────────┐   gap    ┌────────┐        │  │
│  │    │ Child1 │ ──────── │ Child2 │        │  │
│  │    │left:20 │          │left:140│        │  │
│  │    │top:10  │          │top:10  │        │  │
│  │    └────────┘          └────────┘        │  │
│  │                                 paddingRight→│
│  └──────────────────────────────────────────┘  │
│                              ↓ paddingBottom   │
└────────────────────────────────────────────────┘

转换后 (Flex 布局):
┌────────────────────────────────────────────────┐
│ Parent Container                               │
│ display: flex;                                 │
│ padding: 10px 30px 20px 20px;                 │
│ gap: 20px;                                     │
│  ┌──────────────────────────────────────────┐  │
│  │    ┌────────┐   ←gap→  ┌────────┐        │  │
│  │    │ Child1 │          │ Child2 │        │  │
│  │    │(无left)│          │(无left)│        │  │
│  │    │(无top) │          │(无top) │        │  │
│  │    └────────┘          └────────┘        │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘


转换步骤:
┌────────────────────────────────────────────────────────────────┐
│  1. collectFlowChildOffsets()                                  │
│     收集所有流式子元素的位置信息                                  │
│                                                                 │
│  2. inferContainerPadding()                                    │
│     从子元素位置推断容器 padding:                                │
│     • paddingLeft   = min(children.left)                       │
│     • paddingTop    = min(children.top)                        │
│     • paddingRight  = parentWidth - max(children.right)        │
│     • paddingBottom = parentHeight - max(children.bottom)      │
│                                                                 │
│  3. calculateChildMargins()                                    │
│     计算子元素的个别 margin 调整 (交叉轴偏移)                    │
│                                                                 │
│  4. generatePaddingCSS()                                       │
│     生成 CSS padding 简写:                                      │
│     • 全相同: "10px"                                            │
│     • 上下相同,左右相同: "10px 20px"                             │
│     • 全不同: "10px 20px 30px 40px"                             │
│                                                                 │
│  5. cleanChildStylesForLayout()                                │
│     清理子元素样式:                                              │
│     • 删除 position: absolute                                  │
│     • 删除 left, top                                           │
│     • 保留 width, height                                       │
└────────────────────────────────────────────────────────────────┘
```

### B.8 核心数据结构

```typescript
// detector.ts 中的核心数据结构
═══════════════════════════════════════════════════════════════════════════

// 基础边界框
interface BoundingBox {
  x: number;      // 左边距
  y: number;      // 上边距
  width: number;  // 宽度
  height: number; // 高度
}

// 扩展元素矩形 (包含计算属性)
interface ElementRect extends BoundingBox {
  index: number;   // 在原始数组中的索引
  right: number;   // x + width
  bottom: number;  // y + height
  centerX: number; // x + width/2
  centerY: number; // y + height/2
}

// 布局分析结果
interface LayoutAnalysisResult {
  direction: 'row' | 'column' | 'none';
  confidence: number;           // 0-1 置信度
  gap: number;                  // 间距值 (px)
  isGapConsistent: boolean;     // 间距是否一致
  justifyContent: string;       // CSS justify-content
  alignItems: string;           // CSS align-items
  rows: ElementRect[][];        // 行分组结果
  columns: ElementRect[][];     // 列分组结果
  overlappingElements: ElementRect[]; // 重叠元素
}

// 重叠检测结果
interface OverlapDetectionResult {
  flowElements: ElementRect[];     // 参与布局的元素
  stackedElements: ElementRect[];  // 需要 absolute 的元素
  stackedIndices: Set<number>;     // 重叠元素索引集合
}

// 背景检测结果
interface BackgroundDetectionResult {
  backgroundIndex: number;    // 背景元素索引 (-1 表示无)
  contentIndices: number[];   // 内容元素索引
  hasBackground: boolean;     // 是否检测到背景
}
```

### B.9 文件路径映射

| 功能模块       | 文件路径                             | 行号范围  |
| -------------- | ------------------------------------ | --------- |
| 边界框提取     | `src/algorithms/layout/detector.ts`  | 56-109    |
| 重叠检测 (IoU) | `src/algorithms/layout/detector.ts`  | 111-281   |
| 背景元素检测   | `src/algorithms/layout/detector.ts`  | 283-344   |
| 行/列分组      | `src/algorithms/layout/detector.ts`  | 346-422   |
| 间距分析       | `src/algorithms/layout/detector.ts`  | 442-535   |
| 对齐检测       | `src/algorithms/layout/detector.ts`  | 537-642   |
| 布局方向检测   | `src/algorithms/layout/detector.ts`  | 644-755   |
| 布局树构建     | `src/algorithms/layout/detector.ts`  | 847-982   |
| 优化入口       | `src/algorithms/layout/optimizer.ts` | 36-53     |
| 容器优化       | `src/algorithms/layout/optimizer.ts` | 89-356    |
| CSS 生成       | `src/algorithms/layout/optimizer.ts` | 875-913   |
| 位置转换       | `src/algorithms/layout/optimizer.ts` | 1591-1685 |

---

_文档版本: 2.0_
_最后更新: 2025-12-06_
