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

| Criterion         | Threshold  | Rationale                            |
| ----------------- | ---------- | ------------------------------------ |
| Maximum size      | 300×300 px | Icons are typically small            |
| Minimum size      | 8×8 px     | Avoid detecting tiny decorations     |
| Mergeable ratio   | 80%        | Most children should be vector types |
| Max nesting depth | 5 levels   | Avoid complex UI components          |

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

| Condition                       | Format       | Reason                       |
| ------------------------------- | ------------ | ---------------------------- |
| All vector elements             | SVG          | Best quality, smallest size  |
| Contains effects (blur, shadow) | PNG          | Effects not supported in SVG |
| Designer specified format       | As specified | Respect design intent        |

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
    reason: "All criteria met",
  };
}
```

## Test Results

### Test Cases

| Test Case                        | Expected                     | Result |
| -------------------------------- | ---------------------------- | ------ |
| Icon container (designer marked) | ✓ Export as PNG              | ✓ PASS |
| Core icon group                  | ✓ Export as whole            | ✓ PASS |
| Magnifying glass icon            | ✓ Small icon group           | ✓ PASS |
| Exclamation icon                 | ✓ Export as icon             | ✓ PASS |
| Star icon in AI button           | ✓ Export as icon             | ✓ PASS |
| Text node                        | ✗ Should not merge           | ✓ PASS |
| Root node (too large)            | ✗ Should not export          | ✓ PASS |
| Group with TEXT                  | ✗ Should not export as image | ✓ PASS |
| Background rectangle             | ✗ Too large                  | ✓ PASS |

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
  respectExportSettingsMaxSize: 500,
};
```

### Tuning Guidelines

| Scenario         | Adjustment                            |
| ---------------- | ------------------------------------- |
| Large icons      | Increase `maxIconSize`                |
| Strict detection | Increase `mergeableRatio`             |
| Complex icons    | Increase `maxDepth` and `maxChildren` |

---

## Complete Implementation Analysis

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Icon Detection Algorithm                             │
│                      src/algorithms/icon/detector.ts                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐                                                         │
│  │ Figma Node Tree │                                                         │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           ▼                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      analyzeNodeTree() [Entry Point]                    │ │
│  │  Orchestrates the detection flow, returns results and summary           │ │
│  └────────────────────────────────────┬───────────────────────────────────┘ │
│                                       │                                      │
│           ┌───────────────────────────┴───────────────────────────┐          │
│           ▼                                                       ▼          │
│  ┌─────────────────────┐                              ┌────────────────────┐ │
│  │  processNodeTree()  │                              │collectExportable   │ │
│  │  Bottom-up recursive│─────── After processing ────▶│    Icons()         │ │
│  │  Mark _iconDetection│                              │ Collect exportable │ │
│  └──────────┬──────────┘                              │     icon list      │ │
│             │                                         └────────────────────┘ │
│             │ For each node                                                  │
│             ▼                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         detectIcon() [Core Detection]                   │ │
│  │                                                                         │ │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐    │ │
│  │   │ 9-Step Rules │───▶│collectNode  │───▶│ IconDetectionResult     │    │ │
│  │   │ (see below)  │    │  Stats()    │    │ {shouldMerge, format}   │    │ │
│  │   └─────────────┘    │ O(n) single │    └─────────────────────────┘    │ │
│  │                      │   pass      │                                    │ │
│  │                      └─────────────┘                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### detectIcon() 9-Step Detection Flow

