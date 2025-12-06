# Grid 布局检测算法研究

## 研究摘要

本文档综合多个来源的研究成果，设计将 Figma 设计转换为 CSS Grid 的布局检测算法。

## 分析的资料来源

### 1. 学术研究

**"GUI 布局推断算法" (ScienceDirect)**

- 使用 **Allen 区间代数** 进行空间关系建模
- 两阶段算法:
  1. 使用有向图将绝对坐标转换为相对定位
  2. 应用模式匹配和图重写进行布局推断
- 在保持原始布局忠实度方面达到 97% 的准确率
- 84% 的视图在调整大小时保持比例

**Allen 的 13 种区间关系** (适用于一维空间分析):

- `before/after`: 元素 A 完全在 B 之前/之后
- `meets/met-by`: 元素 A 恰好在 B 开始处结束
- `overlaps/overlapped-by`: 元素 A 部分重叠 B
- `starts/started-by`: 元素 A 与 B 在同一位置开始
- `finishes/finished-by`: 元素 A 与 B 在同一位置结束
- `during/contains`: 元素 A 完全在 B 内部/外部
- `equals`: 元素 A 与 B 位置相同

### 2. 开源实现

**FigmaToCode (bernaferrari/FigmaToCode)**

- 使用中间 "AltNodes" 表示
- 分析自动布局、响应式约束、颜色变量
- 处理混合定位（绝对定位 + 自动布局）
- 智能决策代码结构

**imgcook (阿里巴巴)**

- 布局还原是"整个 D2C 流程的核心"
- 使用包含绝对位置、大小、样式的扁平 JSON
- 专家规则系统 + 机器学习混合方法
- 组件：页面拆分、分组、循环检测、多状态处理
- 规则系统优先用于可控性，接近 100% 可用性

**GRIDS (阿尔托大学)**

- 基于 MILP（混合整数线性规划）的方法
- 数学优化用于网格生成
- Python 实现，使用 Gurobi 优化器

### 3. 行业实现

**Figma 原生 Grid 自动布局 (2025年5月)**

- 除水平/垂直外新增 Grid 流选项
- 支持跨度、行/列数
- 相比完整 CSS Grid 规范有限制
- 缺失：`fr` 单位、命名网格区域、子网格

**Screen Parsing (CMU - UIST 2021)**

- 基于 ML 的 UI 结构推断
- 检测 7 种容器类型，包括网格
- 在 13 万 iOS + 8 万 Android 屏幕上训练

## 当前实现分析

### 现有 Flex 布局检测

当前代码库在 `src/algorithms/layout/detector.ts` 中有健壮的 Flex 检测：

```
流程：元素 → 边界框 → 行/列分组 → 间距分析 → 对齐检测 → CSS 生成
```

**关键算法：**

1. **Y 轴重叠** → 行分组（同一行的元素）
2. **X 轴重叠** → 列分组（同一列的元素）
3. **间距分析** → 一致间距检测（20% 标准差容差）
4. **对齐检测** → left/center/right/stretch
5. **布局评分** → 基于置信度的方向选择

### 当前实现的不足

`LayoutInfo` 接口已定义 `type: "flex" | "absolute" | "grid"`，但 Grid 检测**尚未实现**。

## Grid 布局检测算法设计

### 核心概念：何时使用 Grid vs Flex

| 标准       | Flexbox        | CSS Grid              |
| ---------- | -------------- | --------------------- |
| 维度       | 一维（行或列） | 二维（行和列）        |
| 行一致性   | 单行跨越全宽   | 多行且列对齐          |
| 列数       | 每行可变       | 跨行一致              |
| 单元格对齐 | 仅在行内       | 行和列都对齐          |
| 间距       | 单一间距值     | row-gap 和 column-gap |

### 算法：Grid 检测

```typescript
interface GridAnalysisResult {
  isGrid: boolean;
  confidence: number;
  rows: number;
  columns: number;
  rowGap: number;
  columnGap: number;
  trackWidths: number[]; // 用于 grid-template-columns
  trackHeights: number[]; // 用于 grid-template-rows
  cellMap: (number | null)[][]; // 网格位置中的元素索引
}

function detectGridLayout(rects: ElementRect[]): GridAnalysisResult {
  // 步骤 1：按行分组（Y 轴重叠）
  const rows = groupIntoRows(rects);

  // 步骤 2：检查跨行列数是否一致
  const columnCounts = rows.map((row) => row.length);
  const isConsistentColumns = areValuesAligned(columnCounts, 0);

  // 步骤 3：检查跨行列对齐
  const columnPositions = extractColumnPositions(rows);
  const areColumnsAligned = checkColumnAlignment(columnPositions);

  // 步骤 4：计算置信度
  // Grid 置信度在以下情况下更高：
  // - 存在多行（> 1）
  // - 列跨行对齐
  // - 行间距和列间距都一致

  // 步骤 5：提取轨道尺寸
  const trackWidths = calculateTrackWidths(rows, columnPositions);
  const trackHeights = calculateTrackHeights(rows);

  return result;
}
```

