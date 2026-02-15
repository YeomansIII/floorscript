# Contract: Dimension Renderer API

**Feature**: 004-smart-dimensions
**Package**: `@floorscript/render-svg`
**File**: `packages/render-svg/src/renderers/dimension-renderer.ts`

## Public Functions

### renderChainDimension (replaces renderDimension)

Renders a `DimensionChain` with extension lines, tick marks at each segment junction, and per-segment text labels. Handles both multi-segment chains (building edges) and single-segment chains (individual room edges) uniformly.

```typescript
export function renderChainDimension(
  chain: DimensionChain,
  ctx: TransformContext,
  dc: DrawingContext,
): void;
```

**Renders**:
1. **Extension lines**: From wall edge to dimension baseline at each segment boundary (shared at junctions)
2. **Dimension baseline**: Continuous line from first segment start to last segment end
3. **Tick marks**: 45-degree slashes at each extension line intersection with baseline
4. **Segment text**: Formatted dimension label centered on each segment (or outside for narrow segments)

**Extension line rendering**:
- Start at `wallEdgeCoord + EXTENSION_GAP` (gap from wall)
- End at `baselineCoord + EXTENSION_OVERSHOOT` (overshoot past baseline)
- Perpendicular to the dimension baseline

**Narrow segment handling**:
- If `segment.textFits === false`, text is placed outside the extension lines
- Text shifted past segment end along the baseline
- Dimension line extends from segment endpoint to text position

**Single-segment chains** (individual room dimensions): Rendered identically to the old `renderDimension()` behavior — baseline, two tick marks, centered text — but now with proper extension lines added.

**SVG structure**:
```xml
<g class="chain-dimension" stroke="#555" stroke-width="0.18mm">
  <!-- Extension lines -->
  <line class="extension" ... />
  <!-- Dimension baseline -->
  <line class="baseline" ... />
  <!-- Tick marks -->
  <line class="tick" ... />
  <!-- Segment labels -->
  <text class="dim-text" ... >12'-0"</text>
</g>
```

---

## Rendering Pipeline Integration

### render-svg.ts changes

```typescript
// Single loop over all dimensions (chains and individuals are the same type)
for (const chain of plan.dimensions) {
  renderChainDimension(chain, ctx, dc);
}
```

Rendered into the `"dimensions"` layer group, controlled by `showDimensions` option and layer visibility.

The old `renderDimension()` function and its `ResolvedDimension` import are removed.

---

## Margin Calculation

`DEFAULT_MARGIN` updates to account for lane 1 dimensions:
- Current: `3` (2ft offset + 0.5ft text + 0.5ft padding)
- Updated: `5` (3.5ft lane 1 offset + 0.5ft text + 0.5ft overshoot + 0.5ft padding)

This ensures outer-lane dimensions are not clipped by the SVG viewBox.