```
                              ┌─────────────────────┐
                              │     detectIcon()     │
                              │   Input: FigmaNode   │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         │
        ┌───────────────────────┐                             │
 Step 1 │ exportSettings Check  │                             │
        │ Designer marked export?│                             │
        └───────────┬───────────┘                             │
                    │                                         │
          ┌────────YES────────┐                               │
          ▼                   │                               │
  ┌───────────────────┐      │                               │
  │ Size ≤ 400px?     │      │                               │
  │ No TEXT?          │      │                               │
  └─────────┬─────────┘      │                               │
            │                 │                               │
     YES────┴────NO           │                               │
      │          │            │                               │
      ▼          │            │                               │
 ┌────────┐      │            │                               │
 │✅ Merge │      └────────────┼───────────────┐               │
 │Use      │                   │               │               │
 │designer │                   │               │               │
 │settings │                   │               │               │
 └────────┘                   │               │               │
                              ▼               ▼               │
                    ┌───────────────────────────────┐         │
             Step 2 │ Container or mergeable type?  │         │
                    │ CONTAINER: GROUP/FRAME/...    │         │
                    │ MERGEABLE: VECTOR/ELLIPSE/... │         │
                    └───────────────┬───────────────┘         │
                                    │                         │
                         ┌─────────NO─────────┐               │
                         ▼                    │               │
                    ┌─────────┐               │               │
                    │❌ Skip   │               │               │
                    │Non-target│               │               │
                    │type      │               │               │
                    └─────────┘               │               │
                                              ▼               │
                              ┌─────────────────────────┐     │
                              │ Single element (VECTOR)?│     │
                              └───────────┬─────────────┘     │
                                          │                   │
                               YES────────┴────────NO         │
                                │                  │          │
                ┌───────────────┘                  │          │
                ▼                                  │          │
    ┌─────────────────────┐                        │          │
    │ Exclude RECTANGLE   │                        │          │
    │ (usually background)│                        │          │
    │ Check size ≤ 300px  │                        │          │
    └──────────┬──────────┘                        │          │
               │                                   │          │
        PASS───┴───FAIL                            │          │
         │         │                               │          │
         ▼         ▼                               │          │
    ┌────────┐ ┌─────────┐                         │          │
    │✅ Merge │ │❌ Skip   │                         │          │
    │Single  │ │Background│                         │          │
    │vector  │ │/too large│                         │          │
    └────────┘ └─────────┘                         │          │
                                                   │          │
                         ┌─────────────────────────┘          │
                         ▼                                    │
               ┌───────────────────────────┐                  │
        Step 3 │ Size Check (containers)   │                  │
               │ 8px ≤ size ≤ 300px        │                  │
               └─────────────┬─────────────┘                  │
                             │                                │
                   PASS──────┴──────FAIL                      │
                    │                 │                       │
                    │                 ▼                       │
                    │          ┌─────────────┐                │
                    │          │ ❌ Skip      │                │
                    │          │ Too large/  │                │
                    │          │ small       │                │
                    │          └─────────────┘                │
                    ▼                                         │
    ╔═══════════════════════════════════════════════════════╗ │
    ║           collectNodeStats() Single-Pass              ║ │
    ║     ┌────────────────────────────────────────────┐    ║ │
    ║     │  O(n) complexity collects 7 statistics:    │    ║ │
    ║     │  • depth          - Tree depth             │    ║ │
    ║     │  • totalChildren  - Total descendants      │    ║ │
    ║     │  • hasExcludeType - Contains TEXT etc.     │    ║ │
    ║     │  • hasImageFill   - Contains image fills   │    ║ │
    ║     │  • hasComplexEffects - Contains effects    │    ║ │
    ║     │  • allLeavesMergeable - All leaves OK      │    ║ │
    ║     │  • mergeableRatio - Mergeable type ratio   │    ║ │
    ║     └────────────────────────────────────────────┘    ║ │
    ╚═══════════════════════════════╤═══════════════════════╝ │
                                    │                         │
                                    ▼                         │
               ┌───────────────────────────────────┐          │
        Step 4 │ Exclude Type Check                │          │
               │ hasExcludeType? (TEXT/COMPONENT)  │          │
               └─────────────────┬─────────────────┘          │
                                 │                            │
                       YES───────┴───────NO                   │
                        │                 │                   │
                        ▼                 │                   │
                   ┌─────────┐            │                   │
                   │❌ Skip   │            │                   │
                   │Has text │            │                   │
                   └─────────┘            │                   │
                                          ▼                   │
               ┌───────────────────────────────────┐          │
        Step 5 │ Depth Check                       │          │
               │ depth ≤ 5?                        │          │
               └─────────────────┬─────────────────┘          │
                                 │                            │
                       NO────────┴────────YES                 │
                        │                  │                  │
                        ▼                  │                  │
                   ┌─────────┐             │                  │
                   │❌ Skip   │             │                  │
                   │Too deep │             │                  │
                   └─────────┘             │                  │
                                           ▼                  │
               ┌───────────────────────────────────┐          │
        Step 6 │ Child Count Check                 │          │
               │ totalChildren ≤ 100?              │          │
               └─────────────────┬─────────────────┘          │
                                 │                            │
                       NO────────┴────────YES                 │
                        │                  │                  │
                        ▼                  │                  │
                   ┌─────────┐             │                  │
                   │❌ Skip   │             │                  │
                   │Too many │             │                  │
                   │children │             │                  │
                   └─────────┘             │                  │
                                           ▼                  │
               ┌───────────────────────────────────┐          │
        Step 7 │ Mergeable Ratio Check             │          │
               │ mergeableRatio ≥ 60%?             │          │
               └─────────────────┬─────────────────┘          │
                                 │                            │
                       NO────────┴────────YES                 │
                        │                  │                  │
                        ▼                  │                  │
                   ┌─────────┐             │                  │
                   │❌ Skip   │             │                  │
                   │Ratio low│             │                  │
                   └─────────┘             │                  │
                                           ▼                  │
               ┌───────────────────────────────────┐          │
        Step 8 │ Leaf Mergeability Check           │          │
               │ allLeavesMergeable?               │          │
               └─────────────────┬─────────────────┘          │
                                 │                            │
                       NO────────┴────────YES                 │
                        │                  │                  │
                        ▼                  │                  │
                   ┌─────────┐             │                  │
                   │❌ Skip   │             │                  │
                   │Non-     │             │                  │
                   │mergeable│             │                  │
                   │leaves   │             │                  │
                   └─────────┘             │                  │
                                           ▼                  │
               ┌───────────────────────────────────┐          │
        Step 9 │ Export Format Decision            │          │
               │ Based on hasImageFill/hasComplex  │          │
               └─────────────────┬─────────────────┘          │
                                 │                            │
            ┌────────────────────┼────────────────────┐       │
            ▼                    ▼                    ▼       │
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐│
    │ hasImageFill  │   │hasComplex     │   │ Pure vector   ││
    │    = true     │   │Effects = true │   │               ││
    └───────┬───────┘   └───────┬───────┘   └───────┬───────┘│
            │                   │                   │        │
            ▼                   ▼                   ▼        │
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐│
    │ ✅ shouldMerge │   │ ✅ shouldMerge │   │ ✅ shouldMerge ││
    │ format: PNG   │   │ format: PNG   │   │ format: SVG   ││
    └───────────────┘   └───────────────┘   └───────────────┘│
                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Bottom-Up Processing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    processNodeTree() Bottom-Up Processing                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Example Input:                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Frame "Card"                                                          │   │
│  │ ├── Frame "Header"                                                    │   │
│  │ │   ├── Group "Logo"          ◄─── Potential icon                    │   │
│  │ │   │   ├── Vector (path1)                                            │   │
│  │ │   │   └── Ellipse (circle)                                          │   │
│  │ │   └── Text "Title"                                                  │   │
│  │ └── Frame "Content"                                                   │   │
│  │     └── Group "Icon-Set"                                              │   │
│  │         ├── Group "Search"    ◄─── Potential icon                    │   │
│  │         │   ├── Ellipse                                               │   │
│  │         │   └── Line                                                  │   │
│  │         └── Group "Menu"      ◄─── Potential icon                    │   │
│  │             ├── Line                                                  │   │
│  │             ├── Line                                                  │   │
│  │             └── Line                                                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Processing Order (bottom-up):                                               │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Round 1: Process deepest leaf nodes                                  │    │
│  │ Vector, Ellipse, Text, Line... → All leaves, no _iconDetection       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Round 2: Process first-level containers                              │    │
│  │                                                                      │    │
│  │  Group "Logo"    → detectIcon() → ✅ shouldMerge (pure vector)        │    │
│  │  Group "Search"  → detectIcon() → ✅ shouldMerge (pure vector)        │    │
│  │  Group "Menu"    → detectIcon() → ✅ shouldMerge (pure vector)        │    │
│  │                                                                      │    │
│  │  ⚠️  After marking, child _iconDetection is cleared (will be merged)  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Round 3: Process upper containers                                    │    │
│  │                                                                      │    │
│  │  Frame "Header"                                                      │    │
│  │    → Children include Logo(icon) + Text                              │    │
│  │    → Not all children are icons                                      │    │
│  │    → detectIcon() → ❌ Contains TEXT                                  │    │
│  │    → Logo keeps _iconDetection marker                                │    │
│  │                                                                      │    │
│  │  Group "Icon-Set"                                                    │    │
│  │    → All children (Search, Menu) already marked as icons             │    │
│  │    → allChildrenAreIcons = true                                      │    │
│  │    → detectIcon() → Check if can promote merge                       │    │
│  │    → If size/depth allows → ✅ Merge as single icon                   │    │
│  │    → Clear Search, Menu _iconDetection                               │    │
│  │    OR                                                                │    │
│  │    → If criteria not met → Keep individual _iconDetection            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Final: Collect exportable icons                                      │    │
│  │                                                                      │    │
│  │  collectExportableIcons() traverses processed tree:                  │    │
│  │                                                                      │    │
│  │  - Node with _iconDetection → Add to export list                     │    │
│  │  - Don't recurse into marked nodes (children will be merged)         │    │
│  │  - Continue traversing unmarked nodes' children                      │    │
│  │                                                                      │    │
│  │  Output: [Logo, Search, Menu] or [Logo, Icon-Set]                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### collectNodeStats() Single-Pass Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   collectNodeStats() Performance Optimization                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Before: 6 separate recursive functions, O(6n) complexity                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │   calculateDepth()          ─────▶ Traverse tree ────▶ depth          │  │
│  │   countTotalChildren()      ─────▶ Traverse tree ────▶ count          │  │
│  │   hasExcludeTypeInTree()    ─────▶ Traverse tree ────▶ boolean        │  │
│  │   hasImageFillInTree()      ─────▶ Traverse tree ────▶ boolean        │  │
│  │   hasComplexEffectsInTree() ─────▶ Traverse tree ────▶ boolean        │  │
│  │   areAllLeavesMergeable()   ─────▶ Traverse tree ────▶ boolean        │  │
│  │                                                                        │  │
│  │   Total traversals: 6n                                                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│                                    │                                        │
│                                    ▼                                        │
│                                                                              │
│  After: Single-pass collection, O(n) complexity                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │                      collectNodeStats(node)                            │  │
│  │                              │                                         │  │
│  │              ┌───────────────┴───────────────┐                         │  │
│  │              ▼                               ▼                         │  │
│  │      ┌─────────────┐                 ┌─────────────────┐               │  │
│  │      │  Leaf node   │                 │  Container node │               │  │
│  │      │  No children │                 │  Has children   │               │  │
│  │      └──────┬──────┘                 └────────┬────────┘               │  │
│  │             │                                 │                        │  │
│  │             ▼                                 ▼                        │  │
│  │      Compute directly:           Recurse then aggregate:               │  │
│  │      • depth = 0                  • depth = max(child.depth) + 1       │  │
│  │      • totalChildren = 0          • totalChildren = Σ(1 + child.total) │  │
│  │      • hasExcludeType             • hasExcludeType = any(children)     │  │
│  │      • hasImageFill               • hasImageFill = any(children)       │  │
│  │      • hasComplexEffects          • hasComplexEffects = any(children)  │  │
│  │      • allLeavesMergeable         • allLeavesMergeable = all(children) │  │
│  │      • mergeableRatio             • mergeableRatio = count/total       │  │
│  │                                                                        │  │
│  │   Total traversals: n                                                  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Performance improvement: ~28% (64 → 82 nodes/ms)                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Type Constants and Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Type Classification Constants                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ CONTAINER_TYPES (Can contain icon children)                         │    │
│  │ ├── GROUP      Figma group                                          │    │
│  │ ├── FRAME      Figma frame                                          │    │
│  │ ├── COMPONENT  Component definition                                 │    │
│  │ └── INSTANCE   Component instance                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ MERGEABLE_TYPES (Can be part of an icon)                            │    │
│  │ ├── VECTOR           Vector path                                    │    │
│  │ ├── RECTANGLE        Rectangle                                      │    │
│  │ ├── ELLIPSE          Ellipse/Circle                                 │    │
│  │ ├── LINE             Line                                           │    │
│  │ ├── POLYGON          Polygon                                        │    │
│  │ ├── STAR             Star                                           │    │
│  │ ├── BOOLEAN_OPERATION Boolean operation result                      │    │
│  │ └── REGULAR_POLYGON  Regular polygon                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ EXCLUDE_TYPES (Presence prevents merging)                           │    │
│  │ ├── TEXT       Text element (needs separate rendering)              │    │
│  │ ├── COMPONENT  Component definition (has logic)                     │    │
│  │ └── INSTANCE   Component instance (may have interactions)           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ PNG_REQUIRED_EFFECTS (Require PNG format)                           │    │
│  │ ├── DROP_SHADOW      Drop shadow                                    │    │
│  │ ├── INNER_SHADOW     Inner shadow                                   │    │
│  │ ├── LAYER_BLUR       Layer blur                                     │    │
│  │ └── BACKGROUND_BLUR  Background blur                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                              Default Configuration                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DEFAULT_CONFIG = {                                                         │
│    maxIconSize: 300,               // Maximum icon size (px)                │
│    minIconSize: 8,                 // Minimum icon size (px)                │
│    mergeableRatio: 0.6,            // Minimum mergeable ratio (60%)         │
│    maxDepth: 5,                    // Maximum nesting depth                 │
│    maxChildren: 100,               // Maximum child count                   │
│    respectExportSettingsMaxSize: 400  // Max size for designer settings    │
│  }                                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Export Format Decision Tree

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Export Format Decision Logic                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        ┌───────────────────┐                                │
│                        │ Confirmed export  │                                │
│                        │  shouldMerge=true │                                │
│                        └─────────┬─────────┘                                │
│                                  │                                          │
│                                  ▼                                          │
│                 ┌────────────────────────────────┐                          │
│                 │ Designer set export format     │                          │
│                 │ in Figma?                      │                          │
│                 │     node.exportSettings[0]     │                          │
│                 └────────────────┬───────────────┘                          │
│                                  │                                          │
│                    YES───────────┴───────────NO                             │
│                     │                        │                              │
│                     ▼                        │                              │
│         ┌─────────────────────┐              │                              │
│         │ Use designer format │              │                              │
│         │ format = settings   │              │                              │
│         └─────────────────────┘              │                              │
│                                              ▼                              │
│                               ┌────────────────────────┐                    │
│                               │ Tree contains image    │                    │
│                               │ fills?                 │                    │
│                               │   hasImageFill = true  │                    │
│                               └───────────┬────────────┘                    │
│                                           │                                 │
│                              YES──────────┴──────────NO                     │
│                               │                       │                     │
│                               ▼                       ▼                     │
│                   ┌───────────────────┐  ┌─────────────────────────┐       │
│                   │ format = "PNG"    │  │ Tree contains complex   │       │
│                   │                   │  │ effects?                │       │
│                   │ Reason:           │  │ hasComplexEffects=true  │       │
│                   │ Images can't be   │  └───────────┬─────────────┘       │
│                   │ vectorized        │              │                     │
│                   └───────────────────┘   YES────────┴────────NO           │
│                                            │                  │            │
│                                            ▼                  ▼            │
│                               ┌───────────────────┐ ┌───────────────────┐  │
│                               │ format = "PNG"    │ │ format = "SVG"    │  │
│                               │                   │ │                   │  │
│                               │ Reason:           │ │ Reason:           │  │
│                               │ Shadow/blur       │ │ Pure vector       │  │
│                               │ effects can't     │ │ Lossless scaling  │  │
│                               │ render in SVG     │ │                   │  │
│                               └───────────────────┘ └───────────────────┘  │
│                                                                              │
│  ════════════════════════════════════════════════════════════════════════   │
│                                                                              │
│  PNG Priority Scenarios:                    SVG Priority Scenarios:          │
│  ┌────────────────────────────┐         ┌────────────────────────────┐     │
│  │ • Contains bitmap fills    │         │ • Pure vector paths        │     │
│  │ • DROP_SHADOW              │         │ • Simple shape combos      │     │
│  │ • INNER_SHADOW             │         │ • No complex effects       │     │
│  │ • LAYER_BLUR               │         │ • Needs lossless scaling   │     │
│  │ • BACKGROUND_BLUR          │         │ • Needs CSS coloring       │     │
│  │ • Complex gradient+effects │         │ • Small file size needed   │     │
│  └────────────────────────────┘         └────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Complete Call Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Complete Call Chain Diagram                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  External Entry (parser.ts / server.ts)                                      │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        analyzeNodeTree(node)                             ││
│  │                                                                          ││
│  │  Params: node: FigmaNode, config?: DetectionConfig                       ││
│  │  Returns: { processedTree, exportableIcons, summary }                    ││
│  └────────────────────────────────┬────────────────────────────────────────┘│
│                                   │                                          │
│           ┌───────────────────────┴───────────────────────┐                  │
│           ▼                                               ▼                  │
│  ┌────────────────────────┐                  ┌─────────────────────────────┐│
│  │   processNodeTree()    │                  │  collectExportableIcons()   ││
│  │                        │                  │                             ││
│  │  Recursive processing: │  After complete  │  Traverse processed tree:   ││
│  │  1. Process children   │ ────────────────▶│  1. Has marker → add to list││
│  │     first              │                  │  2. No marker → recurse     ││
│  │  2. Check if all       │                  │  3. Return all exportable   ││
│  │     children are icons │                  │     icons                   ││
│  │  3. Try parent promote │                  │                             ││
│  │  4. Mark _iconDetection│                  │                             ││
│  └───────────┬────────────┘                  └─────────────────────────────┘│
│              │                                                               │
│              │ For each node                                                 │
│              ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                          detectIcon(node)                                ││
│  │                                                                          ││
│  │  Core detection, executes 9 steps:                                       ││
│  │  Step 1: exportSettings check                                            ││
│  │  Step 2: Type check (container/mergeable)                                ││
│  │  Step 3: Size check (8-300px)                                            ││
│  │  Step 4-8: Use collectNodeStats() for tree properties                    ││
│  │  Step 9: Determine export format (SVG/PNG)                               ││
│  └────────────────────────────────┬────────────────────────────────────────┘│
│                                   │                                          │
│              ┌────────────────────┴────────────────────┐                     │
│              ▼                                         ▼                     │
│  ┌─────────────────────────────┐         ┌────────────────────────────────┐ │
│  │   collectNodeStats(node)    │         │  Helper Functions:              │ │
│  │                             │         │                                 │ │
│  │   Single-pass collection    │         │  • isContainerType()            │ │
│  │   of 7 statistics:          │         │  • isMergeableType()            │ │
│  │   O(n) complexity           │         │  • isExcludeType()              │ │
│  │                             │         │  • hasImageFill()               │ │
│  │   Replaces 6 original       │         │  • hasComplexEffects()          │ │
│  │   recursive functions       │         │  • getNodeSize()                │ │
│  │   ~28% performance boost    │         │                                 │ │
│  └─────────────────────────────┘         └────────────────────────────────┘ │
│                                                                              │
│  ════════════════════════════════════════════════════════════════════════   │
│                                                                              │
│  Return Structure:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ {                                                                        ││
│  │   processedTree: FigmaNode & { _iconDetection?: IconDetectionResult },  ││
│  │   exportableIcons: IconDetectionResult[],                                ││
│  │   summary: {                                                             ││
│  │     totalIcons: number,    // Total exportable icons                     ││
│  │     svgCount: number,      // SVG format count                           ││
│  │     pngCount: number       // PNG format count                           ││
│  │   }                                                                      ││
│  │ }                                                                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

_Last updated: 2025-12-06 (Added complete implementation analysis)_

_For the Chinese version of this document, see [docs/zh-CN/icon-detection.md](../zh-CN/icon-detection.md)_