### 分步算法

#### 步骤 1：行检测（已有）

```typescript
// 已实现：groupIntoRows()
const rows = groupIntoRows(rects, tolerance);
```

#### 步骤 2：列对齐检测（新增）

```typescript
function extractColumnPositions(rows: ElementRect[][]): number[][] {
  // 对每一行，提取元素的 X 位置
  return rows.map((row) => row.map((el) => el.x).sort((a, b) => a - b));
}

function checkColumnAlignment(columnPositions: number[][]): {
  isAligned: boolean;
  alignedPositions: number[];
  tolerance: number;
} {
  if (columnPositions.length < 2) {
    return { isAligned: false, alignedPositions: [], tolerance: 0 };
  }

  // 合并所有 X 位置并聚类
  const allPositions = columnPositions.flat();
  const clusters = clusterValues(allPositions, tolerance);

  // 检查每行是否在聚类位置有元素
  const alignedPositions = clusters.map((c) => c.center);

  // 验证跨行对齐
  let alignedRows = 0;
  for (const row of columnPositions) {
    const rowAligned = row.every((x) =>
      alignedPositions.some((ap) => Math.abs(x - ap) <= tolerance),
    );
    if (rowAligned) alignedRows++;
  }

  return {
    isAligned: alignedRows / columnPositions.length >= 0.8,
    alignedPositions,
    tolerance,
  };
}
```

#### 步骤 3：Grid 置信度评分（新增）

```typescript
function calculateGridConfidence(
  rows: ElementRect[][],
  columnAlignment: ColumnAlignmentResult,
  rowGapAnalysis: GapAnalysis,
  columnGapAnalysis: GapAnalysis,
): number {
  let score = 0;

  // 1. 多行（grid 必需）
  if (rows.length >= 2) score += 0.2;
  if (rows.length >= 3) score += 0.1;

  // 2. 一致的列数
  const columnCounts = rows.map((r) => r.length);
  if (areValuesEqual(columnCounts)) score += 0.2;

  // 3. 跨行列对齐
  if (columnAlignment.isAligned) score += 0.25;

  // 4. 一致的行间距
  if (rowGapAnalysis.isConsistent) score += 0.1;

  // 5. 一致的列间距
  if (columnGapAnalysis.isConsistent) score += 0.1;

  // 6. 二维规则性（元素形成规则矩阵）
  const expectedCells = rows.length * Math.max(...columnCounts);
  const actualCells = rows.reduce((sum, r) => sum + r.length, 0);
  const fillRatio = actualCells / expectedCells;
  if (fillRatio >= 0.75) score += 0.05;

  return Math.min(1, score);
}
```

#### 步骤 4：轨道尺寸提取（新增）

```typescript
function calculateTrackWidths(
  rows: ElementRect[][],
  alignedPositions: number[],
): (number | "auto" | "fr")[] {
  // 按列位置分组元素
  const columns: ElementRect[][] = [];
  for (let i = 0; i < alignedPositions.length; i++) {
    columns[i] = [];
  }

  for (const row of rows) {
    for (const el of row) {
      const colIndex = alignedPositions.findIndex((pos) => Math.abs(el.x - pos) <= tolerance);
      if (colIndex >= 0) {
        columns[colIndex].push(el);
      }
    }
  }

  // 计算每列的宽度
  return columns.map((col) => {
    const widths = col.map((el) => el.width);
    const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
    return roundToCommonValue(avgWidth);
  });
}

function calculateTrackHeights(rows: ElementRect[][]): number[] {
  return rows.map((row) => {
    const heights = row.map((el) => el.height);
    const maxHeight = Math.max(...heights);
    return roundToCommonValue(maxHeight);
  });
}
```

#### 步骤 5：CSS Grid 生成（新增）

```typescript
function generateGridCSS(analysis: GridAnalysisResult): CSSStyle {
  const css: CSSStyle = {
    display: "grid",
  };

  // grid-template-columns
  const columns = analysis.trackWidths.map((w) => (typeof w === "number" ? `${w}px` : w)).join(" ");
  css["gridTemplateColumns"] = columns;

  // grid-template-rows（可选，通常为 auto）
  const rows = analysis.trackHeights
    .map((h) => (typeof h === "number" ? `${h}px` : "auto"))
    .join(" ");
  if (!rows.split(" ").every((r) => r === "auto")) {
    css["gridTemplateRows"] = rows;
  }

  // Gap
  if (analysis.rowGap > 0 || analysis.columnGap > 0) {
    if (analysis.rowGap === analysis.columnGap) {
      css.gap = `${analysis.rowGap}px`;
    } else {
      css.gap = `${analysis.rowGap}px ${analysis.columnGap}px`;
    }
  }

  return css;
}
```

