# Grid Layout Detection Algorithm Research

## Research Summary

This document synthesizes research findings from multiple sources to design a Grid layout detection algorithm for converting Figma designs to CSS Grid.

## Sources Analyzed

### 1. Academic Research

**"A Layout Inference Algorithm for GUIs" (ScienceDirect)**

- Uses **Allen's Interval Algebra** for spatial relationship modeling
- Two-phase algorithm:
  1. Convert absolute coordinates to relative positioning using directed graphs
  2. Apply pattern matching and graph rewriting for layout inference
- Achieves 97% accuracy in maintaining original layout faithfulness
- 84% of views maintain proportions when resized

**Allen's 13 Interval Relations** (applicable to 1D spatial analysis):

- `before/after`: Element A completely before/after B
- `meets/met-by`: Element A ends exactly where B starts
- `overlaps/overlapped-by`: Element A partially overlaps B
- `starts/started-by`: Element A starts at same position as B
- `finishes/finished-by`: Element A ends at same position as B
- `during/contains`: Element A completely inside/outside B
- `equals`: Element A same position as B

### 2. Open Source Implementations

**FigmaToCode (bernaferrari/FigmaToCode)**

- Uses intermediate "AltNodes" representation
- Analyzes auto-layouts, responsive constraints, color variables
- Handles mixed positioning (absolute + auto-layout)
- Makes intelligent decisions about code structure

**imgcook (Alibaba)**

- Layout restoration is "core of entire D2C process"
- Uses flat JSON with absolute position, size, style
- Expert rule system + machine learning hybrid
- Components: Page splitting, Grouping, Loop detection, Multi-status handling
- Rule system preferred for controllable, near 100% availability

**GRIDS (Aalto University)**

- MILP (Mixed Integer Linear Programming) based approach
- Mathematical optimization for grid generation
- Python implementation with Gurobi optimizer

### 3. Industry Implementations

**Figma's Native Grid Auto-Layout (May 2025)**

- New Grid flow option alongside horizontal/vertical
- Supports span, row/column count
- Limited compared to full CSS Grid specification
- Missing: `fr` units, named grid areas, subgrid

**Screen Parsing (CMU - UIST 2021)**

- ML-based UI structure inference
- Detects 7 container types including grids
- Trained on 130K iOS + 80K Android screens

## Current Implementation Analysis

### Existing Flex Layout Detection

The current codebase has robust Flex detection in `src/algorithms/layout/detector.ts`:

```
Flow: Elements → Bounding Boxes → Row/Column Grouping → Gap Analysis → Alignment Detection → CSS Generation
```

**Key Algorithms:**

1. **Y-axis overlap** → Row grouping (elements in same row)
2. **X-axis overlap** → Column grouping (elements in same column)
3. **Gap analysis** → Consistent spacing detection (20% std dev tolerance)
4. **Alignment detection** → left/center/right/stretch
5. **Layout scoring** → Confidence-based direction selection

### Gap in Current Implementation

The `LayoutInfo` interface already defines `type: "flex" | "absolute" | "grid"` but Grid detection is **NOT IMPLEMENTED**.

## Grid Layout Detection Algorithm Design

### Core Concept: When to Use Grid vs Flex

| Criterion       | Flexbox                     | CSS Grid                           |
| --------------- | --------------------------- | ---------------------------------- |
| Dimension       | 1D (row OR column)          | 2D (rows AND columns)              |
| Rows consistent | Single row spans full width | Multiple rows with aligned columns |
| Column count    | Variable per row            | Consistent across rows             |
| Cell alignment  | Only within row             | Both row AND column aligned        |
| Gaps            | Single gap value            | row-gap and column-gap             |

### Algorithm: Grid Detection

```typescript
interface GridAnalysisResult {
  isGrid: boolean;
  confidence: number;
  rows: number;
  columns: number;
  rowGap: number;
  columnGap: number;
  trackWidths: number[]; // For grid-template-columns
  trackHeights: number[]; // For grid-template-rows
  cellMap: (number | null)[][]; // Element indices in grid positions
}

function detectGridLayout(rects: ElementRect[]): GridAnalysisResult {
  // Step 1: Group into rows (Y-axis overlap)
  const rows = groupIntoRows(rects);

  // Step 2: Check if column count is consistent across rows
  const columnCounts = rows.map((row) => row.length);
  const isConsistentColumns = areValuesAligned(columnCounts, 0);

  // Step 3: Check column alignment across rows
  const columnPositions = extractColumnPositions(rows);
  const areColumnsAligned = checkColumnAlignment(columnPositions);

  // Step 4: Calculate confidence
  // Grid confidence higher when:
  // - Multiple rows exist (> 1)
  // - Columns are aligned across rows
  // - Both row and column gaps are consistent

  // Step 5: Extract track sizes
  const trackWidths = calculateTrackWidths(rows, columnPositions);
  const trackHeights = calculateTrackHeights(rows);

  return result;
}
```

