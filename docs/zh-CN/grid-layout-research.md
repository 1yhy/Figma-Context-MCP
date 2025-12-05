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

## 参考资料

- [Allen's Interval Algebra - Wikipedia](https://en.wikipedia.org/wiki/Allen's_interval_algebra)
- [FigmaToCode - GitHub](https://github.com/bernaferrari/FigmaToCode)
- [GRIDS Layout Engine - GitHub](https://github.com/aalto-ui/GRIDS)
- [CSS Grid Layout Module Level 1 - W3C](https://www.w3.org/TR/css-grid-1/)
- [Figma Grid Auto-Layout Help](https://help.figma.com/hc/en-us/articles/31289469907863-Use-the-grid-auto-layout-flow)
- [Screen Parsing - CMU ML Blog](https://blog.ml.cmu.edu/2021/12/10/understanding-user-interfaces-with-screen-parsing/)
