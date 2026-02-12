# Architecture Recommendations

Improvements to make before starting Phase 2 (Electrical & Plumbing), based on bugs found and patterns observed during Phase 1 rendering fixes.

**Status: All 9 recommendations implemented** (commit `eee1f6d`). See PLAN.md for the implementation plan and actual sequencing used.

---

## High Impact

### 1. Add wall centerline to resolved geometry — DONE

**Problem:** The `opening-resolver.ts` sets `gapStart`/`gapEnd` at the wall rect's edge, not the wall centerline. Every renderer must independently compute the center using wall thickness, wall direction, and Y-flip awareness.

**Implementation:** Added `centerline: LineSegment` to `ResolvedOpening` in `geometry.ts`. The opening resolver now computes the centerline in plan coordinates (using `wallY + thickness/2` for horizontal walls, `wallX + thickness/2` for vertical walls). The window renderer was simplified to use `opening.centerline` directly via `toSvg()` — no more ad-hoc thickness math. The door renderer still uses `gapStart`/`gapEnd` for hinge positioning since its geometry is edge-relative by nature.

**Files changed:** `packages/core/src/types/geometry.ts`, `packages/core/src/resolver/opening-resolver.ts`, `packages/render-svg/src/renderers/window-renderer.ts`

### 2. Move wall segmentation from renderer to resolver — DONE

**Problem:** `wall-renderer.ts` contained `getWallSegments()` — 80 lines of geometry logic splitting wall rectangles around openings. This is layout resolution logic in the render layer.

**Implementation:** Created `packages/core/src/resolver/segment-resolver.ts` with `resolveWallSegments()`. Called from `layout-resolver.ts` as a post-processing step after openings are resolved. Added `segments: Rect[]` to `ResolvedWall` in `geometry.ts`. Wall renderer reduced from ~140 to ~50 lines — just iterates `wall.segments` and draws rectangles.

**Files changed:** `packages/core/src/types/geometry.ts`, `packages/core/src/resolver/segment-resolver.ts` (new), `packages/core/src/resolver/layout-resolver.ts`, `packages/core/src/resolver/wall-resolver.ts`, `packages/render-svg/src/renderers/wall-renderer.ts`

### 3. Add visual regression tests — DONE

**Problem:** Rendering bugs were invisible to existing tests that only check for tag presence.

**Implementation:** Created `packages/render-svg/__tests__/visual-regression.test.ts` with 6 test cases using Vitest's built-in `toMatchSnapshot()` for SVG string comparison. Tests cover: single-room, kitchen-reno existing plan, kitchen-reno proposed plan, multi-room, different SVG widths, and disabled options. Verified the regression net works by intentionally changing `exterior: "#000"` to `exterior: "#111"` — all 6 tests failed as expected.

**Note:** The original plan called for pixel-level comparison via `sharp`/`pixelmatch`, but `sharp` was not available as a test dependency. SVG string snapshots proved effective — they catch any rendering change including attribute ordering, coordinate values, and structural differences.

**Files changed:** `packages/render-svg/__tests__/visual-regression.test.ts` (new), `packages/render-svg/__tests__/__snapshots__/visual-regression.test.ts.snap` (new)

### 4. Add a multi-room example — DONE

**Problem:** Both existing examples were single-room plans. Adjacency, interior/exterior wall differences, and multi-room dimension lines were untested.

**Implementation:** Created `examples/multi-room.yaml` with 4 rooms: Living Room (15x12ft) at origin, Kitchen (12x10ft) adjacent east, Hallway (15x3ft) adjacent south of Living Room, Bathroom (8x6ft) adjacent south of Kitchen. Uses `adjacent_to` with `direction: east` and `direction: south`, mixed wall types, doors, windows, and a cased opening. Rendered to `examples/multi-room.svg`.

**Files changed:** `examples/multi-room.yaml` (new), `examples/multi-room.svg` (new)

---

## Medium Impact

### 5. Compute margin dynamically — DONE

**Problem:** Fixed 4ft margin was ~27% of room width for a 15ft room.

**Implementation:** Changed `DEFAULT_MARGIN` from 4 to 3 in `render-svg.ts`. The value is based on: 2ft dimension line offset + 0.5ft text space + 0.5ft padding = 3ft. The explicit margin option still overrides for callers who need control.