### Step-by-Step Algorithm

#### Step 1: Row Detection (existing)

```typescript
// Already implemented: groupIntoRows()
const rows = groupIntoRows(rects, tolerance);
```

#### Step 2: Column Alignment Detection (NEW)

```typescript
function extractColumnPositions(rows: ElementRect[][]): number[][] {
  // For each row, extract the X positions of elements
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

  // Merge all X positions and cluster them
  const allPositions = columnPositions.flat();
  const clusters = clusterValues(allPositions, tolerance);

  // Check if each row has elements at cluster positions
  const alignedPositions = clusters.map((c) => c.center);

  // Verify alignment across rows
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

#### Step 3: Grid Confidence Scoring (NEW)

```typescript
function calculateGridConfidence(
  rows: ElementRect[][],
  columnAlignment: ColumnAlignmentResult,
  rowGapAnalysis: GapAnalysis,
  columnGapAnalysis: GapAnalysis,
): number {
  let score = 0;

  // 1. Multiple rows (required for grid)
  if (rows.length >= 2) score += 0.2;
  if (rows.length >= 3) score += 0.1;

  // 2. Consistent column count
  const columnCounts = rows.map((r) => r.length);
  if (areValuesEqual(columnCounts)) score += 0.2;

  // 3. Column alignment across rows
  if (columnAlignment.isAligned) score += 0.25;

  // 4. Consistent row gap
  if (rowGapAnalysis.isConsistent) score += 0.1;

  // 5. Consistent column gap
  if (columnGapAnalysis.isConsistent) score += 0.1;

  // 6. 2D regularity (elements form a regular matrix)
  const expectedCells = rows.length * Math.max(...columnCounts);
  const actualCells = rows.reduce((sum, r) => sum + r.length, 0);
  const fillRatio = actualCells / expectedCells;
  if (fillRatio >= 0.75) score += 0.05;

  return Math.min(1, score);
}
```

#### Step 4: Track Size Extraction (NEW)

```typescript
function calculateTrackWidths(
  rows: ElementRect[][],
  alignedPositions: number[],
): (number | "auto" | "fr")[] {
  // Group elements by column position
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

  // Calculate width for each column
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

#### Step 5: CSS Grid Generation (NEW)

```typescript
function generateGridCSS(analysis: GridAnalysisResult): CSSStyle {
  const css: CSSStyle = {
    display: "grid",
  };

  // grid-template-columns
  const columns = analysis.trackWidths.map((w) => (typeof w === "number" ? `${w}px` : w)).join(" ");
  css["gridTemplateColumns"] = columns;

  // grid-template-rows (optional, often auto)
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

### Decision Tree: Grid vs Flex vs Absolute

```
                    Start
                      │
                      ▼
              ┌─────────────────┐
              │ Elements ≥ 2?   │──No──▶ position: absolute
              └────────┬────────┘
                       │Yes
                       ▼
              ┌─────────────────┐
              │ Overlapping     │──Yes─▶ position: absolute (for overlaps)
              │ elements?       │
              └────────┬────────┘
                       │No
                       ▼
              ┌─────────────────┐
              │ Multiple rows   │──No──▶ display: flex (row)
              │ detected?       │
              └────────┬────────┘
                       │Yes
                       ▼
              ┌─────────────────┐
              │ Columns aligned │──No──▶ display: flex (column)
              │ across rows?    │        with nested flex rows
              └────────┬────────┘
                       │Yes
                       ▼
              ┌─────────────────┐
              │ Grid confidence │──No──▶ display: flex (column)
              │ ≥ 0.6?          │
              └────────┬────────┘
                       │Yes
                       ▼
                  display: grid
```

## Additional CSS Properties to Support

### Grid-Specific Properties

| Property                         | Priority | Description                       |
| -------------------------------- | -------- | --------------------------------- |
| `display: grid`                  | P0       | Enable grid layout                |
| `grid-template-columns`          | P0       | Define column tracks              |
| `grid-template-rows`             | P1       | Define row tracks                 |
| `gap` / `row-gap` / `column-gap` | P0       | Spacing between tracks            |
| `grid-auto-flow`                 | P2       | Auto-placement algorithm          |
| `justify-items`                  | P1       | Align items in cells horizontally |
| `align-items`                    | P1       | Align items in cells vertically   |
| `place-items`                    | P2       | Shorthand for align + justify     |

### Child Element Properties

| Property       | Priority | Description               |
| -------------- | -------- | ------------------------- |
| `grid-column`  | P1       | Column span/position      |
| `grid-row`     | P1       | Row span/position         |
| `grid-area`    | P2       | Named grid area           |
| `justify-self` | P2       | Self horizontal alignment |
| `align-self`   | P2       | Self vertical alignment   |

### Enhanced Flex Properties (Missing)

| Property      | Priority | Description                     |
| ------------- | -------- | ------------------------------- |
| `flex-grow`   | P1       | Element growth factor           |
| `flex-shrink` | P2       | Element shrink factor           |
| `flex-basis`  | P2       | Initial size before grow/shrink |
| `flex`        | P1       | Shorthand (grow shrink basis)   |
| `order`       | P2       | Element ordering                |

## Implementation Plan

### Phase 1: Fix Existing TODO (layout.ts)

Split `convertAlign` into two functions:

- `convertJustifyContent()` - for main axis alignment
- `convertAlignItems()` - for cross axis alignment

### Phase 2: Add Grid Detection (detector.ts)

1. Add `GridAnalysisResult` interface
2. Implement `detectGridLayout()` function
3. Add column alignment detection
4. Implement grid confidence scoring
5. Add track size extraction

### Phase 3: CSS Generation (optimizer.ts)

1. Update `LayoutInfo` usage to include grid type
2. Add `generateGridCSS()` function
3. Integrate into `optimizeDesign()` pipeline
4. Add decision tree for grid vs flex

### Phase 4: Type Updates (simplified.ts)

1. Add Grid CSS properties to `CSSStyle`
2. Extend `LayoutInfo` for grid-specific data

### Phase 5: Testing

1. Add unit tests for grid detection
2. Add integration tests with real Figma data
3. Test edge cases (irregular grids, mixed layouts)

## Current Implementation Issues (2024-12 Analysis)

### Problem: Mixed Layout False Positives

Testing with real Figma data revealed that the Grid detection algorithm incorrectly identifies mixed layouts as grids.

**Example Case: Keywords Management Panel (node-402-34955)**

```
Container: 1580px × 340px
Children:
  1. Tabs (320×41)        left: 630px   top: 0px    ← centered tabs
  2. Divider (1580×1)     left: 0px     top: 41px   ← full-width line
  3. Info Bar (1528×88)   left: 26px    top: 62px   ← nearly full-width
  4. Card 1 (500×78)      left: 26px    top: 170px  ┐
  5. Card 2 (500×78)      left: 540px   top: 170px  ├─ actual grid candidates
  6. Card 3 (500×78)      left: 1054px  top: 170px  ┘
  7. Card 4 (500×78)      left: 26px    top: 262px  ← second row
```

**Detected Result (WRONG):**

```css
display: grid;
grid-template-columns: 1580px 1528px 500px 320px 500px; /* ❌ Sum = 4428px > 1580px */
```

**Expected Result:**

- Overall container: `flex-direction: column` or `position: absolute`
- Cards only (items 4-7): `display: grid; grid-template-columns: repeat(3, 500px);`

### Root Cause Analysis

| Issue                           | Code Location         | Description                                            |
| ------------------------------- | --------------------- | ------------------------------------------------------ |
| **No element type filtering**   | `detector.ts:1073`    | All children analyzed together regardless of size/type |
| **Y-overlap only row grouping** | `detector.ts:154-185` | 2px tolerance ignores visual/functional differences    |
| **No homogeneity check**        | N/A                   | Missing validation that elements "look similar"        |
| **Strict column alignment**     | `detector.ts:908-911` | 80% threshold fails on intentionally mixed layouts     |

### Research: Industry Approaches

#### 1. UI Semantic Group Detection (2024)

> Source: [arxiv.org/html/2403.04984v1](https://arxiv.org/html/2403.04984v1)

- **Key Insight**: "Group adjacent elements with similar semantics before layout detection"
- **Method**: Transformer-based detector using Gestalt principles
- **Relevance**: Pre-clustering homogeneous elements

#### 2. UIHASH - Grid-Based UI Similarity

> Source: [jun-zeng.github.io](https://jun-zeng.github.io/file/uihash_paper.pdf)

- **Key Insight**: "Proximity principle - users group adjacent elements as unified entity"
- **Method**: Partition screen into regions, encode by constituent controls
- **Relevance**: Size-based clustering before grid analysis

#### 3. GUI Layout Inference Algorithm

> Source: [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0950584915001718)

- **Key Insight**: "Two-phase: relative positioning → pattern matching"
- **Method**: Allen relations + exploratory algorithm for layout composition
- **Relevance**: Hierarchical layout detection

#### 4. Multilevel Homogeneity Structure

> Source: [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0957417417303469)

- **Key Insight**: "Bottom-up aggregation into homogeneous regions"
- **Method**: Connected components → words → text lines → regions
- **Relevance**: Progressive homogeneous grouping

## Optimization Plan

### Solution: Homogeneous Element Pre-filtering

Add a pre-filtering step before Grid detection to identify elements that "look similar" and should be considered together.

#### Homogeneity Criteria

```typescript
interface HomogeneityCheck {
  sizeVariance: number; // Width/height variance (threshold: 20%)
  typeConsistency: boolean; // Same node types
  stylesSimilar: boolean; // Similar CSS properties
}

function isHomogeneousGroup(nodes: SimplifiedNode[]): boolean {
  if (nodes.length < 4) return false;

  // 1. Size clustering - width/height within 20% variance
  const widths = nodes.map((n) => parseFloat(n.cssStyles?.width || "0"));
  const heights = nodes.map((n) => parseFloat(n.cssStyles?.height || "0"));

  const widthCV = coefficientOfVariation(widths);
  const heightCV = coefficientOfVariation(heights);

  if (widthCV > 0.2 || heightCV > 0.2) return false;

  // 2. Type consistency - allow FRAME + INSTANCE + COMPONENT
  const types = new Set(nodes.map((n) => n.type));
  const allowedTypes = new Set(["FRAME", "INSTANCE", "COMPONENT", "GROUP"]);
  const hasDisallowedType = [...types].some((t) => !allowedTypes.has(t));
  if (hasDisallowedType || types.size > 3) return false;

  // 3. Style similarity (optional) - background, border, etc.
  // ...

  return true;
}
```

#### Updated Detection Flow

```
Before:
  detectGridLayout(allChildren) → wrong grid

After:
  1. clusterBySimilarSize(allChildren) → size groups
  2. For each group with 4+ elements:
     a. isHomogeneousGroup(group) → true/false
     b. If true: detectGridLayout(group)
  3. Remaining elements: use flex/absolute
```

#### Implementation Steps

1. **Add `isHomogeneousGroup()` function** - `detector.ts`
2. **Add `clusterBySimilarSize()` function** - `detector.ts`
3. **Update `LayoutOptimizer.optimizeContainer()`** - `optimizer.ts`
   - Call homogeneity check before grid detection
   - Only pass homogeneous elements to `detectGridLayout()`
4. **Add tests** - `layout.test.ts`

### Expected Results

| Scenario                      | Before             | After                |
| ----------------------------- | ------------------ | -------------------- |
| Mixed layout (tabs + cards)   | Wrong grid for all | Cards only → grid    |
| Pure card grid (4+ same size) | Correct grid       | Correct grid         |
| Single row items              | Flex row           | Flex row (no change) |
| Irregular sizes               | Wrong grid         | Flex/absolute        |

## References

- [Allen's Interval Algebra - Wikipedia](https://en.wikipedia.org/wiki/Allen's_interval_algebra)
- [FigmaToCode - GitHub](https://github.com/bernaferrari/FigmaToCode)
- [GRIDS Layout Engine - GitHub](https://github.com/aalto-ui/GRIDS)
- [CSS Grid Layout Module Level 1 - W3C](https://www.w3.org/TR/css-grid-1/)
- [Figma Grid Auto-Layout Help](https://help.figma.com/hc/en-us/articles/31289469907863-Use-the-grid-auto-layout-flow)
- [Screen Parsing - CMU ML Blog](https://blog.ml.cmu.edu/2021/12/10/understanding-user-interfaces-with-screen-parsing/)
