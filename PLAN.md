# Implementation Plan: Pre-Phase-2 Architecture Recommendations

This plan implements the 9 recommendations from `RECOMMENDATIONS.md`. The sequencing differs from the original document to minimize rework — specifically, `n()` relocation is done first to avoid double import churn, and visual regression tests are done *after* all rendering changes so snapshots don't need constant regeneration.

---

## Step 1: Relocate `n()` Utility (#9 from RECOMMENDATIONS.md)

**Rationale:** Trivial change, but every subsequent step that touches renderers (steps 4, 5, 6, 7, 8) would modify the same import lines. Doing this first means we only update renderer imports once.

### Changes

**New file: `packages/render-svg/src/utils.ts`**

Move `n()` and `escapeXml()` from `svg-document.ts` to a shared utilities module.

**`packages/render-svg/src/svg-document.ts`**

- Remove `n()` and `escapeXml()` definitions
- Import from `./utils.js`

**All renderers that import `n` from `../svg-document.js`:**

Update imports to `../utils.js`:
- `wall-renderer.ts`
- `door-renderer.ts`
- `window-renderer.ts`
- `dimension-renderer.ts`
- `label-renderer.ts`
- `title-block-renderer.ts`

### Verification

- `pnpm build` — clean build, no import errors
- `pnpm test` — all tests pass

---

## Step 2: Add Multi-Room Example (#4)

**Rationale:** Stress-tests adjacency, interior/exterior wall differences, and dimension collisions before we refactor the geometry layer. Establishes a visual baseline for the more complex case.

### Changes

**New file: `examples/multi-room.yaml`**

Create a 4-room floor plan using `adjacent_to` positioning:
- Living Room (15ft x 12ft) at origin, all exterior walls
- Kitchen (12ft x 10ft) adjacent east of Living Room, exterior N/E, interior S/W walls, cased opening on W wall
- Hallway (3ft x 10ft) adjacent south of Kitchen, interior walls, door on N wall
- Bathroom (8ft x 6ft) adjacent south of Living Room, exterior S/W, interior N/E walls, door on N wall, window on S wall

This covers:
- `adjacent_to` with `direction: east` and `direction: south`
- `alignment: start`, `center`, `end` options
- Interior vs exterior wall type differences at boundaries
- Multiple openings (doors, windows) across rooms
- A narrow room (hallway) to test label positioning

### Verification

- `pnpm build && node packages/cli/dist/index.js render examples/multi-room.yaml -o examples/multi-room.svg`
- Visually inspect that rooms are adjacent with no gaps or overlaps
- Interior walls between rooms are thinner than exterior walls
- Dimension lines don't collide across rooms

---

## Step 3: Add Wall Centerline to Resolved Geometry (#1)

**Rationale:** Prevents a class of bugs for all Phase 2 renderers (electrical outlets on walls, plumbing fixtures on walls, etc.). Currently every renderer independently computes wall center with error-prone direction-dependent formulas.

### Changes

**`packages/core/src/types/geometry.ts`**

Add `centerline` field to `ResolvedOpening`:

```typescript
interface ResolvedOpening {
  // ...existing fields...
  centerline: LineSegment;  // wall centerline through the opening, in plan coords
}
```

**`packages/core/src/resolver/opening-resolver.ts`**

Compute the centerline when resolving each opening:
- For horizontal walls (south/north): centerline runs from `(gapStart.x, wallY + thickness/2)` to `(gapEnd.x, wallY + thickness/2)`
- For vertical walls (east/west): centerline runs from `(wallX + thickness/2, gapStart.y)` to `(wallX + thickness/2, gapEnd.y)`

Store in the returned `ResolvedOpening` object.

**`packages/render-svg/src/renderers/window-renderer.ts`**

Replace ad-hoc wall center calculation:
```typescript
// Before: const midY = gapStart.y - wallThick / 2;
// After:  const midY = opening.centerline.start.y;
```

Remove dependence on `wallThickness` and direction-specific formulas.

**`packages/render-svg/src/renderers/door-renderer.ts`**

Replace inline center calculations with `opening.centerline` usage where applicable. The door renderer needs the wall centerline to position hinge points and arcs correctly.

### Verification

- `pnpm test` — all existing tests pass (update layout-resolver tests to assert `centerline` field)
- `pnpm build && node packages/cli/dist/index.js render examples/single-room.yaml -o /tmp/test.svg` — visual output unchanged
- Same for `multi-room.yaml` and `kitchen-reno.yaml`

---

## Step 4: Move Wall Segmentation from Renderer to Resolver (#2)