### 决策树：Grid vs Flex vs Absolute

```
                    开始
                      │
                      ▼
              ┌─────────────────┐
              │ 元素 ≥ 2?       │──否──▶ position: absolute
              └────────┬────────┘
                       │是
                       ▼
              ┌─────────────────┐
              │ 存在重叠元素?   │──是──▶ position: absolute（重叠部分）
              └────────┬────────┘
                       │否
                       ▼
              ┌─────────────────┐
              │ 检测到多行?     │──否──▶ display: flex (row)
              └────────┬────────┘
                       │是
                       ▼
              ┌─────────────────┐
              │ 列跨行对齐?     │──否──▶ display: flex (column)
              │                 │        嵌套 flex rows
              └────────┬────────┘
                       │是
                       ▼
              ┌─────────────────┐
              │ Grid 置信度     │──否──▶ display: flex (column)
              │ ≥ 0.6?          │
              └────────┬────────┘
                       │是
                       ▼
                  display: grid
```

## 需要支持的额外 CSS 属性

### Grid 特有属性

| 属性                             | 优先级 | 描述                   |
| -------------------------------- | ------ | ---------------------- |
| `display: grid`                  | P0     | 启用网格布局           |
| `grid-template-columns`          | P0     | 定义列轨道             |
| `grid-template-rows`             | P1     | 定义行轨道             |
| `gap` / `row-gap` / `column-gap` | P0     | 轨道之间的间距         |
| `grid-auto-flow`                 | P2     | 自动放置算法           |
| `justify-items`                  | P1     | 在单元格中水平对齐项目 |
| `align-items`                    | P1     | 在单元格中垂直对齐项目 |
| `place-items`                    | P2     | align + justify 的简写 |

### 子元素属性

| 属性           | 优先级 | 描述         |
| -------------- | ------ | ------------ |
| `grid-column`  | P1     | 列跨度/位置  |
| `grid-row`     | P1     | 行跨度/位置  |
| `grid-area`    | P2     | 命名网格区域 |
| `justify-self` | P2     | 自身水平对齐 |
| `align-self`   | P2     | 自身垂直对齐 |

### 增强的 Flex 属性（缺失）

| 属性          | 优先级 | 描述                      |
| ------------- | ------ | ------------------------- |
| `flex-grow`   | P1     | 元素增长因子              |
| `flex-shrink` | P2     | 元素收缩因子              |
| `flex-basis`  | P2     | 增长/收缩前的初始大小     |
| `flex`        | P1     | 简写（grow shrink basis） |
| `order`       | P2     | 元素排序                  |

## 实现计划

### 阶段 1：修复现有 TODO (layout.ts)

将 `convertAlign` 拆分为两个函数：

- `convertJustifyContent()` - 用于主轴对齐
- `convertAlignItems()` - 用于交叉轴对齐

### 阶段 2：添加 Grid 检测 (detector.ts)

1. 添加 `GridAnalysisResult` 接口
2. 实现 `detectGridLayout()` 函数
3. 添加列对齐检测
4. 实现网格置信度评分
5. 添加轨道尺寸提取

### 阶段 3：CSS 生成 (optimizer.ts)

1. 更新 `LayoutInfo` 使用以包含网格类型
2. 添加 `generateGridCSS()` 函数
3. 集成到 `optimizeDesign()` 管道
4. 添加 grid vs flex 决策树

### 阶段 4：类型更新 (simplified.ts)

1. 向 `CSSStyle` 添加 Grid CSS 属性
2. 扩展 `LayoutInfo` 以包含 grid 特定数据

### 阶段 5：测试

1. 为 grid 检测添加单元测试
2. 使用真实 Figma 数据添加集成测试
3. 测试边缘情况（不规则网格、混合布局）

## 当前实现问题（2024-12 分析）

### 问题：混合布局误判

使用真实 Figma 数据测试发现，Grid 检测算法错误地将混合布局识别为网格。

**示例案例：关键词管理面板 (node-402-34955)**

```
容器：1580px × 340px
子元素：
  1. 标签页 (320×41)      left: 630px   top: 0px    ← 居中的标签页
  2. 分隔线 (1580×1)      left: 0px     top: 41px   ← 全宽线条
  3. 信息栏 (1528×88)     left: 26px    top: 62px   ← 几乎全宽
  4. 卡片 1 (500×78)      left: 26px    top: 170px  ┐
  5. 卡片 2 (500×78)      left: 540px   top: 170px  ├─ 实际的网格候选元素
  6. 卡片 3 (500×78)      left: 1054px  top: 170px  ┘
  7. 卡片 4 (500×78)      left: 26px    top: 262px  ← 第二行
```

