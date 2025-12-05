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

| Challenge | Description |
|-----------|-------------|
| Row/Column Detection | How to determine if elements are arranged horizontally or vertically? |
| Nested Structure | How to convert a flat list into a nested DOM tree? |
| Gap Calculation | How to determine if gaps are consistent and should use the `gap` property? |
| Alignment Detection | How to detect `justify-content` and `align-items`? |
| Overlap Handling | How to handle overlapping elements that need absolute positioning? |
| Tolerance Handling | How to handle small offsets in design files? |

---

## 2. Industry Solutions Analysis

### 2.1 Major Tools Comparison

| Tool | Developer | Layout Detection | Open Source |
|------|-----------|-----------------|-------------|
| **FigmaToCode** | bernaferrari | Relies on Figma Auto Layout data | ✓ |
| **Grida** | gridaco | Rules + ML hybrid | ✓ |
| **imgcook** | Alibaba | Rule system + Machine Learning | ✗ |
| **Anima** | Anima | Constraint inference | ✗ |

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
    stdDev
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

| Test Case | Status | Result |
|-----------|--------|--------|
| Bounding box extraction | ✓ | Extracted 2 child elements |
| Row grouping algorithm | ✓ | Grouped into 1 row |
| Column grouping algorithm | ✓ | Grouped into 1 column |
| Consistent gap detection | ✓ | Avg: 16px, StdDev: 0.63 |
| Inconsistent gap detection | ✓ | Avg: 25px, StdDev: 14.14 |
| Left alignment detection | ✓ | Detected: left |
| Center alignment detection | ✓ | Detected: center |
| Layout tree building | ✓ | Type: container, Direction: column |

**Overall: 8/9 tests passed**

---

## 6. Best Practices

### 6.1 Recommended Parameters

| Parameter | Recommended Value | Description |
|-----------|-------------------|-------------|
| Y-axis tolerance | 2px | For row grouping |
| Gap tolerance | 20% | Standard deviation threshold |
| Alignment tolerance | 2px | For alignment detection |
| Max recursion depth | 5 | For nested layouts |

### 6.2 When to Use Absolute Positioning

- Elements with significant overlap (IoU > 0.1)
- Complex icon compositions
- Decorative elements with specific positioning

---

*For the Chinese version of this document, see [docs/zh-CN/layout-detection.md](../zh-CN/layout-detection.md)*
