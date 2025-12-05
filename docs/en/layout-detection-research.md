# Design-to-Code Layout Detection Research

## Executive Summary

This document provides a comprehensive analysis of layout detection algorithms used in design-to-code (D2C) conversion tools. The research focuses on how various implementations distinguish between flow (flex) layouts, stacked (absolute) layouts, and grid layouts.

## Table of Contents

1. [Problem Definition](#problem-definition)
2. [Industry Implementations](#industry-implementations)
3. [Academic Research](#academic-research)
4. [Algorithm Comparison](#algorithm-comparison)
5. [Detection Criteria & Thresholds](#detection-criteria--thresholds)
6. [Overlap Detection](#overlap-detection)
7. [Implementation Recommendations](#implementation-recommendations)

---

## Problem Definition

### The Core Challenge

Design tools like Figma store element positions as absolute coordinates (x, y, width, height). Converting these to semantic CSS layouts requires inferring the designer's intent:

| Layout Type           | CSS Property                            | Use Case                                     |
| --------------------- | --------------------------------------- | -------------------------------------------- |
| **Flow (Horizontal)** | `display: flex; flex-direction: row`    | Elements in a row with consistent spacing    |
| **Flow (Vertical)**   | `display: flex; flex-direction: column` | Elements stacked vertically                  |
| **Grid**              | `display: grid`                         | 2D matrix of aligned elements                |
| **Stacked/Absolute**  | `position: absolute`                    | Overlapping elements, decorative positioning |

### Key Questions to Answer

1. How do we detect if elements form a **row** vs a **column**?
2. When should we use **Grid** instead of **nested Flex**?
3. How do we identify **overlapping/stacked** elements that need absolute positioning?
4. What **tolerance thresholds** work best for real-world designs?

---

## Industry Implementations

### 1. imgcook (Alibaba D2C Platform)

**Architecture**: Deterministic-first pipeline with ML fallback

```
Design JSON → Flatten → Row/Column Grouping → Layout Inference → Semantic Labels → Code
```

**Flow vs Stacked Detection Algorithm**:

```typescript
// Core concept: Axis overlap determines layout type
function detectLayoutDirection(elements: Element[]): 'row' | 'column' | 'stacked' {
  // Step 1: Check Y-axis overlap (same horizontal row)
  const yOverlapGroups = groupByAxisOverlap(elements, 'y', tolerance: 2);

  // Step 2: If only one Y-group, check X-axis overlap (vertical column)
  if (yOverlapGroups.length === 1) {
    const xOverlapGroups = groupByAxisOverlap(elements, 'x', tolerance: 2);
    if (xOverlapGroups.length > 1) return 'column';
  }

  // Step 3: Check for overlapping elements
  const hasOverlap = elements.some((a, i) =>
    elements.slice(i + 1).some(b => calculateIoU(a, b) > 0.1)
  );

  return hasOverlap ? 'stacked' : 'row';
}
```

**Grouping Algorithm**:

```typescript
function groupByAxisOverlap(elements: Element[], axis: "x" | "y", tolerance: number): Element[][] {
  // Sort by axis position
  const sorted = elements.sort((a, b) => a[axis] - b[axis]);
  const groups: Element[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const lastGroup = groups[groups.length - 1];
    const lastElement = lastGroup[lastGroup.length - 1];

    // Check if current overlaps with last element on opposite axis
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

**Key Thresholds**:

| Parameter             | Value    | Purpose                       |
| --------------------- | -------- | ----------------------------- |
| Y-axis tolerance      | 2px      | Row grouping                  |
| X-axis tolerance      | 2px      | Column grouping               |
| Gap variance          | 20%      | Detect consistent spacing     |
| Alignment tolerance   | 2px      | Detect aligned edges          |
| IoU overlap threshold | 0.1      | Mark for absolute positioning |
| Max recursion depth   | 5        | Prevent infinite nesting      |
| Gap rounding          | 4px grid | Snap to common design values  |

**Confidence Scoring**:

```typescript
interface LayoutConfidence {
  patternCoverage: number; // How many elements fit the pattern
  gapConsistency: number; // Standard deviation of gaps
  alignmentAccuracy: number; // How well elements align
}

function calculateConfidence(analysis: LayoutAnalysis): number {
  let score = 0;

  score += analysis.patternCoverage * 0.4; // 40% weight
  score += analysis.gapConsistency * 0.35; // 35% weight
  score += analysis.alignmentAccuracy * 0.25; // 25% weight

  return score;
}

// Only accept layout if confidence >= 0.3
const MIN_CONFIDENCE = 0.3;
```

---

### 2. FigmaToCode (Open Source)

**Approach**: Metadata-first (trusts Figma Auto Layout)

```typescript
// FigmaToCode does NOT infer layout from coordinates
// Instead, it reads Figma's native Auto Layout metadata
function convertLayout(node: FigmaNode): CSSLayout {
  if (node.layoutMode === "HORIZONTAL") {
    return { display: "flex", flexDirection: "row" };
  }
  if (node.layoutMode === "VERTICAL") {
    return { display: "flex", flexDirection: "column" };
  }
  // No Auto Layout = fall back to absolute positioning
  return { position: "absolute" };
}
```

**Limitations**:

- Requires designers to use Figma Auto Layout feature
- Legacy designs without Auto Layout get absolute positioning
- No coordinate-based layout inference

**Key Innovation**: AltNodes intermediate representation

- Converts Figma nodes to simplified virtual nodes
- Handles mixed positioning (absolute + auto-layout children)
- Intelligent decisions about code structure

---

### 3. Locofy

**Approach**: Auto Layout + Absolute positioning hybrid

Locofy uses LocoAI to analyze designs and apply appropriate CSS properties:

```typescript
// Locofy's approach to layout detection
function analyzeLayout(elements: Element[]): LayoutDecision {
  // LocoAI groups elements for better structure
  const groups = locoAI.groupElements(elements);

  // Apply relevant CSS property (flex) for responsiveness
  for (const group of groups) {
    if (group.hasAutoLayout) {
      // Auto layout corresponds to Flexbox in CSS
      applyFlexLayout(group);
    } else if (group.isFloating) {
      // Floating elements use absolute positioning
      applyAbsolutePosition(group);
    }
  }
}
```

**Key Features**:

- Change absolute position status and re-run algorithm for regrouping
- Floating elements use absolute property in auto layout setting
- Parent of absolutely positioned element determines positioning context

---

### 4. Anima Auto-Flexbox

**Approach**: Computer Vision algorithms for automatic Flexbox

```typescript
// Anima's Auto-Flexbox algorithm
// Reverse-engineered from developer thought process
function applyAutoFlexbox(design: Design): Layout {
  // Without Auto-Flexbox: generates absolute layout
  // With Auto-Flexbox: generates relative positioning (Flexbox)

  // Computer Vision algorithms from CV world
  const flexboxLayout = cvAlgorithm.analyzeAndApply(design);

  // Relative positioning allows layers to push each other
  return flexboxLayout;
}
```

**Key Insight**: "Absolute layout is great for design phase, but less so for end product. Flexbox layout means relative positioning."

---

### 5. Gridaco / Grida

**Approach**: Rules + ML hybrid (similar to imgcook)

```typescript
// High-availability layout direction via heuristics
// ML reserved for component/loop recognition
function detectLayout(elements: Element[]): LayoutType {
  // Rule-based direction detection first
  const direction = detectDirectionByRules(elements);

  // ML for semantic understanding
  const semantics = mlModel.predictSemantics(elements);

  return combineResults(direction, semantics);
}
```

---

### 6. Phoenix Codie Position Detection System

**Key Innovation**: Explicit "position: absolute abuse" avoidance

```typescript
interface PositionDecision {
  element: Element;
  shouldBeAbsolute: boolean;
  reason: "overlap" | "decorative" | "anchor" | "flow";
}

function analyzePosition(element: Element, siblings: Element[]): PositionDecision {
  // Only use absolute for:
  // 1. Overlapping elements
  // 2. Decorative elements (badges, icons positioned freely)
  // 3. Anchor elements (tooltips, modals)

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

## Academic Research

### 1. Allen's Interval Algebra (Foundational)

**Source**: "A Layout Inference Algorithm for GUIs" (ScienceDirect)

Allen's 13 interval relations describe 1D spatial relationships:

```
| Relation | Visual | Description |
|----------|--------|-------------|
| before   | A---B  | A completely before B |
| meets    | A--B   | A ends where B starts |
| overlaps | A-B-   | A partially overlaps B |
| starts   | AB--   | A starts at same position as B |
| during   | -A-B   | A completely inside B |
| equals   | A=B    | Same position and size |
```

**Application to Layout Detection**:

```typescript
function getAllenRelation(a: Interval, b: Interval): AllenRelation {
  if (a.end < b.start) return "before";
  if (a.end === b.start) return "meets";
  if (a.start < b.start && a.end > b.start && a.end < b.end) return "overlaps";
  if (a.start === b.start && a.end < b.end) return "starts";
  if (a.start > b.start && a.end < b.end) return "during";
  if (a.start === b.start && a.end === b.end) return "equals";
  // ... inverse relations
}

// For 2D layouts, apply Allen relations to both X and Y axes
function get2DRelation(a: Rect, b: Rect): [AllenRelation, AllenRelation] {
  return [
    getAllenRelation({ start: a.x, end: a.right }, { start: b.x, end: b.right }),
    getAllenRelation({ start: a.y, end: a.bottom }, { start: b.y, end: b.bottom }),
  ];
}
```

**Two-Phase Algorithm**:

1. **Phase 1**: Convert absolute coordinates to relative positioning using directed graphs
2. **Phase 2**: Apply pattern matching and graph rewriting for layout composition

**Results**: 97% layout faithfulness, 84% proportional retention on resize

---

### 2. GRIDS - MILP-Based Layout Inference (Aalto University)

**Approach**: Mathematical optimization for grid generation

```python
# Formulate grid inference as Mixed Integer Linear Programming
def solve_grid_layout(elements):
    model = gp.Model("grid_layout")

    # Variables: track sizes, element placements
    track_widths = model.addVars(max_columns, lb=0, name="col_width")
    track_heights = model.addVars(max_rows, lb=0, name="row_height")
    placements = model.addVars(len(elements), max_rows, max_columns, vtype=GRB.BINARY)

    # Constraints: elements must fit in tracks, no overlap
    for i, elem in enumerate(elements):
        # Element width must equal sum of spanned track widths
        model.addConstr(sum(track_widths[c] * placements[i,r,c]
                           for r in range(max_rows)
                           for c in range(max_columns)) >= elem.width)

    # Objective: minimize deviation from original positions
    model.setObjective(sum_position_errors, GRB.MINIMIZE)

    model.optimize()
    return extract_grid_template(model)
```

**Advantages**:

- Mathematically optimal solutions
- Handles complex grid configurations
- Precise track size calculation

**Disadvantages**:

- Computationally expensive
- Requires Gurobi optimizer
- Overkill for simple layouts

---

### 3. UI Semantic Group Detection (arXiv 2024)

**Key Innovation**: Gestalt-based pre-clustering

```typescript
// Apply Gestalt principles before layout detection
interface GestaltAnalysis {
  proximityGroups: Element[][];     // Close elements grouped
  similarityGroups: Element[][];    // Similar-looking elements grouped
  continuityChains: Element[][];    // Elements forming visual lines
  closureGroups: Element[][];       // Elements forming enclosed shapes
}

function applyGestaltPrinciples(elements: Element[]): GestaltAnalysis {
  return {
    proximityGroups: clusterByProximity(elements, distanceThreshold: 20),
    similarityGroups: clusterBySimilarity(elements, sizeVariance: 0.2),
    continuityChains: detectVisualLines(elements),
    closureGroups: detectEnclosures(elements)
  };
}

// Use Gestalt groups to improve grid detection
function detectGridWithGestalt(elements: Element[]): GridResult {
  const gestalt = applyGestaltPrinciples(elements);

  // Only consider similarity groups for grid detection
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

**Approach**: ML-based container type prediction

- Trained on 210K mobile screens (130K iOS + 80K Android)
- Predicts 7 container types including grids
- Uses visual features and spatial relationships

```typescript
interface ContainerPrediction {
  type: "list" | "grid" | "carousel" | "tabs" | "form" | "navigation" | "content";
  confidence: number;
  children: Element[];
}

// ML model input features
interface ScreenFeatures {
  elementBoundingBoxes: Rect[];
  elementTypes: string[];
  visualSimilarities: number[][]; // Pairwise visual similarity
  spatialRelations: AllenRelation[][]; // Pairwise spatial relations
}
```

---

## Algorithm Comparison

### Detection Approaches Summary

| Tool/Research         | Approach          | Flow Detection          | Grid Detection             | Overlap Handling            |
| --------------------- | ----------------- | ----------------------- | -------------------------- | --------------------------- |
| **imgcook**           | Rule-based + ML   | Y-axis overlap grouping | Row/column alignment check | IoU > 0.1 → absolute        |
| **FigmaToCode**       | Metadata-first    | Read Figma Auto Layout  | None (no inference)        | N/A                         |
| **Grida**             | Rules + ML        | Similar to imgcook      | Similar to imgcook         | Similar to imgcook          |
| **Phoenix Codie**     | Rule-based        | Position analysis       | N/A                        | Explicit overlap check      |
| **Allen's Algorithm** | Graph-based       | Interval relations      | Two-phase inference        | Contains/overlaps relations |
| **GRIDS**             | MILP optimization | N/A                     | Mathematical optimization  | Constraint-based            |
| **Screen Parsing**    | ML-based          | ML prediction           | ML prediction              | ML prediction               |

### Strengths and Weaknesses

| Approach           | Strengths                      | Weaknesses                         |
| ------------------ | ------------------------------ | ---------------------------------- |
| **Rule-based**     | Predictable, explainable, fast | Limited flexibility, manual tuning |
| **Metadata-first** | Accurate when metadata exists  | Fails without designer cooperation |
| **ML-based**       | Handles complex patterns       | Requires training data, black box  |
| **MILP**           | Mathematically optimal         | Computationally expensive          |
| **Hybrid**         | Best of both worlds            | Complex implementation             |

---

## Detection Criteria & Thresholds

### Universal Thresholds (Industry Consensus)

```typescript
const LAYOUT_THRESHOLDS = {
  // Axis overlap tolerances
  ROW_GROUPING_TOLERANCE: 2, // px - Y-axis overlap for same row
  COLUMN_GROUPING_TOLERANCE: 2, // px - X-axis overlap for same column

  // Gap analysis
  GAP_VARIANCE_THRESHOLD: 0.2, // 20% - Max coefficient of variation
  GAP_ROUNDING_GRID: 4, // px - Snap gaps to multiples

  // Alignment
  ALIGNMENT_TOLERANCE: 2, // px - Edge alignment detection

  // Size homogeneity
  SIZE_CV_THRESHOLD: 0.2, // 20% - Max size variance for grid

  // Overlap detection
  IOU_OVERLAP_THRESHOLD: 0.1, // 10% - Mark as overlapping
  IOU_SIGNIFICANT_OVERLAP: 0.5, // 50% - Definitely overlapping

  // Confidence thresholds
  MIN_FLOW_CONFIDENCE: 0.3, // Minimum to accept flow layout
  MIN_GRID_CONFIDENCE: 0.6, // Minimum to accept grid layout

  // Element counts
  MIN_GRID_ELEMENTS: 4, // Minimum for grid detection
  MIN_GRID_ROWS: 2, // Minimum rows for grid
  MIN_GRID_COLUMNS: 2, // Minimum columns for grid
};
```

### Gap Rounding Values

```typescript
// Common design system spacing values
const COMMON_GAP_VALUES = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64];

function roundGapToCommon(gap: number): number {
  return COMMON_GAP_VALUES.reduce((prev, curr) =>
    Math.abs(curr - gap) < Math.abs(prev - gap) ? curr : prev,
  );
}
```

---

## Overlap Detection

### IoU (Intersection over Union) Calculation

```typescript
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function calculateIoU(a: Rect, b: Rect): number {
  // Calculate intersection
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = xOverlap * yOverlap;

  // Calculate union
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}
```

### Overlap Classification

```typescript
type OverlapType = "none" | "adjacent" | "partial" | "significant" | "contained";

function classifyOverlap(a: Rect, b: Rect): OverlapType {
  const iou = calculateIoU(a, b);

  if (iou === 0) {
    // Check if adjacent (touching but not overlapping)
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

### Z-Index Inference

```typescript
// When elements overlap, infer z-order from:
// 1. Figma layer order (later = on top)
// 2. Size (smaller elements usually on top)
// 3. Type (text/icons usually on top of backgrounds)

function inferZIndex(elements: Element[]): Map<Element, number> {
  const zIndexMap = new Map<Element, number>();

  // Sort by layer order (Figma provides this)
  const sorted = [...elements].sort((a, b) => a.layerOrder - b.layerOrder);

  sorted.forEach((el, index) => {
    zIndexMap.set(el, index);
  });

  return zIndexMap;
}
```

---

## Implementation Recommendations

### For This Project (Figma-Context-MCP)

Based on the research, here's the recommended algorithm:

#### 1. Pre-filtering: Homogeneity Check (IMPLEMENTED)

```typescript
// Already implemented in detector.ts
export function filterHomogeneousForGrid(
  rects: ElementRect[],
  nodeTypes?: string[],
): ElementRect[] {
  const homogeneity = analyzeHomogeneity(rects, nodeTypes, 0.2);
  return homogeneity.homogeneousElements;
}
```

#### 2. Overlap Detection (TO IMPLEMENT)

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

#### 3. Child Element Style Cleanup (TO IMPLEMENT)

```typescript
function cleanChildStylesForFlexParent(child: SimplifiedNode): void {
  if (child.cssStyles) {
    // Remove position: absolute when parent is flex/grid
    if (child.cssStyles.position === "absolute") {
      delete child.cssStyles.position;
    }

    // Remove left/top (now handled by flex/grid)
    delete child.cssStyles.left;
    delete child.cssStyles.top;

    // Keep width/height for flex items (used by flex-basis)
  }
}

function cleanChildStylesForGridParent(child: SimplifiedNode): void {
  if (child.cssStyles) {
    delete child.cssStyles.position;
    delete child.cssStyles.left;
    delete child.cssStyles.top;

    // Width/height may be redundant if grid tracks define sizes
    // But keep them for explicit sizing
  }
}
```

#### 4. Default Value Removal (TO IMPLEMENT)

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
      continue; // Skip default value
    }
    cleaned[key] = value;
  }

  return cleaned;
}
```

### Complete Detection Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    Layout Detection Pipeline                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   1. INPUT: Array of child elements with absolute coordinates    │
│                            ↓                                      │
│   2. OVERLAP CHECK: Separate overlapping elements                │
│      - IoU > 0.1 → stackedElements (keep absolute)               │
│      - IoU ≤ 0.1 → flowElements (continue analysis)              │
│                            ↓                                      │
│   3. HOMOGENEITY CHECK: Filter similar elements                  │
│      - Size CV < 20% AND same types → homogeneous                │
│      - Mixed sizes/types → heterogeneous                         │
│                            ↓                                      │
│   4. ROW GROUPING: Y-axis overlap (2px tolerance)                │
│      - 1 row → horizontal flex                                   │
│      - Multiple rows → continue                                  │
│                            ↓                                      │
│   5. GRID CHECK (homogeneous only):                              │
│      - rows ≥ 2 AND columns ≥ 2                                  │
│      - Column alignment ≥ 80%                                    │
│      - Confidence ≥ 0.6                                          │
│      → YES: display: grid                                        │
│      → NO: continue                                              │
│                            ↓                                      │
│   6. FLEX DIRECTION:                                             │
│      - Dominant direction by element count                       │
│      - Row if most elements horizontal                           │
│      - Column if most elements vertical                          │
│                            ↓                                      │
│   7. CHILD CLEANUP:                                              │
│      - Remove position: absolute                                 │
│      - Remove left/top                                           │
│      - Remove default CSS values                                 │
│                            ↓                                      │
│   8. OUTPUT: LayoutInfo with clean child styles                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## References

### Academic Papers

1. **"A Layout Inference Algorithm for Graphical User Interfaces"** (2015)

   - [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0950584915001718)
   - [ResearchGate PDF](https://www.researchgate.net/publication/283526120_A_layout_inference_algorithm_for_Graphical_User_Interfaces)
   - Key: Allen's Interval Algebra, 97% layout faithfulness

2. **"GRIDS: Interactive Layout Design with Integer Programming"** (CHI 2020)

   - [Project Page](https://userinterfaces.aalto.fi/grids/)
   - [GitHub](https://github.com/aalto-ui/GRIDS)
   - [Paper PDF](https://acris.aalto.fi/ws/portalfiles/portal/40720569/CHI2020_Dayama_GRIDS.pdf)
   - Authors: Niraj Dayama, Kashyap Todi, Taru Saarelainen, Antti Oulasvirta (Aalto University)

3. **"Screen Parsing: Towards Reverse Engineering of UI Models from Screenshots"** (UIST 2021)

   - [CMU ML Blog](https://blog.ml.cmu.edu/2021/12/10/understanding-user-interfaces-with-screen-parsing/)
   - [Paper PDF](https://www.cs.cmu.edu/~jbigham/pubs/pdfs/2021/screen-parsing.pdf)
   - [ACM Digital Library](https://dl.acm.org/doi/fullHtml/10.1145/3472749.3474763)
   - Authors: Jason Wu, Xiaoyi Zhang, Jeff Nichols, Jeffrey P. Bigham

4. **"UI Semantic Group Detection"** (arXiv 2024) - arXiv:2403.04984v1

5. **"UIHASH: Grid-Based UI Similarity"** - Jun Zeng et al.

### Open Source Projects

1. [FigmaToCode](https://github.com/bernaferrari/FigmaToCode) - Generate responsive pages on HTML, Tailwind, Flutter, SwiftUI
2. [GRIDS](https://github.com/aalto-ui/GRIDS) - MILP-based grid layout generation (Python + Gurobi)
3. [Grida](https://github.com/gridaco/grida) - Design-to-code platform
4. [Yoga](https://github.com/facebook/yoga) - Facebook's cross-platform Flexbox layout engine

### Industry Resources

1. **imgcook (Alibaba)**

   - [Layout Algorithm Blog](https://www.alibabacloud.com/blog/imgcook-3-0-series-layout-algorithm-design-based-code-generation_597856)
   - [How imgcook Works](https://medium.com/imgcook/imgcook-how-are-codes-generated-intelligently-from-design-files-in-alibaba-98ba8e55246d)
   - [100% Accuracy Rate](https://www.alibabacloud.com/blog/imgcook-intelligent-code-generation-from-design-drafts-with-a-100%25-accuracy-rate_598093)

2. **Locofy**

   - [Design Optimiser Docs](https://www.locofy.ai/docs/lightning/design-optimiser/)
   - [Auto Layout to Responsive Code](https://www.locofy.ai/docs/classic/design-structure/responsiveness/auto-layout/)

3. **Anima**

   - [Auto-Flexbox Introduction](https://www.animaapp.com/blog/design-to-code/introducing-auto-flexbox/)
   - [Flexbox from Constraints](https://www.animaapp.com/blog/product-updates/producing-flexbox-responsive-code-based-on-figma-adobe-xd-and-sketch-constraints/)

4. **CSS Standards**

   - [CSS Grid Layout Module Level 1](https://www.w3.org/TR/css-grid-1/) - W3C
   - [CSS Flexible Box Layout](https://www.w3.org/TR/css-flexbox-1/) - W3C
   - [Understanding Layout Algorithms](https://www.joshwcomeau.com/css/understanding-layout-algorithms/) - Josh W. Comeau

5. **Foundational**
   - [Allen's Interval Algebra](https://en.wikipedia.org/wiki/Allen's_interval_algebra) - Wikipedia
   - [Figma Grid Auto-Layout](https://help.figma.com/hc/en-us/articles/31289469907863) - Figma Help
   - [IoU Explained](https://www.v7labs.com/blog/intersection-over-union-guide) - V7 Labs

---

## Appendix: Code Examples

### A. Complete Flow Detection

```typescript
export function detectFlowLayout(elements: Element[]): LayoutInfo {
  // Step 1: Check for overlaps
  const { flowElements, stackedElements } = detectOverlappingElements(elements);

  if (flowElements.length < 2) {
    return { type: "absolute", elements: stackedElements };
  }

  // Step 2: Group into rows
  const rows = groupIntoRows(flowElements, THRESHOLDS.ROW_GROUPING_TOLERANCE);

  // Step 3: Determine direction
  if (rows.length === 1) {
    // Single row = horizontal flex
    const gapAnalysis = analyzeGaps(rows[0], "horizontal");
    return {
      type: "flex",
      direction: "row",
      gap: gapAnalysis.averageGap,
      alignment: detectAlignment(rows[0], "vertical"),
      justifyContent: detectJustifyContent(rows[0], "horizontal"),
    };
  }

  // Step 4: Check for grid (multiple rows)
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

  // Step 5: Fallback to column flex
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

### B. Complete Grid Detection

```typescript
export function detectGridLayout(elements: ElementRect[]): GridAnalysisResult {
  // Step 1: Group into rows
  const rows = groupIntoRows(elements, 2);

  if (rows.length < 2) {
    return { isGrid: false, confidence: 0 };
  }

  // Step 2: Check column count consistency
  const columnCounts = rows.map((r) => r.length);
  const countVariance = coefficientOfVariation(columnCounts);

  if (countVariance > 0.2) {
    return { isGrid: false, confidence: 0 };
  }

  // Step 3: Extract column positions
  const columnPositions = extractColumnPositions(rows);
  const alignmentResult = checkColumnAlignment(columnPositions, 4);

  // Step 4: Calculate gaps
  const columnGaps = calculateColumnGaps(rows);
  const rowGaps = calculateRowGaps(rows);

  // Step 5: Calculate confidence
  let confidence = 0;
  if (rows.length >= 2) confidence += 0.2;
  if (rows.length >= 3) confidence += 0.1;
  if (countVariance < 0.1) confidence += 0.2;
  if (alignmentResult.isAligned) confidence += 0.25;
  if (coefficientOfVariation(columnGaps) < 0.2) confidence += 0.1;
  if (coefficientOfVariation(rowGaps) < 0.2) confidence += 0.1;

  // Step 6: Calculate track sizes
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