**Rationale:** Clean resolver/renderer contract before adding more renderers (PDF, electrical, plumbing). Currently `wall-renderer.ts` contains 80 lines of geometry logic that would need duplication.

### Changes

**`packages/core/src/types/geometry.ts`**

Add `segments` field to `ResolvedWall`:

```typescript
interface ResolvedWall {
  // ...existing fields...
  segments: Rect[];  // wall pieces with openings already cut out
}
```

**New file: `packages/core/src/resolver/segment-resolver.ts`**

Move the `getWallSegments()` logic from `wall-renderer.ts` to a new resolver module. This is called from `layout-resolver.ts` as a post-processing step after both walls and openings are resolved (since segments depend on resolved openings). The function:
- Sorts openings by position along the wall
- Splits the wall rect into segments around gaps
- Filters segments with dimension > 0.1

**`packages/core/src/resolver/layout-resolver.ts`**

After resolving openings for each wall, call segment resolution to populate `wall.segments`.

**`packages/render-svg/src/renderers/wall-renderer.ts`**

- Remove `getWallSegments()` function entirely
- Simplify `renderWall()` to just iterate `wall.segments` and draw rectangles
- This reduces wall-renderer from ~140 lines to ~40 lines

### Verification

- `pnpm test` — all existing tests pass (update layout-resolver tests to assert `segments` field)
- `pnpm build` — clean build
- Visual output identical for all three examples

---

## Step 5: Compute Margin Dynamically (#5)

**Rationale:** Fixed 4ft margin is ~27% of room width for a 15ft room — excessive whitespace.

### Changes

**`packages/render-svg/src/render-svg.ts`**

Replace `DEFAULT_OPTIONS.margin = 4` with a computed value:

```typescript
function computeMargin(plan: ResolvedPlan): number {
  const dimOffset = 2;      // dimension line offset from wall
  const textSpace = 0.5;    // text height above dimension line
  const padding = 0.5;      // breathing room
  return dimOffset + textSpace + padding; // = 3ft
}
```

Use this as the default when `options.margin` is not explicitly provided. The explicit margin option still overrides for callers who need control.

### Verification

- `pnpm test` — update integration tests that may assert SVG dimensions (viewBox will change)
- Visual comparison: rooms should have less whitespace padding, dimension lines still fully visible

---

## Step 6: Scale Title Block Proportionally (#6)

**Rationale:** Title block uses hardcoded 350x140px. At `--width 600` it's 58% of SVG width; at `--width 2400` it's tiny.

### Changes

**`packages/render-svg/src/renderers/title-block-renderer.ts`**

Replace hardcoded constants with scaled values:

```typescript
const REFERENCE_WIDTH = 1200;
const scaleFactor = svgWidth / REFERENCE_WIDTH;

const tbWidth = 350 * scaleFactor;
const tbHeight = 140 * scaleFactor;
const tbMargin = 20 * scaleFactor;
```

Scale all font sizes and internal positioning proportionally.

The `TransformContext` already contains `svgWidth`, so no new parameter plumbing is needed.

**`packages/render-svg/src/render-svg.ts`**

Replace fixed `TITLE_BLOCK_RESERVE = 160` with a scaled value:

```typescript
const titleBlockReserve = 160 * (svgWidth / 1200);
```

### Verification

- Render at `--width 600`, `--width 1200`, `--width 2400` — title block proportional in all cases
- `pnpm test` — update integration test SVG assertions if needed

---

## Step 7: Consolidate Styling Approach (#7)

**Rationale:** Styles split across CSS block and inline attributes make it unclear where to change styling for any element.

### Changes

**Approach: Go fully inline (Option A from recommendations)**

**`packages/render-svg/src/render-svg.ts`**
- Remove the CSS `<style>` block that sets `.wall-exterior`, `.wall-interior`, `.opening`, `.dimension`, `.label` styles

**`packages/render-svg/src/renderers/wall-renderer.ts`**
- Add inline `fill` attribute to wall rectangles (`fill="#000"` for exterior, `fill="#333"` for interior)

**`packages/render-svg/src/renderers/door-renderer.ts`** and **`window-renderer.ts`**
- Add inline `stroke` and `stroke-width` attributes

**`packages/render-svg/src/renderers/dimension-renderer.ts`**
- Add inline `stroke`, `stroke-width`, `font-size`, `font-family` attributes

**`packages/render-svg/src/renderers/label-renderer.ts`**
- Add inline `font-family`, `font-size`, `fill` attributes

