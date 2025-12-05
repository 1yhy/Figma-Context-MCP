# 设计稿转代码布局检测研究

## 概述

本文档提供了设计稿转代码(D2C, Design-to-Code)转换工具中使用的布局检测算法的全面分析。研究重点关注各种实现如何区分流式布局(flex)、堆叠布局(absolute)和网格布局(grid)。

## 目录

1. [问题定义](#问题定义)
2. [业界实现](#业界实现)
3. [学术研究](#学术研究)
4. [算法对比](#算法对比)
5. [检测标准与阈值](#检测标准与阈值)
6. [重叠检测](#重叠检测)
7. [实现建议](#实现建议)

---

## 问题定义

### 核心挑战

像 Figma 这样的设计工具将元素位置存储为绝对坐标(x, y, width, height)。将这些转换为语义化的 CSS 布局需要推断设计师的意图:

| 布局类型          | CSS 属性                                | 使用场景                   |
| ----------------- | --------------------------------------- | -------------------------- |
| **流式(横向)**    | `display: flex; flex-direction: row`    | 具有一致间距的行内元素     |
| **流式(纵向)**    | `display: flex; flex-direction: column` | 垂直堆叠的元素             |
| **网格**          | `display: grid`                         | 对齐元素的二维矩阵         |
| **堆叠/绝对定位** | `position: absolute`                    | 重叠元素、装饰性定位的元素 |

### 需要回答的关键问题

1. 如何检测元素是否形成**行**还是**列**?
2. 何时应该使用**Grid**而不是**嵌套的 Flex**?
3. 如何识别需要绝对定位的**重叠/堆叠**元素?
4. 什么样的**容差阈值**最适合现实世界的设计?

---

## 业界实现

### 1. imgcook (阿里巴巴 D2C 平台)

**架构**: 确定性优先的流水线,带有机器学习回退

```
设计 JSON → 扁平化 → 行/列分组 → 布局推断 → 语义标签 → 代码
```

**流式布局 vs 堆叠布局检测算法**:

```typescript
// 核心概念: 轴重叠决定布局类型
function detectLayoutDirection(elements: Element[]): 'row' | 'column' | 'stacked' {
  // 步骤 1: 检查 Y 轴重叠(同一水平行)
  const yOverlapGroups = groupByAxisOverlap(elements, 'y', tolerance: 2);

  // 步骤 2: 如果只有一个 Y 组,检查 X 轴重叠(垂直列)
  if (yOverlapGroups.length === 1) {
    const xOverlapGroups = groupByAxisOverlap(elements, 'x', tolerance: 2);
    if (xOverlapGroups.length > 1) return 'column';
  }

  // 步骤 3: 检查重叠元素
  const hasOverlap = elements.some((a, i) =>
    elements.slice(i + 1).some(b => calculateIoU(a, b) > 0.1)
  );

  return hasOverlap ? 'stacked' : 'row';
}
```

**分组算法**:

```typescript
function groupByAxisOverlap(elements: Element[], axis: "x" | "y", tolerance: number): Element[][] {
  // 按轴位置排序
  const sorted = elements.sort((a, b) => a[axis] - b[axis]);
  const groups: Element[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const lastGroup = groups[groups.length - 1];
    const lastElement = lastGroup[lastGroup.length - 1];

    // 检查当前元素是否在相反轴上与最后一个元素重叠
    const overlaps =
      axis === "y"
        ? rangesOverlap(lastElement.y, lastElement.bottom, current.y, current.bottom, tolerance)
        : rangesOverlap(lastElement.x, lastElement.right, current.x, current.right, tolerance);

    if (overlaps) {
      lastGroup.push(current);
    } else {
      groups.push([current]);
    }
  }

  return groups;
}
```

**关键阈值**:

| 参数         | 值       | 用途               |
| ------------ | -------- | ------------------ |
| Y 轴容差     | 2px      | 行分组             |
| X 轴容差     | 2px      | 列分组             |
| 间距方差     | 20%      | 检测一致的间距     |
| 对齐容差     | 2px      | 检测对齐的边缘     |
| IoU 重叠阈值 | 0.1      | 标记为绝对定位     |
| 最大递归深度 | 5        | 防止无限嵌套       |
| 间距四舍五入 | 4px 网格 | 对齐到常见的设计值 |

**置信度评分**:

```typescript
interface LayoutConfidence {
  patternCoverage: number; // 符合模式的元素数量
  gapConsistency: number; // 间距的标准差
  alignmentAccuracy: number; // 元素对齐程度
}

function calculateConfidence(analysis: LayoutAnalysis): number {
  let score = 0;

  score += analysis.patternCoverage * 0.4; // 40% 权重
  score += analysis.gapConsistency * 0.35; // 35% 权重
  score += analysis.alignmentAccuracy * 0.25; // 25% 权重

  return score;
}

// 仅当置信度 >= 0.3 时才接受布局
const MIN_CONFIDENCE = 0.3;
```

---

### 2. FigmaToCode (开源)

**方法**: 元数据优先(信任 Figma 自动布局)

```typescript
// FigmaToCode 不从坐标推断布局
// 相反,它读取 Figma 的原生自动布局元数据
function convertLayout(node: FigmaNode): CSSLayout {
  if (node.layoutMode === "HORIZONTAL") {
    return { display: "flex", flexDirection: "row" };
  }
  if (node.layoutMode === "VERTICAL") {
    return { display: "flex", flexDirection: "column" };
  }
  // 无自动布局 = 回退到绝对定位
  return { position: "absolute" };
}
```

**局限性**:

- 要求设计师使用 Figma 自动布局功能
- 没有自动布局的旧设计会获得绝对定位
- 没有基于坐标的布局推断

**关键创新**: AltNodes 中间表示

- 将 Figma 节点转换为简化的虚拟节点
- 处理混合定位(绝对定位 + 自动布局子元素)
- 对代码结构做出智能决策

---

### 3. Locofy

**方法**: 自动布局 + 绝对定位混合

Locofy 使用 LocoAI 分析设计并应用适当的 CSS 属性:

```typescript
// Locofy 的布局检测方法
function analyzeLayout(elements: Element[]): LayoutDecision {
  // LocoAI 将元素分组以获得更好的结构
  const groups = locoAI.groupElements(elements);

  // 应用相关的 CSS 属性(flex)以实现响应式
  for (const group of groups) {
    if (group.hasAutoLayout) {
      // 自动布局对应 CSS 中的 Flexbox
      applyFlexLayout(group);
    } else if (group.isFloating) {
      // 浮动元素使用绝对定位
      applyAbsolutePosition(group);
    }
  }
}
```

**关键特性**:

- 更改绝对位置状态并重新运行算法以重新分组
- 浮动元素在自动布局设置中使用 absolute 属性
- 绝对定位元素的父元素决定定位上下文

---

### 4. Anima Auto-Flexbox

**方法**: 自动 Flexbox 的计算机视觉算法

```typescript
// Anima 的 Auto-Flexbox 算法
// 从开发者思考过程逆向工程
function applyAutoFlexbox(design: Design): Layout {
  // 没有 Auto-Flexbox: 生成绝对布局
  // 使用 Auto-Flexbox: 生成相对定位(Flexbox)

  // 来自计算机视觉领域的 CV 算法
  const flexboxLayout = cvAlgorithm.analyzeAndApply(design);

  // 相对定位允许层相互推动
  return flexboxLayout;
}
```

**关键见解**: "绝对布局对于设计阶段很好,但对于最终产品则不太理想。Flexbox 布局意味着相对定位。"

---

### 5. Gridaco / Grida

**方法**: 规则 + 机器学习混合(类似于 imgcook)

```typescript
// 通过启发式实现高可用性布局方向检测
// 机器学习保留用于组件/循环识别
function detectLayout(elements: Element[]): LayoutType {
  // 首先基于规则的方向检测
  const direction = detectDirectionByRules(elements);

  // 机器学习用于语义理解
  const semantics = mlModel.predictSemantics(elements);

  return combineResults(direction, semantics);
}
```

---

### 6. Phoenix Codie 位置检测系统

**关键创新**: 明确避免"position: absolute 滥用"

```typescript
interface PositionDecision {
  element: Element;
  shouldBeAbsolute: boolean;
  reason: "overlap" | "decorative" | "anchor" | "flow";
}

function analyzePosition(element: Element, siblings: Element[]): PositionDecision {
  // 仅在以下情况使用绝对定位:
  // 1. 重叠元素
  // 2. 装饰性元素(徽章、自由定位的图标)
  // 3. 锚点元素(工具提示、模态框)

  const overlaps = siblings.some((s) => hasSignificantOverlap(element, s));
  const isDecorative = element.type === "DECORATIVE";
  const isAnchor = element.hasAnchorConstraint;

  return {
    element,
    shouldBeAbsolute: overlaps || isDecorative || isAnchor,
    reason: overlaps ? "overlap" : isDecorative ? "decorative" : isAnchor ? "anchor" : "flow",
  };
}
```

---

## 学术研究

### 1. Allen 区间代数(基础理论)

**来源**: "A Layout Inference Algorithm for GUIs" (ScienceDirect)

Allen 的 13 个区间关系描述了一维空间关系:

```
| 关系     | 可视化 | 描述                 |
|----------|--------|----------------------|
| before   | A---B  | A 完全在 B 之前      |
| meets    | A--B   | A 的结束处是 B 的开始处 |
| overlaps | A-B-   | A 部分重叠 B         |
| starts   | AB--   | A 与 B 在同一位置开始 |
| during   | -A-B   | A 完全在 B 内部      |
| equals   | A=B    | 相同的位置和大小     |
```

**在布局检测中的应用**:

```typescript
function getAllenRelation(a: Interval, b: Interval): AllenRelation {
  if (a.end < b.start) return "before";
  if (a.end === b.start) return "meets";
  if (a.start < b.start && a.end > b.start && a.end < b.end) return "overlaps";
  if (a.start === b.start && a.end < b.end) return "starts";
  if (a.start > b.start && a.end < b.end) return "during";
  if (a.start === b.start && a.end === b.end) return "equals";
  // ... 反向关系
}

// 对于 2D 布局,将 Allen 关系应用于 X 和 Y 轴
function get2DRelation(a: Rect, b: Rect): [AllenRelation, AllenRelation] {
  return [
    getAllenRelation({ start: a.x, end: a.right }, { start: b.x, end: b.right }),
    getAllenRelation({ start: a.y, end: a.bottom }, { start: b.y, end: b.bottom }),
  ];
}
```

**两阶段算法**:

1. **阶段 1**: 使用有向图将绝对坐标转换为相对定位
2. **阶段 2**: 应用模式匹配和图重写进行布局组合

**结果**: 97% 的布局保真度,84% 的调整大小时比例保持

---

### 2. GRIDS - 基于 MILP 的布局推断(Aalto 大学)

**方法**: 网格生成的数学优化

```python
# 将网格推断制定为混合整数线性规划
def solve_grid_layout(elements):
    model = gp.Model("grid_layout")

    # 变量: 轨道大小、元素放置
    track_widths = model.addVars(max_columns, lb=0, name="col_width")
    track_heights = model.addVars(max_rows, lb=0, name="row_height")
    placements = model.addVars(len(elements), max_rows, max_columns, vtype=GRB.BINARY)

    # 约束: 元素必须适合轨道,无重叠
    for i, elem in enumerate(elements):
        # 元素宽度必须等于跨越的轨道宽度之和
        model.addConstr(sum(track_widths[c] * placements[i,r,c]
                           for r in range(max_rows)
                           for c in range(max_columns)) >= elem.width)

    # 目标: 最小化与原始位置的偏差
    model.setObjective(sum_position_errors, GRB.MINIMIZE)

    model.optimize()
    return extract_grid_template(model)
```

**优势**:

- 数学上最优的解决方案
- 处理复杂的网格配置
- 精确的轨道大小计算

**劣势**:

- 计算成本高
- 需要 Gurobi 优化器
- 对于简单布局过于复杂

---

### 3. UI 语义组检测(arXiv 2024)

**关键创新**: 基于格式塔的预聚类

```typescript
// 在布局检测之前应用格式塔原则
interface GestaltAnalysis {
  proximityGroups: Element[][];     // 相近元素分组
  similarityGroups: Element[][];    // 相似外观元素分组
  continuityChains: Element[][];    // 形成视觉线的元素
  closureGroups: Element[][];       // 形成封闭形状的元素
}

function applyGestaltPrinciples(elements: Element[]): GestaltAnalysis {
  return {
    proximityGroups: clusterByProximity(elements, distanceThreshold: 20),
    similarityGroups: clusterBySimilarity(elements, sizeVariance: 0.2),
    continuityChains: detectVisualLines(elements),
    closureGroups: detectEnclosures(elements)
  };
}

// 使用格式塔分组改进网格检测
function detectGridWithGestalt(elements: Element[]): GridResult {
  const gestalt = applyGestaltPrinciples(elements);

  // 仅考虑相似性分组进行网格检测
  for (const group of gestalt.similarityGroups) {
    if (group.length >= 4) {
      const gridResult = detectGridLayout(group);
      if (gridResult.confidence >= 0.6) {
        return gridResult;
      }
    }
  }

  return { isGrid: false };
}
```

---

### 4. Screen Parsing (CMU UIST 2021)

**方法**: 基于机器学习的容器类型预测

- 在 210K 移动屏幕上训练(130K iOS + 80K Android)
- 预测包括网格在内的 7 种容器类型
- 使用视觉特征和空间关系

```typescript
interface ContainerPrediction {
  type: "list" | "grid" | "carousel" | "tabs" | "form" | "navigation" | "content";
  confidence: number;
  children: Element[];
}

// 机器学习模型输入特征
interface ScreenFeatures {
  elementBoundingBoxes: Rect[];
  elementTypes: string[];
  visualSimilarities: number[][]; // 成对视觉相似度
  spatialRelations: AllenRelation[][]; // 成对空间关系
}
```

---

## 算法对比

### 检测方法总结

| 工具/研究          | 方法          | 流式布局检测        | 网格布局检测   | 重叠处理             |
| ------------------ | ------------- | ------------------- | -------------- | -------------------- |
| **imgcook**        | 基于规则 + ML | Y 轴重叠分组        | 行/列对齐检查  | IoU > 0.1 → 绝对定位 |
| **FigmaToCode**    | 元数据优先    | 读取 Figma 自动布局 | 无(无推断)     | N/A                  |
| **Grida**          | 规则 + ML     | 类似于 imgcook      | 类似于 imgcook | 类似于 imgcook       |
| **Phoenix Codie**  | 基于规则      | 位置分析            | N/A            | 明确的重叠检查       |
| **Allen 算法**     | 基于图        | 区间关系            | 两阶段推断     | 包含/重叠关系        |
| **GRIDS**          | MILP 优化     | N/A                 | 数学优化       | 基于约束             |
| **Screen Parsing** | 基于 ML       | ML 预测             | ML 预测        | ML 预测              |

### 优势和劣势

| 方法           | 优势                 | 劣势                     |
| -------------- | -------------------- | ------------------------ |
| **基于规则**   | 可预测、可解释、快速 | 灵活性有限、需要手动调整 |
| **元数据优先** | 元数据存在时准确     | 没有设计师配合时失败     |
| **基于 ML**    | 处理复杂模式         | 需要训练数据、黑盒       |
| **MILP**       | 数学上最优           | 计算成本高               |
| **混合**       | 两全其美             | 实现复杂                 |

---

## 检测标准与阈值

### 通用阈值(业界共识)

```typescript
const LAYOUT_THRESHOLDS = {
  // 轴重叠容差
  ROW_GROUPING_TOLERANCE: 2, // px - 同一行的 Y 轴重叠
  COLUMN_GROUPING_TOLERANCE: 2, // px - 同一列的 X 轴重叠

  // 间距分析
  GAP_VARIANCE_THRESHOLD: 0.2, // 20% - 最大变异系数
  GAP_ROUNDING_GRID: 4, // px - 将间距对齐到倍数

  // 对齐
  ALIGNMENT_TOLERANCE: 2, // px - 边缘对齐检测

  // 大小同质性
  SIZE_CV_THRESHOLD: 0.2, // 20% - 网格的最大尺寸方差

  // 重叠检测
  IOU_OVERLAP_THRESHOLD: 0.1, // 10% - 标记为重叠
  IOU_SIGNIFICANT_OVERLAP: 0.5, // 50% - 确定重叠

  // 置信度阈值
  MIN_FLOW_CONFIDENCE: 0.3, // 接受流式布局的最小值
  MIN_GRID_CONFIDENCE: 0.6, // 接受网格布局的最小值

  // 元素数量
  MIN_GRID_ELEMENTS: 4, // 网格检测的最小值
  MIN_GRID_ROWS: 2, // 网格的最小行数
  MIN_GRID_COLUMNS: 2, // 网格的最小列数
};
```

### 间距四舍五入值

```typescript
// 常见设计系统间距值
const COMMON_GAP_VALUES = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64];

function roundGapToCommon(gap: number): number {
  return COMMON_GAP_VALUES.reduce((prev, curr) =>
    Math.abs(curr - gap) < Math.abs(prev - gap) ? curr : prev,
  );
}
```

---

## 重叠检测

### IoU (交并比) 计算

```typescript
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function calculateIoU(a: Rect, b: Rect): number {
  // 计算交集
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = xOverlap * yOverlap;

  // 计算并集
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}
```

### 重叠分类

```typescript
type OverlapType = "none" | "adjacent" | "partial" | "significant" | "contained";

function classifyOverlap(a: Rect, b: Rect): OverlapType {
  const iou = calculateIoU(a, b);

  if (iou === 0) {
    // 检查是否相邻(接触但不重叠)
    const gap = calculateGap(a, b);
    return gap <= 2 ? "adjacent" : "none";
  }

  if (iou < 0.1) return "partial";
  if (iou < 0.5) return "significant";
  return "contained";
}

function shouldUseAbsolutePosition(element: Rect, siblings: Rect[]): boolean {
  for (const sibling of siblings) {
    const overlap = classifyOverlap(element, sibling);
    if (overlap === "partial" || overlap === "significant" || overlap === "contained") {
      return true;
    }
  }
  return false;
}
```

### Z-Index 推断

```typescript
// 当元素重叠时,从以下推断 z 顺序:
// 1. Figma 图层顺序(后来的 = 在顶部)
// 2. 大小(较小的元素通常在顶部)
// 3. 类型(文本/图标通常在背景之上)

function inferZIndex(elements: Element[]): Map<Element, number> {
  const zIndexMap = new Map<Element, number>();

  // 按图层顺序排序(Figma 提供此信息)
  const sorted = [...elements].sort((a, b) => a.layerOrder - b.layerOrder);

  sorted.forEach((el, index) => {
    zIndexMap.set(el, index);
  });

  return zIndexMap;
}
```

---

## 实现建议

### 针对本项目 (Figma-Context-MCP)

基于研究,这里是推荐的算法:

#### 1. 预过滤: 同质性检查(已实现)

```typescript
// 已在 detector.ts 中实现
export function filterHomogeneousForGrid(
  rects: ElementRect[],
  nodeTypes?: string[],
): ElementRect[] {
  const homogeneity = analyzeHomogeneity(rects, nodeTypes, 0.2);
  return homogeneity.homogeneousElements;
}
```

#### 2. 重叠检测(待实现)

```typescript
function detectOverlappingElements(nodes: SimplifiedNode[]): {
  flowElements: SimplifiedNode[];
  stackedElements: SimplifiedNode[];
} {
  const rects = nodes.map(nodeToRect);
  const flowElements: SimplifiedNode[] = [];
  const stackedElements: SimplifiedNode[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const hasOverlap = rects.some((other, j) => i !== j && calculateIoU(rects[i], other) > 0.1);

    if (hasOverlap) {
      stackedElements.push(nodes[i]);
    } else {
      flowElements.push(nodes[i]);
    }
  }

  return { flowElements, stackedElements };
}
```

#### 3. 子元素样式清理(待实现)

```typescript
function cleanChildStylesForFlexParent(child: SimplifiedNode): void {
  if (child.cssStyles) {
    // 当父元素是 flex/grid 时删除 position: absolute
    if (child.cssStyles.position === "absolute") {
      delete child.cssStyles.position;
    }

    // 删除 left/top(现在由 flex/grid 处理)
    delete child.cssStyles.left;
    delete child.cssStyles.top;

    // 为 flex 项保留 width/height(由 flex-basis 使用)
  }
}

function cleanChildStylesForGridParent(child: SimplifiedNode): void {
  if (child.cssStyles) {
    delete child.cssStyles.position;
    delete child.cssStyles.left;
    delete child.cssStyles.top;

    // 如果网格轨道定义了大小,width/height 可能是多余的
    // 但保留它们以进行显式大小调整
  }
}
```

#### 4. 默认值删除(待实现)

```typescript
const CSS_DEFAULT_VALUES: Record<string, string[]> = {
  fontWeight: ["400", "normal"],
  textAlign: ["left", "start"],
  flexDirection: ["row"],
  position: ["static"],
  opacity: ["1"],
  backgroundColor: ["transparent", "rgba(0,0,0,0)"],
  borderWidth: ["0", "0px"],
};

function removeDefaultValues(cssStyles: CSSStyle): CSSStyle {
  const cleaned: CSSStyle = {};

  for (const [key, value] of Object.entries(cssStyles)) {
    const defaults = CSS_DEFAULT_VALUES[key];
    if (defaults && defaults.includes(String(value))) {
      continue; // 跳过默认值
    }
    cleaned[key] = value;
  }

  return cleaned;
}
```

### 完整检测流水线

```
┌─────────────────────────────────────────────────────────────────┐
│                        布局检测流水线                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   1. 输入: 具有绝对坐标的子元素数组                                │
│                            ↓                                      │
│   2. 重叠检查: 分离重叠元素                                        │
│      - IoU > 0.1 → stackedElements(保持绝对定位)                  │
│      - IoU ≤ 0.1 → flowElements(继续分析)                         │
│                            ↓                                      │
│   3. 同质性检查: 过滤相似元素                                      │
│      - 尺寸 CV < 20% 且相同类型 → 同质                            │
│      - 混合尺寸/类型 → 异质                                        │
│                            ↓                                      │
│   4. 行分组: Y 轴重叠(2px 容差)                                    │
│      - 1 行 → 水平 flex                                           │
│      - 多行 → 继续                                                │
│                            ↓                                      │
│   5. 网格检查(仅同质):                                             │
│      - rows ≥ 2 且 columns ≥ 2                                   │
│      - 列对齐 ≥ 80%                                               │
│      - 置信度 ≥ 0.6                                               │
│      → 是: display: grid                                          │
│      → 否: 继续                                                   │
│                            ↓                                      │
│   6. FLEX 方向:                                                   │
│      - 按元素数量确定主要方向                                      │
│      - 如果大多数元素水平则为 row                                  │
│      - 如果大多数元素垂直则为 column                               │
│                            ↓                                      │
│   7. 子元素清理:                                                  │
│      - 删除 position: absolute                                    │
│      - 删除 left/top                                              │
│      - 删除默认 CSS 值                                            │
│                            ↓                                      │
│   8. 输出: 带有干净子元素样式的 LayoutInfo                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 参考文献

### 学术论文

1. **"A Layout Inference Algorithm for Graphical User Interfaces"** (2015)

   - [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0950584915001718)
   - [ResearchGate PDF](https://www.researchgate.net/publication/283526120_A_layout_inference_algorithm_for_Graphical_User_Interfaces)
   - 关键: Allen 区间代数,97% 布局保真度

2. **"GRIDS: Interactive Layout Design with Integer Programming"** (CHI 2020)

   - [项目页面](https://userinterfaces.aalto.fi/grids/)
   - [GitHub](https://github.com/aalto-ui/GRIDS)
   - [论文 PDF](https://acris.aalto.fi/ws/portalfiles/portal/40720569/CHI2020_Dayama_GRIDS.pdf)
   - 作者: Niraj Dayama, Kashyap Todi, Taru Saarelainen, Antti Oulasvirta (Aalto 大学)

3. **"Screen Parsing: Towards Reverse Engineering of UI Models from Screenshots"** (UIST 2021)

   - [CMU ML 博客](https://blog.ml.cmu.edu/2021/12/10/understanding-user-interfaces-with-screen-parsing/)
   - [论文 PDF](https://www.cs.cmu.edu/~jbigham/pubs/pdfs/2021/screen-parsing.pdf)
   - [ACM 数字图书馆](https://dl.acm.org/doi/fullHtml/10.1145/3472749.3474763)
   - 作者: Jason Wu, Xiaoyi Zhang, Jeff Nichols, Jeffrey P. Bigham

4. **"UI Semantic Group Detection"** (arXiv 2024) - arXiv:2403.04984v1

5. **"UIHASH: Grid-Based UI Similarity"** - Jun Zeng et al.

### 开源项目

1. [FigmaToCode](https://github.com/bernaferrari/FigmaToCode) - 在 HTML、Tailwind、Flutter、SwiftUI 上生成响应式页面
2. [GRIDS](https://github.com/aalto-ui/GRIDS) - 基于 MILP 的网格布局生成(Python + Gurobi)
3. [Grida](https://github.com/gridaco/grida) - 设计稿转代码平台
4. [Yoga](https://github.com/facebook/yoga) - Facebook 的跨平台 Flexbox 布局引擎

### 业界资源

1. **imgcook (阿里巴巴)**

   - [布局算法博客](https://www.alibabacloud.com/blog/imgcook-3-0-series-layout-algorithm-design-based-code-generation_597856)
   - [imgcook 工作原理](https://medium.com/imgcook/imgcook-how-are-codes-generated-intelligently-from-design-files-in-alibaba-98ba8e55246d)
   - [100% 准确率](https://www.alibabacloud.com/blog/imgcook-intelligent-code-generation-from-design-drafts-with-a-100%25-accuracy-rate_598093)

2. **Locofy**

   - [设计优化器文档](https://www.locofy.ai/docs/lightning/design-optimiser/)
   - [自动布局到响应式代码](https://www.locofy.ai/docs/classic/design-structure/responsiveness/auto-layout/)

3. **Anima**

   - [Auto-Flexbox 介绍](https://www.animaapp.com/blog/design-to-code/introducing-auto-flexbox/)
   - [从约束生成 Flexbox](https://www.animaapp.com/blog/product-updates/producing-flexbox-responsive-code-based-on-figma-adobe-xd-and-sketch-constraints/)

4. **CSS 标准**

   - [CSS Grid Layout Module Level 1](https://www.w3.org/TR/css-grid-1/) - W3C
   - [CSS Flexible Box Layout](https://www.w3.org/TR/css-flexbox-1/) - W3C
   - [理解布局算法](https://www.joshwcomeau.com/css/understanding-layout-algorithms/) - Josh W. Comeau

5. **基础**
   - [Allen 区间代数](https://en.wikipedia.org/wiki/Allen's_interval_algebra) - Wikipedia
   - [Figma Grid 自动布局](https://help.figma.com/hc/en-us/articles/31289469907863) - Figma 帮助
   - [IoU 解释](https://www.v7labs.com/blog/intersection-over-union-guide) - V7 Labs

---

## 附录: 代码示例

### A. 完整流式布局检测

```typescript
export function detectFlowLayout(elements: Element[]): LayoutInfo {
  // 步骤 1: 检查重叠
  const { flowElements, stackedElements } = detectOverlappingElements(elements);

  if (flowElements.length < 2) {
    return { type: "absolute", elements: stackedElements };
  }

  // 步骤 2: 分组成行
  const rows = groupIntoRows(flowElements, THRESHOLDS.ROW_GROUPING_TOLERANCE);

  // 步骤 3: 确定方向
  if (rows.length === 1) {
    // 单行 = 水平 flex
    const gapAnalysis = analyzeGaps(rows[0], "horizontal");
    return {
      type: "flex",
      direction: "row",
      gap: gapAnalysis.averageGap,
      alignment: detectAlignment(rows[0], "vertical"),
      justifyContent: detectJustifyContent(rows[0], "horizontal"),
    };
  }

  // 步骤 4: 检查网格(多行)
  const gridResult = detectGridLayout(flowElements);
  if (gridResult.isGrid && gridResult.confidence >= 0.6) {
    return {
      type: "grid",
      columns: gridResult.columnCount,
      rows: gridResult.rowCount,
      columnGap: gridResult.columnGap,
      rowGap: gridResult.rowGap,
      trackWidths: gridResult.trackWidths,
    };
  }

  // 步骤 5: 回退到列 flex
  const rowGapAnalysis = analyzeGaps(
    rows.map((r) => r[0]),
    "vertical",
  );
  return {
    type: "flex",
    direction: "column",
    gap: rowGapAnalysis.averageGap,
    alignment: detectAlignment(rows.flat(), "horizontal"),
  };
}
```

### B. 完整网格布局检测

```typescript
export function detectGridLayout(elements: ElementRect[]): GridAnalysisResult {
  // 步骤 1: 分组成行
  const rows = groupIntoRows(elements, 2);

  if (rows.length < 2) {
    return { isGrid: false, confidence: 0 };
  }

  // 步骤 2: 检查列数一致性
  const columnCounts = rows.map((r) => r.length);
  const countVariance = coefficientOfVariation(columnCounts);

  if (countVariance > 0.2) {
    return { isGrid: false, confidence: 0 };
  }

  // 步骤 3: 提取列位置
  const columnPositions = extractColumnPositions(rows);
  const alignmentResult = checkColumnAlignment(columnPositions, 4);

  // 步骤 4: 计算间距
  const columnGaps = calculateColumnGaps(rows);
  const rowGaps = calculateRowGaps(rows);

  // 步骤 5: 计算置信度
  let confidence = 0;
  if (rows.length >= 2) confidence += 0.2;
  if (rows.length >= 3) confidence += 0.1;
  if (countVariance < 0.1) confidence += 0.2;
  if (alignmentResult.isAligned) confidence += 0.25;
  if (coefficientOfVariation(columnGaps) < 0.2) confidence += 0.1;
  if (coefficientOfVariation(rowGaps) < 0.2) confidence += 0.1;

  // 步骤 6: 计算轨道大小
  const trackWidths = calculateTrackWidths(rows, alignmentResult.alignedPositions);
  const trackHeights = rows.map((row) => Math.max(...row.map((el) => el.height)));

  return {
    isGrid: confidence >= 0.6,
    confidence,
    rowCount: rows.length,
    columnCount: Math.max(...columnCounts),
    rowGap: roundGapToCommon(average(rowGaps)),
    columnGap: roundGapToCommon(average(columnGaps)),
    trackWidths,
    trackHeights,
  };
}
```
