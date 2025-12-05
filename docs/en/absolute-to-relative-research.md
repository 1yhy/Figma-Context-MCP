# Absolute Position to Margin/Padding Conversion Research

## Research Overview

This document summarizes industry implementations and academic research on converting absolute positioning (`position: absolute` + `left/top`) to relative layouts (`margin`, `padding`, `gap`).

## 1. Industry Implementations

### 1.1 FigmaToCode (bernaferrari/FigmaToCode)

**Approach**: AltNodes Intermediate Representation

**Key Points**:

- Uses a 4-stage transformation pipeline:

  1. Node Conversion - Figma nodes → JSON with optimizations
  2. Intermediate Representation - JSON → AltNodes (virtual DOM)
  3. Layout Optimization - Detect auto-layouts, responsive constraints
  4. Code Generation - Framework-specific output

- For complex layouts (absolute + auto-layout), makes "intelligent decisions about structure"
- Detects parent-child relationships and z-index ordering
- Uses `insets` for best cases, `left/top` for worst cases

**Source**: https://github.com/bernaferrari/FigmaToCode

### 1.2 Facebook Yoga Layout Engine

**Approach**: CSS Flexbox Implementation in C++

**Padding/Margin Calculation**:

```
paddingAndBorderForAxis = leadingPaddingAndBorder + trailingPaddingAndBorder
marginForAxis = leadingMargin + trailingMargin
```

**Resolution Algorithm**:

- UnitPoint: Direct pixel value
- UnitPercent: `value * parentSize / 100`
- UnitAuto: Returns 0 for margins

**Key Functions**:

- `nodeLeadingPadding()` - Leading edge padding
- `nodeTrailingPadding()` - Trailing edge padding
- `nodeMarginForAxis()` - Total margin for axis
- `resolveValue()` - Unit conversion

**Source**: https://github.com/facebook/yoga

### 1.3 imgcook (Alibaba)

**Approach**: Rule-based + CV-based Layout Algorithm

**Key Points**:

- Converts design layers to flat JSON with absolute positions
- Uses rule-based algorithms to merge adjacent rows/blocks
- CV-based approach for generalization (pixel-level comparison)
- No specific formulas disclosed for margin/padding calculation

**Limitation**: Implementation details not publicly available

**Source**: https://www.alibabacloud.com/blog/imgcook-3-0-series-layout-algorithm-design-based-code-generation_597856

### 1.4 teleportHQ UIDL

**Approach**: Abstract UI Description Language

**Key Points**:

- CSS-like style properties in UIDL
- Design tokens for spacing constants (→ CSS variables)
- Does not appear to handle coordinate-based conversion

**Source**: https://github.com/teleporthq/teleport-code-generators

## 2. Academic Research

### 2.1 Layout Inference Algorithm for GUIs

**Paper**: "A layout inference algorithm for Graphical User Interfaces" (2015)

**Approach**: Two-phase algorithm using Allen's Interval Algebra

**Phase 1: Coordinate → Relative Positioning**

- Change coordinate-based positioning to relative positioning
- Use directed graphs and Allen relations
- Build spatial relationships between elements

**Phase 2: Pattern Matching & Graph Rewriting**

- Apply exploratory algorithm
- Pattern matching to identify layout structures
- Graph rewriting to obtain layout solutions

**Results**:

- 97% faithful to original views
- 84% maintain proportions when resized

**Source**: https://www.sciencedirect.com/science/article/abs/pii/S0950584915001718

### 2.2 Allen's Interval Algebra

**13 Basic Relations** (applicable to spatial layout):

| Relation      | Symbol | Description                                     |
| ------------- | ------ | ----------------------------------------------- |
| Precedes      | p      | A ends before B starts (gap between)            |
| Meets         | m      | A ends exactly where B starts                   |
| Overlaps      | o      | A starts before B, they overlap, B ends after A |
| Finished-by   | F      | B starts during A, ends together                |
| Contains      | D      | A completely contains B                         |
| Starts        | s      | A and B start together, A ends first            |
| Equals        | e      | A and B identical                               |
| Started-by    | S      | B starts when A starts, B ends after            |
| During        | d      | B completely contains A                         |
| Finishes      | f      | A starts during B, ends together                |
| Overlapped-by | O      | B starts before A, they overlap                 |
| Met-by        | M      | A starts exactly where B ends                   |
| Preceded-by   | P      | B ends before A starts (gap between)            |

**Application**: Determine spatial relationships to infer layout structure

**Source**: https://ics.uci.edu/~alspaugh/cls/shr/allen.html

## 3. Key Insights

### 3.1 Padding Inference Formula

When a parent container has children, padding can be inferred:

```
paddingTop = firstChild.y - parent.y
paddingLeft = firstChild.x - parent.x
paddingBottom = (parent.y + parent.height) - (lastChild.y + lastChild.height)
paddingRight = (parent.x + parent.width) - (lastChild.x + lastChild.width)
```

**For Row Layout** (flex-direction: row):

- Sort children by X position
- `paddingLeft` = first child's left offset from parent
- `paddingTop` = minimum top offset among children
- `gap` = consistent spacing between children (already implemented)

**For Column Layout** (flex-direction: column):

- Sort children by Y position
- `paddingTop` = first child's top offset from parent
- `paddingLeft` = minimum left offset among children
- `gap` = consistent spacing between children (already implemented)

### 3.2 Individual Margin Calculation

For elements that don't align perfectly with the primary axis:

```
For Row Layout:
  expectedY = parent.y + paddingTop
  marginTop = child.y - expectedY

For Column Layout:
  expectedX = parent.x + paddingLeft
  marginLeft = child.x - expectedX
```

### 3.3 Cross-Axis Alignment vs Margin

When elements have different cross-axis positions:

**Option A: Use align-items + individual margins**

```css
.parent {
  display: flex;
  align-items: flex-start;
}
.child-offset {
  margin-top: 10px; /* Individual offset */
}
```

**Option B: Use align-items: center/stretch**
If all elements are centered or stretched, no individual margins needed.

### 3.4 Absolute Position Preservation

Some elements MUST keep absolute positioning:

- Overlapping elements (IoU > 0.1)
- Stacked elements (z-index layering)
- Elements outside parent bounds
- Decorative/background elements

## 4. Proposed Algorithm

### Step 1: Classify Elements

```
For each parent with children:
  1. Detect overlapping elements (IoU > 0.1) → Keep absolute
  2. Remaining elements → Flow elements
```

### Step 2: Detect Layout Direction

```
For flow elements:
  1. Analyze horizontal vs vertical distribution
  2. Determine primary axis (row or column)
  3. Calculate gap consistency
```

### Step 3: Calculate Padding

```
If layout detected:
  1. Sort children by primary axis position
  2. paddingStart = first child offset from parent start
  3. paddingEnd = parent end - last child end
  4. Analyze cross-axis for paddingCross
```

### Step 4: Calculate Individual Margins

```
For each flow child:
  1. expectedPosition = based on padding + gap + previous elements
  2. actualPosition = child's current position
  3. If difference > threshold:
     - Add margin to child
```

### Step 5: Clean Up Styles

```
For flow children:
  1. Remove position: absolute
  2. Remove left, top
  3. Add margin if calculated

For parent:
  1. Add padding
  2. Keep gap (already implemented)
  3. Keep display: flex/grid
```

## 5. Implementation Considerations

### 5.1 Edge Cases

1. **Negative margins**: When elements overlap slightly
2. **Mixed alignments**: Some elements centered, others not
3. **Variable gaps**: Elements with inconsistent spacing
4. **Percentage values**: May need to convert px to %

### 5.2 Thresholds

| Parameter             | Recommended Value | Source   |
| --------------------- | ----------------- | -------- |
| Padding detection     | >= 0px            | Standard |
| Gap consistency CV    | <= 20%            | imgcook  |
| Alignment tolerance   | 2px               | Common   |
| Overlap IoU threshold | 0.1               | imgcook  |

### 5.3 Priority Order

1. Grid detection (highest priority for regular grids)
2. Flex detection with padding inference
3. Fall back to absolute positioning

## 6. References

1. **FigmaToCode**: https://github.com/bernaferrari/FigmaToCode
2. **Facebook Yoga**: https://github.com/facebook/yoga
3. **imgcook Blog**: https://www.alibabacloud.com/blog/imgcook-3-0-series-layout-algorithm-design-based-code-generation_597856
4. **Allen's Interval Algebra**: https://en.wikipedia.org/wiki/Allen's_interval_algebra
5. **Layout Inference Paper**: https://www.sciencedirect.com/science/article/abs/pii/S0950584915001718
6. **teleportHQ**: https://github.com/teleporthq/teleport-code-generators
7. **Yoga Go Port**: https://github.com/kjk/flex

## 7. Conclusion

The key insight from industry implementations is that converting absolute positioning to relative layouts requires:

1. **Spatial Analysis**: Use Allen's Interval Algebra or similar to understand element relationships
2. **Padding Inference**: Calculate parent padding from first/last child offsets
3. **Margin Calculation**: Handle individual element offsets that don't fit the primary layout
4. **Selective Preservation**: Keep absolute positioning for genuinely overlapping elements

The algorithm should be conservative - only convert when confident about the layout structure, otherwise preserve absolute positioning for accuracy.