**Files changed:** `packages/render-svg/src/render-svg.ts`

### 6. Scale title block proportionally to SVG width — DONE

**Problem:** Title block used hardcoded pixel dimensions; at `--width 600` it was 58% of SVG width.

**Implementation:** All title block dimensions (width, height, margin, divider position, font sizes, text positions) now scale by `svgWidth / REFERENCE_WIDTH` (where `REFERENCE_WIDTH = 1200`). The `TITLE_BLOCK_RESERVE` in `render-svg.ts` also scales proportionally. Constants are defined as `BASE_*` values at the reference width.

**Files changed:** `packages/render-svg/src/renderers/title-block-renderer.ts`, `packages/render-svg/src/render-svg.ts`

### 7. Consolidate styling approach — DONE

**Problem:** Styles were split across CSS block, inline attributes in some renderers, and mixed approaches.

**Implementation:** Went with Option A (fully inline). Removed the CSS `<style>` block from `render-svg.ts`. Each renderer now sets all its own styles via inline attributes. Wall fills use a `WALL_FILLS` lookup (`exterior: "#000"`, `interior/load-bearing: "#333"`). Door/window renderers use `OPENING_STYLE` constant. Dimension renderer uses `DIM_TEXT_STYLE`. Updated integration test to check for `fill="#000"` instead of `wall-exterior` CSS class.

**Files changed:** `packages/render-svg/src/render-svg.ts`, all 6 renderers, `packages/render-svg/__tests__/integration.test.ts`

---

## Lower Priority

### 8. DrawingContext abstraction — DONE

**Problem:** Every renderer did raw SVG string concatenation.

**Implementation:** Created `packages/render-svg/src/drawing-context.ts` with `DrawingContext` interface (`line`, `rect`, `text`, `arc`, `openGroup`, `closeGroup`, `getOutput`). Created `packages/render-svg/src/svg-drawing-context.ts` with `SvgDrawingContext` implementation. All 6 renderers refactored to accept `DrawingContext` and use method calls instead of string building. `render-svg.ts` creates `SvgDrawingContext` instances for each render call.

**Note:** The interface signature evolved during implementation. Instead of `group(className, fn)` callback style, it uses `openGroup(attrs)`/`closeGroup()` pairs, which are simpler and more natural for sequential rendering. The `arc` method takes `(startX, startY, radius, endX, endY, sweepFlag)` to match SVG arc path semantics directly.

**Files changed:** `packages/render-svg/src/drawing-context.ts` (new), `packages/render-svg/src/svg-drawing-context.ts` (new), `packages/render-svg/src/render-svg.ts`, all 6 renderers

### 9. Relocate the `n()` utility — DONE

**Implementation:** Created `packages/render-svg/src/utils.ts` with `n()` and `escapeXml()`. Updated `svg-document.ts` to import from utils and re-export for backward compatibility. Updated all 6 renderers to import from `../utils.js`.

**Files changed:** `packages/render-svg/src/utils.ts` (new), `packages/render-svg/src/svg-document.ts`, all 6 renderers

---

## Actual Implementation Sequencing

The implementation order differed from the original recommended sequencing to minimize rework:

| Step | Rec # | Item | Rationale for reordering |
|------|-------|------|--------------------------|
| 1 | #9 | `n()` relocation | Done first to avoid double import churn in later steps |
| 2 | #4 | Multi-room example | Stress-tests adjacency before geometry refactors |
| 3 | #1 | Wall centerline | Prevents bug class for Phase 2 renderers |
| 4 | #2 | Wall segmentation | Clean resolver/renderer boundary |
| 5 | #5 | Dynamic margin | Quick rendering improvement |
| 6 | #6 | Title block scaling | Quick rendering improvement |
| 7 | #7 | Style consolidation | Renderers self-contained before snapshot lock |
| 8 | #3 | Visual regression tests | Snapshots generated *after* all visual changes |
| 9 | #8 | DrawingContext | Built on top of self-contained renderers |

Key insight: placing visual regression tests *after* all rendering changes (steps 5-7) avoids constant snapshot regeneration. Placing `n()` relocation *first* avoids touching renderer imports twice.