**`packages/render-svg/src/renderers/title-block-renderer.ts`**
- Already mostly inline; remove any remaining CSS class dependencies

Each renderer becomes fully self-contained — you can read one file and know exactly how it renders.

### Verification

- Visual output identical before and after (diff SVG output, ignoring `<style>` removal)
- `pnpm test` — update integration tests that assert CSS class presence to check structural elements or inline styles instead

---

## Step 8: Add Visual Regression Tests (#3)

**Rationale:** This is deliberately placed *after* all rendering changes (margin, title block, styling) so that snapshots are generated once against the final rendering output. Placing tests earlier would require snapshot regeneration at every step. Going forward, these tests lock down the visual output as a gate for Phase 2.

### Changes

**New file: `packages/render-svg/__tests__/visual-regression.test.ts`**

Create snapshot-based visual regression tests:
1. For each example YAML (single-room, kitchen-reno, multi-room):
   - Parse config, resolve layout, render SVG
   - Use `sharp` to convert SVG buffer to PNG buffer
   - Compare against stored reference PNG using `pixelmatch`
   - Allow a small pixel tolerance (e.g., 0.1% different pixels) for anti-aliasing differences

2. Reference images stored at `packages/render-svg/__tests__/snapshots/`

**New dev dependencies:**
- `pixelmatch` — pixel-level image comparison
- `pngjs` — PNG encode/decode for pixelmatch input

(`sharp` is already available in the environment.)

**Test structure:**
```typescript
describe("visual regression", () => {
  it("single-room matches snapshot", async () => { ... });
  it("kitchen-reno matches snapshot", async () => { ... });
  it("multi-room matches snapshot", async () => { ... });
});
```

**New script: `scripts/update-snapshots.mjs`**
Regenerates all reference PNGs. Run after intentional visual changes.

### Verification

- `pnpm test` — visual regression tests pass against newly generated snapshots
- Intentionally break a renderer (e.g., change wall fill color), confirm test fails

---

## Step 9: DrawingContext Abstraction (#8) — Lower Priority

**Rationale:** Becomes high-value when Phase 5 (PDF) starts. Low urgency now, but benefits from the styling consolidation done in Step 7 (renderers are already self-contained).

### Changes

**New file: `packages/render-svg/src/drawing-context.ts`**

Define a thin drawing interface:

```typescript
export interface DrawingContext {
  line(from: Point, to: Point, opts?: StyleOpts): void;
  rect(bounds: Rect, opts?: StyleOpts): void;
  text(position: Point, content: string, opts?: TextOpts): void;
  arc(center: Point, radius: number, startAngle: number, endAngle: number, opts?: StyleOpts): void;
  group(className: string, fn: () => void): void;
}
```

**New file: `packages/render-svg/src/svg-drawing-context.ts`**

Implement `DrawingContext` for SVG output. Uses `n()` from `utils.ts` and SVG string building internally.

**Refactor each renderer:**
- Accept `DrawingContext` instead of directly building SVG strings
- Replace `parts.push(\`<line ...>\`)` calls with `ctx.line(from, to, opts)`
- Mechanical refactor — behavior unchanged

**Note:** Can be done incrementally (one renderer at a time) if preferred.

### Verification

- `pnpm test` — all tests pass
- Visual output identical
- Future: a `PdfDrawingContext` can be created for Phase 5 without touching renderers

---

## Implementation Order Summary

| Step | Rec # | Recommendation | Priority | Rationale for ordering |
|------|-------|---------------|----------|----------------------|
| 1 | #9 | Relocate `n()` utility | Lower | Trivial; avoids double import churn in later steps |
| 2 | #4 | Multi-room example | High | Stress-tests adjacency before geometry refactors |
| 3 | #1 | Wall centerline in geometry | High | Prevents bug class for Phase 2 renderers |
| 4 | #2 | Wall segmentation in resolver | High | Clean resolver/renderer boundary |
| 5 | #5 | Dynamic margin | Medium | Quick rendering improvement |
| 6 | #6 | Title block scaling | Medium | Quick rendering improvement |
| 7 | #7 | Style consolidation | Medium | All renderers self-contained |
| 8 | #3 | Visual regression tests | High | Locks down rendering *after* all visual changes |
| 9 | #8 | DrawingContext abstraction | Lower | Deferred until Phase 5 or done incrementally |

**Critical path for Phase 2:** Steps 1-4 and 8 (the geometry refactors + visual regression gate).
**Nice-to-have before Phase 2:** Steps 5-7 (rendering polish).
**Deferrable:** Step 9 (DrawingContext).
