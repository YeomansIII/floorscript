# Architecture Recommendations

Improvements to make before starting Phase 2 (Electrical & Plumbing), based on bugs found and patterns observed during Phase 1 rendering fixes.

## High Impact

### 1. Add wall centerline to resolved geometry

**Problem:** The `opening-resolver.ts` sets `gapStart`/`gapEnd` at the wall rect's edge, not the wall centerline. Every renderer must independently compute the center using wall thickness, wall direction, and Y-flip awareness. This led directly to the window misalignment bug and requires asymmetric formulas:

```typescript
// Vertical walls: add half thickness (X is not flipped)
const midX = gapStart.x + wallThick / 2;
// Horizontal walls: subtract half thickness (Y IS flipped)
const midY = gapStart.y - wallThick / 2;
```

The door renderer, cased-opening renderer, and window renderer all compute this independently. Phase 2 adds electrical outlets on walls, plumbing fixtures on walls, etc. — each would need this same error-prone calculation.

**Fix:** Have `opening-resolver.ts` compute and store the wall centerline on `ResolvedOpening`:

```typescript
interface ResolvedOpening {
  // ...existing fields...
  centerline: LineSegment;  // center of wall through the opening, in plan coords
}
```

Renderers would then just transform the centerline with `toSvg()` — no thickness math needed.

**Files:** `packages/core/src/types/geometry.ts`, `packages/core/src/resolver/opening-resolver.ts`

### 2. Move wall segmentation from renderer to resolver

**Problem:** `wall-renderer.ts` contains `getWallSegments()` — 80 lines of geometry logic that splits wall rectangles around openings. This is layout resolution logic living in the render layer. A future PDF renderer would need to duplicate it.

**Fix:** Move segmentation into the resolver so `ResolvedWall` contains pre-split segments:

```typescript
interface ResolvedWall {
  // ...existing fields...
  segments: Rect[];  // wall pieces with openings already cut out
}
```

The wall renderer then just iterates and draws rectangles — zero geometry decisions.

**Files:** `packages/core/src/types/geometry.ts`, `packages/core/src/resolver/wall-resolver.ts` (or a new `segment-resolver.ts`), `packages/render-svg/src/renderers/wall-renderer.ts`

### 3. Add visual regression tests

**Problem:** All four rendering bugs (window alignment, wall stroke inflation, font sizes, title block overlap) were invisible to the existing tests. The integration test checks that SVG output *contains* certain tags — not that the result *looks correct*.

**Fix:** Use sharp (already available via `scripts/svg-to-png.mjs`) to render SVGs to PNG buffers and compare against stored snapshots:

```typescript
// packages/render-svg/__tests__/visual-regression.test.ts
import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const sharp = require("sharp");

it("single-room renders correctly", async () => {
  const svg = renderSvg(resolveLayout(parseConfig(singleRoomYaml)));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  // Compare against stored snapshot (pixel diff with tolerance)
});
```

Options: `jest-image-snapshot`, `pixelmatch`, or a simple buffer hash comparison for exact-match regression detection.

### 4. Add a multi-room example

**Problem:** Both existing examples are single-room plans. The adjacency system (`adjacent_to`), interior/exterior wall thickness differences at room boundaries, and shared wall handling are untested visually.

**Fix:** Add `examples/multi-room.yaml` with 3-4 rooms (e.g., kitchen + dining + hallway + bathroom) using `adjacent_to` positioning. This would expose:
- Wall overlap or gap at room junctions
- Interior vs exterior thickness at adjacency boundaries
- Dimension line collisions between adjacent rooms
- Label positioning in small rooms

This is critical to have *before* Phase 2, since electrical/plumbing elements span across rooms.

---

## Medium Impact

### 5. Compute margin dynamically

**Problem:** The fixed 4ft margin is ~27% of room width for a 15ft room. It creates excessive whitespace.

**Fix:** Compute margin based on what actually needs to fit:

```typescript
const dimOffset = 2;       // dimension line offset from wall
const textSpace = 0.5;     // text above/beside dimension line
const padding = 0.5;       // breathing room
const margin = dimOffset + textSpace + padding; // = 3ft
```

**Files:** `packages/render-svg/src/render-svg.ts` (change `DEFAULT_OPTIONS.margin` or compute it in `renderSvg`)

### 6. Scale title block proportionally to SVG width

**Problem:** The title block uses hardcoded pixel dimensions (350x140). At `--width 600` it's 58% of the SVG width. At `--width 2400` it's tiny. The `TITLE_BLOCK_RESERVE` (160px) is also fixed.

**Fix:** Scale based on a reference width:

```typescript
const scaleFactor = svgWidth / 1200;
const tbWidth = 350 * scaleFactor;
const tbHeight = 140 * scaleFactor;
// Font sizes scale similarly
```

**Files:** `packages/render-svg/src/renderers/title-block-renderer.ts`, `packages/render-svg/src/render-svg.ts`

### 7. Consolidate styling approach

**Problem:** Styles are split across three places:
- CSS string in `render-svg.ts` — wall fills, dimension strokes, font-family
- Inline attributes in label/dimension renderers — font-size, font-weight
- Inline attributes in title-block renderer — stroke-width, font-size

This makes it hard to know where to change styling for any given element.

**Fix:** Pick one approach:
- **Option A (recommended):** Go fully inline. Each renderer sets all its own styles. Remove the CSS block. Renderers are self-contained.
- **Option B:** Go fully CSS. Renderers assign CSS classes only. All styling lives in the CSS string. Requires a way to inject scale-dependent values into CSS (CSS custom properties).

---

## Lower Priority

### 8. Consider a DrawingContext abstraction

**Problem:** Every renderer does raw SVG string concatenation:
```typescript
parts.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>`);
```

**Fix:** A thin drawing interface would reduce boilerplate and enable multiple output backends:

```typescript
interface DrawingContext {
  line(from: Point, to: Point, opts?: StyleOpts): void;
  rect(bounds: Rect, opts?: StyleOpts): void;
  text(position: Point, content: string, opts?: TextOpts): void;
  arc(center: Point, radius: number, startAngle: number, endAngle: number, opts?: StyleOpts): void;
  group(className: string, fn: () => void): void;
}
```

This isn't worth doing now, but becomes high-value the moment Phase 5 (PDF renderer) starts — you'd implement a `PdfDrawingContext` instead of rewriting all geometry-to-output logic.

### 9. Relocate the `n()` utility

The `n()` number-formatting function is exported from `svg-document.ts` but used by all renderers. It's conceptually a utility, not part of the SVG document class. Moving it to a shared `utils.ts` would clarify the import structure.

---

## Recommended Sequencing

| Order | Item | Rationale |
|-------|------|-----------|
| 1 | Multi-room example (#4) | Immediately stress-tests adjacency before building on it |
| 2 | Wall centerline in geometry (#1) | Prevents a class of bugs for all Phase 2 renderers |
| 3 | Wall segmentation in resolver (#2) | Clean resolver/renderer contract before adding more renderers |
| 4 | Visual regression tests (#3) | Prevents regressions as Phase 2 changes pile up |
| 5 | Dynamic margin (#5) | Quick visual improvement |
| 6 | Title block scaling (#6) | Quick robustness fix |
| 7-9 | Style consolidation, DrawingContext, n() relocation | Do when convenient or when Phase 5 starts |
