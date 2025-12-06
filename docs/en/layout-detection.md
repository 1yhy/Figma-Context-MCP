# Design-to-Code: Flex Layout Detection Algorithm

## Table of Contents

1. [Background](#1-background)
2. [Industry Solutions Analysis](#2-industry-solutions-analysis)
3. [Core Algorithm Principles](#3-core-algorithm-principles)
4. [Implementation Details](#4-implementation-details)
5. [Testing & Verification](#5-testing--verification)
6. [Best Practices](#6-best-practices)

---

## 1. Background

### 1.1 Problem Statement

Design files (like Figma) typically use **absolute positioning** (x, y, width, height), while frontend code requires **relative layouts** (Flexbox, Grid) for responsive design.

**Core Challenge**: How to accurately infer Flex layout structure from a flat list of absolutely positioned elements?

### 1.2 Key Difficulties

| Challenge            | Description                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| Row/Column Detection | How to determine if elements are arranged horizontally or vertically?      |
| Nested Structure     | How to convert a flat list into a nested DOM tree?                         |
| Gap Calculation      | How to determine if gaps are consistent and should use the `gap` property? |
| Alignment Detection  | How to detect `justify-content` and `align-items`?                         |
| Overlap Handling     | How to handle overlapping elements that need absolute positioning?         |
| Tolerance Handling   | How to handle small offsets in design files?                               |

---

## 2. Industry Solutions Analysis

### 2.1 Major Tools Comparison

| Tool            | Developer    | Layout Detection                 | Open Source |
| --------------- | ------------ | -------------------------------- | ----------- |
| **FigmaToCode** | bernaferrari | Relies on Figma Auto Layout data | ✓           |
| **Grida**       | gridaco      | Rules + ML hybrid                | ✓           |
| **imgcook**     | Alibaba      | Rule system + Machine Learning   | ✗           |
| **Anima**       | Anima        | Constraint inference             | ✗           |

### 2.2 FigmaToCode Analysis

**GitHub**: https://github.com/bernaferrari/FigmaToCode

**Features**:

- No layout inference, directly maps Figma Auto Layout properties
- Uses AltNodes as intermediate representation
- Uses absolute positioning for non-Auto Layout designs

**Limitations**:

- Depends on designers correctly using Auto Layout
- Cannot handle legacy designs or manually positioned layouts

### 2.3 imgcook Layout Algorithm (Alibaba)

**Core Flow**:

```
Flattened JSON → Row/Column Grouping → Layout Inference → Semantics → Code Generation
```

**Key Technologies**:

1. **Page Segmentation**: Split page into different sub-modules
2. **Grouping Algorithm**: Determine element containment relationships
3. **Loop Detection**: Identify lists/repeated elements
4. **Multi-state Recognition**: Identify different states of the same component

---

## 3. Core Algorithm Principles

### 3.1 Y-Axis Overlap Detection (Row Grouping)

**Principle**: If two elements overlap on the Y-axis, they belong to the same row.

```
Element A: y=10, height=30  →  Y range [10, 40]
Element B: y=20, height=30  →  Y range [20, 50]

[10, 40] and [20, 50] intersect → Same row
```

**Implementation**:

```typescript
function isOverlappingY(a: ElementRect, b: ElementRect, tolerance = 0): boolean {
  return !(a.bottom + tolerance < b.y || b.bottom + tolerance < a.y);
}
```

### 3.2 X-Axis Overlap Detection (Column Grouping)

**Principle**: If two elements overlap on the X-axis, they belong to the same column.

```typescript
function isOverlappingX(a: ElementRect, b: ElementRect, tolerance = 0): boolean {
  return !(a.right + tolerance < b.x || b.right + tolerance < a.x);
}
```

### 3.3 Gap Consistency Analysis

**Principle**: Calculate the standard deviation of all gaps to determine consistency.

```typescript
function analyzeGaps(gaps: number[], tolerancePercent = 20) {
  const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((sum, g) => sum + Math.pow(g - average, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);

  return {
    isConsistent: stdDev <= average * (tolerancePercent / 100),
    average,
    rounded: Math.round(average / 4) * 4, // Round to 4px grid
    stdDev,
  };
}
```

### 3.4 Alignment Detection

**Horizontal Alignment**:

- Left aligned: All elements have the same `left` value
- Center aligned: All elements have the same center X coordinate
- Right aligned: All elements have the same `right` value

**Vertical Alignment**:

- Top aligned: All elements have the same `top` value
- Center aligned: All elements have the same center Y coordinate
- Bottom aligned: All elements have the same `bottom` value

---

## 4. Implementation Details

### 4.1 Layout Detection Flow

```
1. Extract bounding boxes from child elements
2. Group elements into rows (Y-axis overlap)
3. If single row → check column grouping (X-axis overlap)
4. Determine layout direction (row vs column)
5. Calculate gaps and check consistency
6. Detect alignment (justify-content, align-items)
7. Handle overlapping elements (mark for absolute positioning)
```

### 4.2 Confidence Scoring

The algorithm calculates a confidence score based on:

- Number of elements that fit the detected pattern
- Gap consistency
- Alignment accuracy

---

## 5. Testing & Verification

### 5.1 Test Results

| Test Case                  | Status | Result                             |
| -------------------------- | ------ | ---------------------------------- |
| Bounding box extraction    | ✓      | Extracted 2 child elements         |
| Row grouping algorithm     | ✓      | Grouped into 1 row                 |
| Column grouping algorithm  | ✓      | Grouped into 1 column              |
| Consistent gap detection   | ✓      | Avg: 16px, StdDev: 0.63            |
| Inconsistent gap detection | ✓      | Avg: 25px, StdDev: 14.14           |
| Left alignment detection   | ✓      | Detected: left                     |
| Center alignment detection | ✓      | Detected: center                   |
| Layout tree building       | ✓      | Type: container, Direction: column |

**Overall: 8/9 tests passed**

---

## 6. Best Practices

### 6.1 Recommended Parameters

| Parameter           | Recommended Value | Description                  |
| ------------------- | ----------------- | ---------------------------- |
| Y-axis tolerance    | 2px               | For row grouping             |
| Gap tolerance       | 20%               | Standard deviation threshold |
| Alignment tolerance | 2px               | For alignment detection      |
| Max recursion depth | 5                 | For nested layouts           |

### 6.2 When to Use Absolute Positioning

- Elements with significant overlap (IoU > 0.1)
- Complex icon compositions
- Decorative elements with specific positioning

---

## 7. Complete Implementation Analysis

This section provides an in-depth analysis of the layout detection algorithm implementation, including the complete call chain and core functions.

### 7.1 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Layout Optimization System                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    optimizer.ts (Orchestration Layer)             │   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │   │
│  │  │  optimizeDesign()  →  optimizeNodeTree()  →  optimizeContainer() │ │
│  │  └─────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                    ┌───────────────┼───────────────┐                    │
│                    ▼               ▼               ▼                    │
│  ┌─────────────────────┐ ┌─────────────────┐ ┌─────────────────────┐   │
│  │  detector.ts        │ │  detector.ts    │ │  optimizer.ts       │   │
│  │  (Overlap Detection)│ │  (Layout Detect)│ │  (Style Generation) │   │
│  │                     │ │                 │ │                     │   │
│  │ detectOverlapping() │ │ analyzeLayout() │ │ generateGridCSS()   │   │
│  │ detectBackground()  │ │ detectGrid()    │ │ convertToRelative() │   │
│  └─────────────────────┘ └─────────────────┘ └─────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Core Entry Function Call Chain

```
src/algorithms/layout/optimizer.ts
═══════════════════════════════════════════════════════════════════════════

                          ┌─────────────────────────┐
                          │  LayoutOptimizer.       │
                          │  optimizeDesign(design) │
                          │  [optimizer.ts:36]      │
                          └───────────┬─────────────┘
                                      │
                    Reset containerIdCounter
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │  design.nodes.map((node) =>    │
                    │    optimizeNodeTree(node)      │
                    │  )                             │
                    │  [optimizer.ts:46]             │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼ (Recursively process each node)
                    ┌─────────────────────────────────┐
                    │  optimizeNodeTree(node)         │
                    │  [optimizer.ts:61]              │
                    │                                 │
                    │  Recursively call itself for    │
                    │  each child, then call          │
                    │  optimizeContainer()            │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────┐
                    │  optimizeContainer(node)        │
                    │  [optimizer.ts:89]              │
                    │                                 │
                    │  Core optimization logic (7.3)  │
                    └─────────────────────────────────┘
```

### 7.3 optimizeContainer Four-Step Algorithm

```
optimizeContainer(node) - [optimizer.ts:89-356]
═══════════════════════════════════════════════════════════════════════════

Input: SimplifiedNode (container node with children)
Output: Optimized SimplifiedNode

┌─────────────────────────────────────────────────────────────────────────┐
│ Pre-checks                                                               │
│ • children.length <= 1 → return immediately                             │
│ • Check if FRAME/GROUP container                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Overlap Detection                                               │
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
│   (participate in layout)     (keep absolute)                           │
│                                                                          │
│   If flowElements.length < 2 → skip layout optimization                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1.5: Background Element Detection                                  │
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
│   filteredChildren = children.filter(non-background)                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Grid Detection (Priority over Flex)                            │
│ [optimizer.ts:165-206]                                                  │
│                                                                          │
│   if (isContainer) {                                                    │
│       gridDetection = detectGridIfApplicable(filteredChildren)          │
│                         │                                                │
│       if (gridDetection) {                                              │
│           ┌─────────────┴─────────────┐                                 │
│           │ gridResult                 │                                 │
│           │ gridIndices (Grid elements)│                                 │
│           └─────────────┬─────────────┘                                 │
│                         │                                                │
│           gridStyles = generateGridCSS(gridResult)                      │
│                         │                                                │
│           convertAbsoluteToRelative(..., gridIndices)                   │
│                         │                                                │
│           return Grid layout node ──────────────────────► [END]         │
│       }                                                                  │
│   }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Grid not detected)
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Flex Detection (Fallback)                                       │
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
│     flexDirection: direction,  // only set for column                  │
│     gap: `${gap}px`,           // only when consistent                 │
│     justifyContent,                                                      │
│     alignItems                                                           │
│   }                                                                      │
│                         │                                                │
│   convertAbsoluteToRelative() → padding + clean child styles            │
│                         │                                                │
│   return Flex layout node                                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Flex Layout Detection Flow

```
analyzeLayoutDirection(nodes) - [optimizer.ts:361-438]
═══════════════════════════════════════════════════════════════════════════

Input: SimplifiedNode[] (child nodes array)
Output: { isRow, isColumn, rowGap, columnGap, isGapConsistent,
          justifyContent, alignItems }

                    ┌─────────────────────────────────┐
                    │  Extract position info          │
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
                    │  Analyze horizontal/vertical    │
                    │  alignment:                     │
                    │  • leftAligned                  │
                    │  • rightAligned                 │
                    │  • centerHAligned               │
                    │  • topAligned                   │
                    │  • bottomAligned                │
                    │  • centerVAligned               │
                    └───────────────┬─────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
     ┌─────────────────────────┐     ┌─────────────────────────┐
     │  calculateRowScore()    │     │  calculateColumnScore()  │
     │  [optimizer.ts:551-579] │     │  [optimizer.ts:584-612]  │
     │                         │     │                          │
     │  Row layout scoring:    │     │  Column layout scoring:  │
     │                         │     │                          │
     │  1. Sort by left        │     │  1. Sort by top          │
     │                         │     │                          │
     │  2. Calculate h-gaps    │     │  2. Calculate v-gaps     │
     │     gap = next.left -   │     │     gap = next.top -     │
     │           current.right │     │           current.bottom │
     │                         │     │                          │
     │  3. Count consecutive   │     │  3. Count consecutive    │
     │     positive gaps       │     │     positive gaps        │
     │     (0 <= gap <= 50px)  │     │     (0 <= gap <= 50px)   │
     │                         │     │                          │
     │  4. Score calculation:  │     │  4. Score calculation:   │
     │     distribution * 0.7  │     │     distribution * 0.7   │
     │     + alignment * 0.3   │     │     + alignment * 0.3    │
     └───────────────┬─────────┘     └───────────────┬──────────┘
                     │                               │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  Layout direction decision      │
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
                    │  CSS property mapping           │
                    │                                 │
                    │  Row layout:                    │
                    │    justify = horizontal align  │
                    │    align   = vertical align    │
                    │                                 │
                    │  Column layout:                 │
                    │    justify = vertical align    │
                    │    align   = horizontal align  │
                    └─────────────────────────────────┘
```

### 7.5 Overlap Detection Algorithm (IoU)

```
detectOverlappingElements(rects, iouThreshold=0.1) - [detector.ts:246-281]
═══════════════════════════════════════════════════════════════════════════

IoU (Intersection over Union) Calculation:

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


Algorithm Flow:
┌────────────────────────────────────────────────────────────────┐
│  for each pair (i, j) where i < j:                             │
│                                                                 │
│    iou = calculateIoU(rects[i], rects[j])                      │
│                                                                 │
│    if (iou > 0.1):                                             │
│      stackedIndices.add(rects[i].index)                        │
│      stackedIndices.add(rects[j].index)                        │
│                                                                 │
│  Result:                                                        │
│    flowElements     = elements NOT in stackedIndices           │
│    stackedElements  = elements in stackedIndices               │
└────────────────────────────────────────────────────────────────┘

IoU Threshold Classification:
┌────────────┬───────────────────────────────────────────────────┐
│ IoU Range  │ Classification                                    │
├────────────┼───────────────────────────────────────────────────┤
│ = 0        │ none/adjacent (no overlap or adjacent)            │
│ 0 < x < 0.1│ partial (slight overlap - can participate)        │
│ 0.1 ≤ x < 0.5│ significant (needs absolute positioning)       │
│ ≥ 0.5      │ contained (severe overlap/containment)            │
└────────────┴───────────────────────────────────────────────────┘
```

### 7.6 Gap Analysis Algorithm

```
calculateGaps() + analyzeGaps() - [detector.ts:447-509]
═══════════════════════════════════════════════════════════════════════════

Gap Calculation Example (horizontal direction):

     ┌────┐   gap1   ┌────┐   gap2   ┌────┐
     │ A  │ ──────── │ B  │ ──────── │ C  │
     └────┘          └────┘          └────┘
      right          left  right     left

  gap1 = B.x - A.right
  gap2 = C.x - B.right


Gap Consistency Analysis:
┌────────────────────────────────────────────────────────────────┐
│  analyzeGaps(gaps, tolerancePercent=20)                        │
│                                                                 │
│  1. Calculate average:                                          │
│     average = sum(gaps) / gaps.length                          │
│                                                                 │
│  2. Calculate standard deviation:                               │
│     variance = Σ(gap - average)² / n                           │
│     stdDev = √variance                                         │
│                                                                 │
│  3. Consistency check:                                          │
│     tolerance = average × 20%                                  │
│     isConsistent = (stdDev <= tolerance)                       │
│                                                                 │
│  4. Round to common values:                                     │
│     COMMON_VALUES = [0,2,4,6,8,10,12,16,20,24,32,40,48,64...]  │
│     rounded = findClosest(average, COMMON_VALUES)              │
└────────────────────────────────────────────────────────────────┘

Example:
┌──────────────────────────────────────────────────────────────┐
│  gaps = [16, 15, 17, 16]                                     │
│  average = 16                                                 │
│  stdDev = 0.71                                               │
│  tolerance = 16 × 0.2 = 3.2                                  │
│  isConsistent = (0.71 <= 3.2) = true ✓                       │
│  rounded = 16px                                              │
└──────────────────────────────────────────────────────────────┘
```

### 7.7 Absolute to Relative Position Conversion

```
convertAbsoluteToRelative() - [optimizer.ts:1591-1685]
═══════════════════════════════════════════════════════════════════════════

Original Layout (Absolute Positioning):
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

After Conversion (Flex Layout):
┌────────────────────────────────────────────────┐
│ Parent Container                               │
│ display: flex;                                 │
│ padding: 10px 30px 20px 20px;                 │
│ gap: 20px;                                     │
│  ┌──────────────────────────────────────────┐  │
│  │    ┌────────┐   ←gap→  ┌────────┐        │  │
│  │    │ Child1 │          │ Child2 │        │  │
│  │    │(no left)│          │(no left)│        │  │
│  │    │(no top) │          │(no top) │        │  │
│  │    └────────┘          └────────┘        │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘


Conversion Steps:
┌────────────────────────────────────────────────────────────────┐
│  1. collectFlowChildOffsets()                                  │
│     Collect position info for all flow children               │
│                                                                 │
│  2. inferContainerPadding()                                    │
│     Infer container padding from child positions:              │
│     • paddingLeft   = min(children.left)                       │
│     • paddingTop    = min(children.top)                        │
│     • paddingRight  = parentWidth - max(children.right)        │
│     • paddingBottom = parentHeight - max(children.bottom)      │
│                                                                 │
│  3. calculateChildMargins()                                    │
│     Calculate individual child margin adjustments              │
│     (cross-axis offset)                                        │
│                                                                 │
│  4. generatePaddingCSS()                                       │
│     Generate CSS padding shorthand:                            │
│     • All same: "10px"                                         │
│     • Top/bottom same, left/right same: "10px 20px"            │
│     • All different: "10px 20px 30px 40px"                     │
│                                                                 │
│  5. cleanChildStylesForLayout()                                │
│     Clean child element styles:                                │
│     • Remove position: absolute                                │
│     • Remove left, top                                         │
│     • Keep width, height                                       │
└────────────────────────────────────────────────────────────────┘
```

### 7.8 Core Data Structures

```typescript
// Core data structures in detector.ts
═══════════════════════════════════════════════════════════════════════════

// Basic bounding box
interface BoundingBox {
  x: number;      // left offset
  y: number;      // top offset
  width: number;  // width
  height: number; // height
}

// Extended element rect (with computed properties)
interface ElementRect extends BoundingBox {
  index: number;   // index in original array
  right: number;   // x + width
  bottom: number;  // y + height
  centerX: number; // x + width/2
  centerY: number; // y + height/2
}

// Layout analysis result
interface LayoutAnalysisResult {
  direction: 'row' | 'column' | 'none';
  confidence: number;           // 0-1 confidence score
  gap: number;                  // gap value (px)
  isGapConsistent: boolean;     // is gap consistent
  justifyContent: string;       // CSS justify-content
  alignItems: string;           // CSS align-items
  rows: ElementRect[][];        // row grouping result
  columns: ElementRect[][];     // column grouping result
  overlappingElements: ElementRect[]; // overlapping elements
}

// Overlap detection result
interface OverlapDetectionResult {
  flowElements: ElementRect[];     // elements participating in layout
  stackedElements: ElementRect[];  // elements needing absolute
  stackedIndices: Set<number>;     // overlapping element indices
}

// Background detection result
interface BackgroundDetectionResult {
  backgroundIndex: number;    // background element index (-1 if none)
  contentIndices: number[];   // content element indices
  hasBackground: boolean;     // whether background detected
}
```

### 7.9 File Path Mapping

| Module                     | File Path                            | Line Range |
| -------------------------- | ------------------------------------ | ---------- |
| Bounding box extraction    | `src/algorithms/layout/detector.ts`  | 56-109     |
| Overlap detection (IoU)    | `src/algorithms/layout/detector.ts`  | 111-281    |
| Background detection       | `src/algorithms/layout/detector.ts`  | 283-344    |
| Row/column grouping        | `src/algorithms/layout/detector.ts`  | 346-422    |
| Gap analysis               | `src/algorithms/layout/detector.ts`  | 442-535    |
| Alignment detection        | `src/algorithms/layout/detector.ts`  | 537-642    |
| Layout direction detection | `src/algorithms/layout/detector.ts`  | 644-755    |
| Layout tree building       | `src/algorithms/layout/detector.ts`  | 847-982    |
| Optimization entry         | `src/algorithms/layout/optimizer.ts` | 36-53      |
| Container optimization     | `src/algorithms/layout/optimizer.ts` | 89-356     |
| CSS generation             | `src/algorithms/layout/optimizer.ts` | 875-913    |
| Position conversion        | `src/algorithms/layout/optimizer.ts` | 1591-1685  |

---

_Document version: 2.0_
_Last updated: 2025-12-06_

_For the Chinese version of this document, see [docs/zh-CN/layout-detection.md](../zh-CN/layout-detection.md)_
