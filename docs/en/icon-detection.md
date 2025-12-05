# Icon Layer Merge Algorithm

## Overview

This document describes the algorithm for detecting and merging icon layers in Figma designs. The goal is to identify groups of vector elements that should be exported as a single icon image rather than individual elements.

## Problem Statement

In Figma designs, icons are often composed of multiple vector layers:
- A magnifying glass icon might have a circle and a line
- A settings icon might have multiple gear shapes
- Complex icons might have dozens of individual elements

Exporting each layer separately would result in fragmented assets that are difficult to use.

## Algorithm Design

### 1. Detection Criteria

An element group is considered an icon if:

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| Maximum size | 300×300 px | Icons are typically small |
| Minimum size | 8×8 px | Avoid detecting tiny decorations |
| Mergeable ratio | 80% | Most children should be vector types |
| Max nesting depth | 5 levels | Avoid complex UI components |

### 2. Mergeable Node Types

The following node types are considered mergeable:
- `VECTOR`
- `ELLIPSE`
- `RECTANGLE`
- `STAR`
- `POLYGON`
- `LINE`
- `BOOLEAN_OPERATION`

### 3. Export Format Selection

| Condition | Format | Reason |
|-----------|--------|--------|
| All vector elements | SVG | Best quality, smallest size |
| Contains effects (blur, shadow) | PNG | Effects not supported in SVG |
| Designer specified format | As specified | Respect design intent |

### 4. Algorithm Flow

```
1. Traverse node tree depth-first
2. For each GROUP/FRAME node:
   a. Check size constraints
   b. Count mergeable vs non-mergeable children
   c. Calculate mergeable ratio
   d. If ratio >= threshold, mark as icon
3. Determine export format
4. Skip processing children of icon nodes
```

## Implementation

### Core Detection Function

```typescript
function shouldMergeAsIcon(node: FigmaNode, config: IconConfig): IconResult {
  // Size check
  if (node.width > config.maxSize || node.height > config.maxSize) {
    return { shouldMerge: false, reason: "Size too large" };
  }

  // Check for text nodes (exclude UI components)
  if (containsTextNode(node)) {
    return { shouldMerge: false, reason: "Contains TEXT elements" };
  }

  // Calculate mergeable ratio
  const ratio = countMergeableChildren(node) / node.children.length;
  if (ratio < config.mergeableRatio) {
    return { shouldMerge: false, reason: "Low mergeable ratio" };
  }

  return {
    shouldMerge: true,
    format: hasComplexEffects(node) ? "PNG" : "SVG",
    reason: "All criteria met"
  };
}
```

## Test Results

### Test Cases

| Test Case | Expected | Result |
|-----------|----------|--------|
| Icon container (designer marked) | ✓ Export as PNG | ✓ PASS |
| Core icon group | ✓ Export as whole | ✓ PASS |
| Magnifying glass icon | ✓ Small icon group | ✓ PASS |
| Exclamation icon | ✓ Export as icon | ✓ PASS |
| Star icon in AI button | ✓ Export as icon | ✓ PASS |
| Text node | ✗ Should not merge | ✓ PASS |
| Root node (too large) | ✗ Should not export | ✓ PASS |
| Group with TEXT | ✗ Should not export as image | ✓ PASS |
| Background rectangle | ✗ Too large | ✓ PASS |

**Result: 9/9 tests passed**

### Optimization Results

- **Before optimization**: ~45 potential exports (fragmented)
- **After optimization**: 2 exports (merged icons)
- **Reduction**: 96%

## Configuration

### Default Configuration

```typescript
const DEFAULT_CONFIG: IconDetectionConfig = {
  maxIconSize: 300,
  minIconSize: 8,
  mergeableRatio: 0.8,
  maxDepth: 5,
  maxChildren: 50,
  respectExportSettingsMaxSize: 500
};
```

### Tuning Guidelines

| Scenario | Adjustment |
|----------|------------|
| Large icons | Increase `maxIconSize` |
| Strict detection | Increase `mergeableRatio` |
| Complex icons | Increase `maxDepth` and `maxChildren` |

---

*For the Chinese version of this document, see [docs/zh-CN/icon-detection.md](../zh-CN/icon-detection.md)*
