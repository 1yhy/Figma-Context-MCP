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

## References

- [Allen's Interval Algebra - Wikipedia](https://en.wikipedia.org/wiki/Allen's_interval_algebra)
- [FigmaToCode - GitHub](https://github.com/bernaferrari/FigmaToCode)
- [GRIDS Layout Engine - GitHub](https://github.com/aalto-ui/GRIDS)
- [CSS Grid Layout Module Level 1 - W3C](https://www.w3.org/TR/css-grid-1/)
- [Figma Grid Auto-Layout Help](https://help.figma.com/hc/en-us/articles/31289469907863-Use-the-grid-auto-layout-flow)
- [Screen Parsing - CMU ML Blog](https://blog.ml.cmu.edu/2021/12/10/understanding-user-interfaces-with-screen-parsing/)