**检测结果（错误）：**

```css
display: grid;
grid-template-columns: 1580px 1528px 500px 320px 500px; /* ❌ 总和 = 4428px > 1580px */
```

**期望结果：**

- 整体容器：`flex-direction: column` 或 `position: absolute`
- 仅卡片部分（项目 4-7）：`display: grid; grid-template-columns: repeat(3, 500px);`

### 根本原因分析

| 问题                    | 代码位置              | 描述                                      |
| ----------------------- | --------------------- | ----------------------------------------- |
| **缺少元素类型过滤**    | `detector.ts:1073`    | 所有子元素被统一分析，不考虑大小/类型差异 |
| **仅通过 Y 轴重叠分组** | `detector.ts:154-185` | 2px 容差忽略了视觉/功能上的差异           |
| **缺少同质性检查**      | N/A                   | 缺少验证元素是否"看起来相似"的逻辑        |
| **严格的列对齐要求**    | `detector.ts:908-911` | 80% 阈值在有意混合的布局中失效            |

### 研究：业界方法

#### 1. UI 语义分组检测（2024）

> 来源：[arxiv.org/html/2403.04984v1](https://arxiv.org/html/2403.04984v1)

- **核心洞察**："在布局检测之前，将具有相似语义的相邻元素分组"
- **方法**：基于 Transformer 的检测器，使用格式塔原则
- **相关性**：对同质元素进行预聚类

#### 2. UIHASH - 基于网格的 UI 相似性

> 来源：[jun-zeng.github.io](https://jun-zeng.github.io/file/uihash_paper.pdf)

- **核心洞察**："邻近原则 - 用户将相邻元素视为统一实体"
- **方法**：将屏幕划分为区域，按组成控件编码
- **相关性**：网格分析前基于大小的聚类

#### 3. GUI 布局推断算法

> 来源：[ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0950584915001718)

- **核心洞察**："两阶段：相对定位 → 模式匹配"
- **方法**：Allen 关系 + 探索式算法用于布局组合
- **相关性**：层次化布局检测

#### 4. 多级同质性结构

> 来源：[ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0957417417303469)

- **核心洞察**："自底向上聚合为同质区域"
- **方法**：连通组件 → 单词 → 文本行 → 区域
- **相关性**：渐进式同质分组

## 优化方案

### 解决方案：同质元素预过滤

在 Grid 检测之前添加预过滤步骤，识别"看起来相似"且应该一起考虑的元素。

#### 同质性判断标准

```typescript
interface HomogeneityCheck {
  sizeVariance: number; // 宽度/高度方差（阈值：20%）
  typeConsistency: boolean; // 相同的节点类型
  stylesSimilar: boolean; // 相似的 CSS 属性
}

function isHomogeneousGroup(nodes: SimplifiedNode[]): boolean {
  if (nodes.length < 4) return false;

  // 1. 大小聚类 - 宽度/高度在 20% 方差范围内
  const widths = nodes.map((n) => parseFloat(n.cssStyles?.width || "0"));
  const heights = nodes.map((n) => parseFloat(n.cssStyles?.height || "0"));

  const widthCV = coefficientOfVariation(widths);
  const heightCV = coefficientOfVariation(heights);

  if (widthCV > 0.2 || heightCV > 0.2) return false;

  // 2. 类型一致性 - 允许 FRAME + INSTANCE + COMPONENT
  const types = new Set(nodes.map((n) => n.type));
  const allowedTypes = new Set(["FRAME", "INSTANCE", "COMPONENT", "GROUP"]);
  const hasDisallowedType = [...types].some((t) => !allowedTypes.has(t));
  if (hasDisallowedType || types.size > 3) return false;

  // 3. 样式相似性（可选）- 背景、边框等
  // ...

  return true;
}
```

#### 更新的检测流程

```
之前：
  detectGridLayout(allChildren) → 错误的网格

之后：
  1. clusterBySimilarSize(allChildren) → 大小分组
  2. 对每个包含 4+ 元素的分组：
     a. isHomogeneousGroup(group) → true/false
     b. 如果为 true：detectGridLayout(group)
  3. 剩余元素：使用 flex/absolute
```

#### 实现步骤

1. **添加 `isHomogeneousGroup()` 函数** - `detector.ts`
2. **添加 `clusterBySimilarSize()` 函数** - `detector.ts`
3. **更新 `LayoutOptimizer.optimizeContainer()`** - `optimizer.ts`
   - 在网格检测前调用同质性检查
   - 只将同质元素传递给 `detectGridLayout()`
4. **添加测试** - `layout.test.ts`

### 预期结果

| 场景                      | 之前             | 之后              |
| ------------------------- | ---------------- | ----------------- |
| 混合布局（标签页 + 卡片） | 所有元素错误网格 | 仅卡片部分 → 网格 |
| 纯卡片网格（4+ 相同大小） | 正确的网格       | 正确的网格        |
| 单行项目                  | Flex 行          | Flex 行（无变化） |
| 不规则大小                | 错误的网格       | Flex/absolute     |

## 参考资料

- [Allen's Interval Algebra - Wikipedia](https://en.wikipedia.org/wiki/Allen's_interval_algebra)
- [FigmaToCode - GitHub](https://github.com/bernaferrari/FigmaToCode)
- [GRIDS Layout Engine - GitHub](https://github.com/aalto-ui/GRIDS)
- [CSS Grid Layout Module Level 1 - W3C](https://www.w3.org/TR/css-grid-1/)
- [Figma Grid Auto-Layout Help](https://help.figma.com/hc/en-us/articles/31289469907863-Use-the-grid-auto-layout-flow)
- [Screen Parsing - CMU ML Blog](https://blog.ml.cmu.edu/2021/12/10/understanding-user-interfaces-with-screen-parsing/)

---

## 完整实现链路分析

本节深入分析 Grid 布局检测算法的代码实现，包括完整的调用链路和核心函数。

### 系统架构：Grid vs Flex 决策

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Layout Detection Decision Tree                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                    ┌─────────────────────────┐                          │
│                    │  optimizeContainer()    │                          │
│                    │  [optimizer.ts:89]      │                          │
│                    └───────────┬─────────────┘                          │
│                                │                                         │
│            ┌───────────────────┼───────────────────┐                    │
│            ▼                   ▼                   ▼                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │ STEP 1: 重叠检测 │  │ STEP 1.5: 背景 │  │ STEP 2: Grid   │         │
│  │ IoU > 0.1 ?     │  │ 检测           │  │ 检测 (优先)     │         │
│  └────────┬────────┘  └────────────────┘  └────────┬────────┘         │
│           │                                         │                   │
│           │                    ┌────────────────────┤                   │
│           │                    │                    │                   │
│           │            Grid 检测成功?          Grid 检测失败            │
│           │            confidence >= 0.6            │                   │
│           │                    │                    │                   │
│           │                    ▼                    ▼                   │
│           │           ┌─────────────────┐  ┌─────────────────┐         │
│           │           │  display: grid  │  │ STEP 3: Flex   │         │
│           │           │  grid-template- │  │ 检测 (后备)     │         │
│           │           │  columns/rows   │  │                 │         │
│           │           └─────────────────┘  └────────┬────────┘         │
│           │                    │                    │                   │
│           │                    │            Flex 检测成功?              │
│           │                    │            score > 0.4                 │
│           │                    │                    │                   │
│           │                    ▼                    ▼                   │
│           │           ┌─────────────────┐  ┌─────────────────┐         │
│  重叠元素保持         │  生成 Grid CSS   │  │  display: flex  │         │
│  position: absolute  │  + padding      │  │  + gap + align  │         │
│           │           └─────────────────┘  └─────────────────┘         │
│           │                                                             │
└───────────┴─────────────────────────────────────────────────────────────┘
```

### Grid 检测入口：detectGridIfApplicable

```
detectGridIfApplicable(nodes) - [optimizer.ts:918-961]
═══════════════════════════════════════════════════════════════════════════

                    ┌─────────────────────────────────┐
                    │  detectGridIfApplicable(nodes)  │
                    │  [optimizer.ts:918]             │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │  前置检查                        │
                    │  • nodes.length < 4 → return null│
                    │  • 最少需要 2×2 网格              │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │  nodesToElementRects(nodes)     │
                    │  转换为 ElementRect[]           │
                    │  [optimizer.ts:856-870]         │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────────────────────┐
                    │  filterHomogeneousForGrid(elementRects, nodeTypes)  │
                    │  [detector.ts:1216-1235]                            │
                    │                                                      │
                    │  ★ 关键步骤: 同质性过滤                               │
                    │  • 筛选大小相似的元素                                  │
                    │  • 防止混合布局被错误识别为 Grid                        │
                    └───────────────────────────┬─────────────────────────┘
                                                │
                              ┌─────────────────┴─────────────────┐
                              │                                   │
                    homogeneousElements.length < 4        homogeneousElements >= 4
                              │                                   │
                              ▼                                   ▼
                        return null                  ┌─────────────────────────┐
                                                     │  detectGridLayout()     │
                                                     │  [detector.ts:1490]     │
                                                     │  在同质元素上运行 Grid 检测│
                                                     └───────────────┬─────────┘
                                                                     │
                              ┌───────────────────────────────────────┤
                              │                                       │
                    isGrid && confidence >= 0.6 ?              confidence < 0.6
                    rowCount >= 2 && columnCount >= 2                 │
                              │                                       │
                              ▼                                       ▼
                    ┌─────────────────────────┐              return null
                    │  return {               │
                    │    gridResult,          │
                    │    gridIndices          │
                    │  }                      │
                    └─────────────────────────┘
```

### 同质性分析：analyzeHomogeneity

```
analyzeHomogeneity(rects, nodeTypes) - [detector.ts:1127-1196]
═══════════════════════════════════════════════════════════════════════════

目的: 确保只有"相似"的元素参与 Grid 检测，避免混合布局误判

混合布局示例 (应该被过滤):
┌──────────────────────────────────────────────────────────────────────────┐
│ 容器 1580px × 340px                                                      │
│                                                                          │
│        ┌─────────────────────┐   ← 标签页 320×41 (异质)                  │
│        │      Tabs           │                                           │
│        └─────────────────────┘                                           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   ← 分隔线 1580×1 (异质)                 │
│ ┌──────────────────────────────────────────────────────────────────────┐│
│ │                    Info Bar 1528×88                                  ││
│ └──────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   ← 同质元素 (Grid)  │
│  │  Card 500×78│  │  Card 500×78│  │  Card 500×78│                      │
│  └─────────────┘  └─────────────┘  └─────────────┘                      │
│  ┌─────────────┐                                                         │
│  │  Card 500×78│                                                         │
│  └─────────────┘                                                         │
└──────────────────────────────────────────────────────────────────────────┘

算法流程:
┌────────────────────────────────────────────────────────────────┐
│  1. 大小聚类 (clusterBySimilarSize)                             │
│                                                                 │
│     输入: 所有子元素的 ElementRect[]                            │
│     容差: 20% (widthDiff <= 0.2 && heightDiff <= 0.2)          │
│                                                                 │
│     处理:                                                       │
│     for each rect:                                              │
│       找到大小相近的已有 cluster                                 │
│       如果找到 → 加入该 cluster                                  │
│       如果未找到 → 创建新 cluster                                │
│                                                                 │
│     输出: SizeCluster[] (按元素数量降序排列)                     │
│                                                                 │
│  示例:                                                          │
│     Cluster 1: [Card1, Card2, Card3, Card4] ← 500×78           │
│     Cluster 2: [InfoBar]                    ← 1528×88          │
│     Cluster 3: [Tabs]                       ← 320×41           │
│     Cluster 4: [Divider]                    ← 1580×1           │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  2. 取最大 Cluster (largestCluster)                             │
│                                                                 │
│     如果 largestCluster.length < 4 → 非同质                      │
│                                                                 │
│  示例: [Card1, Card2, Card3, Card4] = 4 个元素 ✓                │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  3. 计算变异系数 (Coefficient of Variation)                      │
│                                                                 │
│     widthCV  = stddev(widths) / mean(widths)                   │
│     heightCV = stddev(heights) / mean(heights)                 │
│                                                                 │
│     如果 widthCV > 0.2 || heightCV > 0.2 → 非同质               │
│                                                                 │
│  示例:                                                          │
│     widths = [500, 500, 500, 500] → CV = 0 ✓                   │
│     heights = [78, 78, 78, 78]   → CV = 0 ✓                    │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  4. 类型一致性检查 (可选)                                        │
│                                                                 │
│     允许的类型: FRAME, INSTANCE, COMPONENT, GROUP, RECTANGLE   │
│     如果存在其他类型 → 非同质                                    │
│                                                                 │
│  示例: 所有 Card 都是 FRAME → 通过 ✓                            │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  输出: HomogeneityResult                                        │
│  {                                                              │
│    isHomogeneous: true,                                         │
│    widthCV: 0,                                                  │
│    heightCV: 0,                                                 │
│    types: ['FRAME'],                                            │
│    homogeneousElements: [Card1, Card2, Card3, Card4],          │
│    outlierElements: [Tabs, Divider, InfoBar]                   │
│  }                                                              │
└────────────────────────────────────────────────────────────────┘
```

### Grid 检测核心：detectGridLayout

```
detectGridLayout(rects) - [detector.ts:1490-1573]
═══════════════════════════════════════════════════════════════════════════

                    ┌─────────────────────────────────┐
                    │  detectGridLayout(rects)        │
                    │  输入: 已过滤的同质元素          │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  STEP 1: 行分组 (groupIntoRows)                                 │
│  [detector.ts:1513]                                             │
│                                                                 │
│  使用 Y 轴重叠检测将元素分组为"行"                                │
│                                                                 │
│  输入 (4 个卡片):                                                │
│      ┌────┐   ┌────┐   ┌────┐                                  │
│      │ 1  │   │ 2  │   │ 3  │   y: 170, height: 78             │
│      └────┘   └────┘   └────┘                                  │
│      ┌────┐                                                     │
│      │ 4  │                     y: 262, height: 78             │
│      └────┘                                                     │
│                                                                 │
│  输出: rows = [[1, 2, 3], [4]]                                  │
│        rowCount = 2                                             │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  STEP 2: 列对齐检测 (checkColumnAlignment)                       │
│  [detector.ts:1305-1339]                                        │
│                                                                 │
│  检查各行元素的 X 位置是否对齐                                    │
│                                                                 │
│  1. 提取所有 X 位置:                                             │
│     Row 1: [26, 540, 1054]                                      │
│     Row 2: [26]                                                 │
│                                                                 │
│  2. 聚类所有 X 位置 (tolerance=3px):                             │
│     Cluster 1: center=26                                        │
│     Cluster 2: center=540                                       │
│     Cluster 3: center=1054                                      │
│                                                                 │
│  3. 验证各行元素是否在聚类位置:                                   │
│     Row 1: [26 ≈ 26 ✓, 540 ≈ 540 ✓, 1054 ≈ 1054 ✓]             │
│     Row 2: [26 ≈ 26 ✓]                                          │
│                                                                 │
│  输出: { isAligned: true, alignedPositions: [26, 540, 1054] }   │
│        columnCount = 3                                          │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  STEP 3: 间距分析                                                │
│  [detector.ts:1524-1529]                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  行间距 (Row Gap):                                       │    │
│  │                                                          │    │
│  │  Row 1 bottom = max(170+78) = 248                       │    │
│  │  Row 2 top    = min(262) = 262                          │    │
│  │  rowGap = 262 - 248 = 14px                              │    │
│  │                                                          │    │
│  │  analyzeGaps([14]) → { isConsistent: true, rounded: 16 }│    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  列间距 (Column Gap):                                    │    │
│  │                                                          │    │
│  │  Row 1: gap1 = 540 - (26+500) = 14px                    │    │
│  │         gap2 = 1054 - (540+500) = 14px                  │    │
│  │                                                          │    │
│  │  analyzeGaps([14,14]) → { isConsistent: true, rounded: 16 }│ │
│  └─────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  STEP 4: Grid 置信度计算 (calculateGridConfidence)              │
│  [detector.ts:1446-1479]                                        │
│                                                                 │
│  6 项评分因子:                                                   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ 因子                        │ 条件                 │ 得分  ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ 1. 多行 (rows >= 2)         │ 2 行               │ +0.2  ││
│  │ 2. 多行 (rows >= 3)         │ 2 行 < 3           │ +0.0  ││
│  │ 3. 列数一致                  │ [3, 1] 不一致       │ +0.0  ││
│  │ 4. 列对齐                    │ isAligned = true   │ +0.25 ││
│  │ 5. 行间距一致                │ isConsistent = true│ +0.1  ││
│  │ 6. 列间距一致                │ isConsistent = true│ +0.1  ││
│  │ 7. 填充率 >= 75%            │ 4/6 = 67% < 75%    │ +0.0  ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│  总分: 0.2 + 0.25 + 0.1 + 0.1 = 0.65                           │
│  阈值: 0.6                                                      │
│  结果: 0.65 >= 0.6 → isGrid = true ✓                           │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  STEP 5-6: 轨道尺寸计算                                          │
│  [detector.ts:1552-1557]                                        │
│                                                                 │
│  trackWidths  = calculateTrackWidths(rows, alignedPositions)   │
│              = [500, 500, 500]                                 │
│                                                                 │
│  trackHeights = calculateTrackHeights(rows)                    │
│              = [78, 78]                                        │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  STEP 7: 单元格映射 (buildCellMap)                               │
│  [detector.ts:1556]                                             │
│                                                                 │
│  cellMap:                                                       │
│  ┌─────────────────────────────────────┐                       │
│  │ Col 0     │ Col 1     │ Col 2       │                       │
│  ├───────────┼───────────┼─────────────┤                       │
│  │ Card 0    │ Card 1    │ Card 2      │  Row 0               │
│  │ Card 3    │ null      │ null        │  Row 1               │
│  └───────────┴───────────┴─────────────┘                       │
└────────────────────────────────────────────────────────────────┘
```

### CSS Grid 生成

```
generateGridCSS(gridResult) - [optimizer.ts:875-913]
═══════════════════════════════════════════════════════════════════════════

输入: GridAnalysisResult
输出: CSS Grid 样式对象

                    ┌─────────────────────────────────┐
                    │  GridAnalysisResult             │
                    │  {                              │
                    │    isGrid: true,                │
                    │    rowCount: 2,                 │
                    │    columnCount: 3,              │
                    │    rowGap: 16,                  │
                    │    columnGap: 16,               │
                    │    trackWidths: [500, 500, 500],│
                    │    trackHeights: [78, 78]       │
                    │  }                              │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  生成 grid-template-columns                                     │
│                                                                 │
│  trackWidths = [500, 500, 500]                                 │
│  → "500px 500px 500px"                                         │
│                                                                 │
│  (如果所有宽度相同，可优化为 repeat(3, 500px))                    │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  生成 grid-template-rows (仅当行高不同时)                        │
│                                                                 │
│  trackHeights = [78, 78]                                       │
│  所有行高相同 → 不设置 (使用 auto)                               │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  生成 gap                                                       │
│                                                                 │
│  rowGap = 16, columnGap = 16                                   │
│  rowGap === columnGap → gap: "16px"                            │
│                                                                 │
│  如果不同 → gap: "${rowGap}px ${columnGap}px"                   │
└────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────┐
│  输出 CSS:                                                      │
│  {                                                              │
│    display: "grid",                                             │
│    gridTemplateColumns: "500px 500px 500px",                   │
│    gap: "16px"                                                  │
│  }                                                              │
└────────────────────────────────────────────────────────────────┘
```

### 核心数据结构

```typescript
// detector.ts 中的 Grid 相关数据结构
═══════════════════════════════════════════════════════════════════════════

// Grid 分析结果
interface GridAnalysisResult {
  isGrid: boolean;              // 是否检测到有效 Grid
  confidence: number;           // 置信度 (0-1)
  rowCount: number;             // 行数
  columnCount: number;          // 列数
  rowGap: number;               // 行间距 (px)
  columnGap: number;            // 列间距 (px)
  isRowGapConsistent: boolean;  // 行间距是否一致
  isColumnGapConsistent: boolean; // 列间距是否一致
  trackWidths: number[];        // 各列宽度 [col0Width, col1Width, ...]
  trackHeights: number[];       // 各行高度 [row0Height, row1Height, ...]
  alignedColumnPositions: number[]; // 对齐的列 X 坐标
  rows: ElementRect[][];        // 分组后的行数据
  cellMap: (number | null)[][]; // 单元格到元素索引的映射
}

// 同质性分析结果
interface HomogeneityResult {
  isHomogeneous: boolean;       // 是否同质
  widthCV: number;              // 宽度变异系数
  heightCV: number;             // 高度变异系数
  types: string[];              // 元素类型列表
  homogeneousElements: ElementRect[]; // 同质元素
  outlierElements: ElementRect[];     // 异质元素 (不参与 Grid)
}

// 大小聚类
interface SizeCluster {
  width: number;                // 聚类代表宽度
  height: number;               // 聚类代表高度
  elements: ElementRect[];      // 属于该聚类的元素
  types?: string[];             // 元素类型
}
```

### 文件路径映射

| 功能模块      | 文件路径                             | 行号范围  |
| ------------- | ------------------------------------ | --------- |
| Grid 入口     | `src/algorithms/layout/optimizer.ts` | 918-961   |
| Grid CSS 生成 | `src/algorithms/layout/optimizer.ts` | 875-913   |
| 同质性过滤    | `src/algorithms/layout/detector.ts`  | 1216-1235 |
| 同质性分析    | `src/algorithms/layout/detector.ts`  | 1127-1196 |
| 大小聚类      | `src/algorithms/layout/detector.ts`  | 1077-1116 |
| 变异系数计算  | `src/algorithms/layout/detector.ts`  | 1057-1067 |
| Grid 检测核心 | `src/algorithms/layout/detector.ts`  | 1490-1573 |
| 列对齐检测    | `src/algorithms/layout/detector.ts`  | 1305-1339 |
| 行间距计算    | `src/algorithms/layout/detector.ts`  | 1344-1356 |
| 列间距计算    | `src/algorithms/layout/detector.ts`  | 1361-1376 |
| 置信度计算    | `src/algorithms/layout/detector.ts`  | 1446-1479 |
| 轨道宽度计算  | `src/algorithms/layout/detector.ts`  | 1381-1404 |
| 轨道高度计算  | `src/algorithms/layout/detector.ts`  | 1409-1415 |
| 单元格映射    | `src/algorithms/layout/detector.ts`  | 1420-1441 |

---

_最后更新: 2025-12-06_
