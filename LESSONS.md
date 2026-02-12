# Lessons Learned

Notes from development and debugging of FloorScript. Intended for contributors and AI agents working on this codebase.

## Coordinate System Pitfalls

### Y-Flip Between Plan and SVG

FloorScript uses architectural convention (Y-up, origin at bottom-left) internally, but SVG uses Y-down (origin at top-left). The `toSvg()` function in `coordinate-transform.ts` handles this:

```
SVG_Y = svgHeight - (plan_Y - planBounds.y + margin) * scale
```

**Consequence:** When computing positions relative to wall thickness in SVG space:
- For **horizontal walls** (south/north): wall thickness extends in the **negative SVG Y** direction (upward on screen) from the gap point. Use `gapStart.y - wallThick/2` to find the center.
- For **vertical walls** (east/west): wall thickness extends in the **positive SVG X** direction (rightward on screen) from the gap point. Use `gapStart.x + wallThick/2` to find the center.

This asymmetry (subtract for Y, add for X) is because the Y-flip reverses the thickness direction for horizontal walls but X stays the same.

### Opening Gap Points

The opening resolver (`opening-resolver.ts`) sets `gapStart` and `gapEnd` at `rect.x` / `rect.y` of the wall — the **edge** of the wall rectangle, not the centerline. For vertical walls, both `gapStart.x` and `gapEnd.x` are identical (the wall's left edge in plan coords). For horizontal walls, both `gapStart.y` and `gapEnd.y` are identical.

This means averaging them (e.g., `(gapStart.x + gapEnd.x) / 2`) gives the **edge**, not the center. You must offset by `wallThickness / 2` to reach the centerline.

## SVG Rendering

### Wall Fill vs. Stroke

Walls are rendered as filled `<rect>` elements representing the actual wall cross-section. Adding both `fill` and `stroke` in the same color causes the wall to appear thicker than its actual dimension because SVG stroke extends outward by `stroke-width / 2` on each side.

**Rule:** Use `fill` only (`stroke: none`) for wall rectangles. The rect geometry already defines the exact physical wall extent.

### Font Size Scaling

Fixed pixel font sizes (e.g., `font-size: 14px`) don't scale with the drawing. A 14px label looks fine on a small plan but becomes unreadable on larger ones.

**Rule:** Define text sizes in plan units (feet/meters) and convert using `scaleValue(size, ctx)`. This ensures text remains proportional to the drawing regardless of plan dimensions. Current values:
- Room labels: `0.5 ft` (~6 inches in plan)
- Dimension text: `0.35 ft` (~4 inches in plan)
- Tick marks: `0.15 ft`
- Text offset from dimension line: `0.25 ft`

### Title Block Positioning

The title block uses fixed pixel dimensions (not scaled to plan units). If placed at `svgHeight - TB_HEIGHT - margin`, it overlaps dimension lines that also occupy the bottom margin area.

**Fix:** Reserve extra SVG height (`TITLE_BLOCK_RESERVE = 160px`) below the drawing area when the title block is enabled. The drawing content uses `ctx.svgHeight` for coordinate transforms (unaffected), while the SVG viewBox uses the expanded `totalHeight`. This puts the title block in dedicated space below all drawing content.

**Important:** Do NOT modify `ctx.svgHeight` to add title block space — it's used by `toSvg()` for the Y-flip calculation, and changing it would shift ALL drawing coordinates.

## Visual Testing Pipeline

There is no browser or GUI in the development environment. To visually verify SVG output:

1. `pnpm build` — rebuild all packages
2. `node packages/cli/dist/index.js render examples/single-room.yaml -o /tmp/test.svg` — generate SVG
3. `node scripts/svg-to-png.mjs /tmp/test.svg /tmp/test.png` — convert to PNG via sharp
4. Read the PNG file to inspect visually

The `scripts/svg-to-png.mjs` script uses `sharp` (installed globally at `/opt/node22/lib/node_modules/`) with density 150 for crisp output. Playwright was attempted first but had issues with page crashes on large SVGs.

## Resolver vs. Renderer Boundary

### Push Geometry Into the Resolver

When geometry logic (splitting walls around openings, computing centerlines, etc.) lives in the renderer, it must be duplicated for each output backend (SVG, PDF, DXF). Move geometry decisions into `@floorscript/core` resolvers so renderers receive pre-computed shapes.

**Example: Wall segmentation.** Originally `wall-renderer.ts` contained 80 lines of `getWallSegments()` logic that split wall rectangles around door/window gaps. Moving this to `segment-resolver.ts` reduced wall-renderer to ~50 lines and means a future PDF renderer gets segments for free.

**Example: Opening centerline.** Instead of each renderer computing `gapStart.y - wallThick/2` (with Y-flip asymmetry), the opening resolver now computes `centerline: LineSegment` in plan coordinates. Renderers just call `toSvg(opening.centerline.start, ctx)`.

**Rule of thumb:** If a renderer needs `wallThickness` or `wallDirection` to compute a position, that computation belongs in the resolver.

### Segment Resolution Depends on Opening Resolution

Wall segments can only be computed *after* openings are resolved, since segments are the wall pieces left between opening gaps. In `layout-resolver.ts`, the call order must be: `resolveWalls()` → `resolveOpenings()` → `resolveWallSegments()`.

## SVG Rendering

### Inline Styles vs. CSS Classes

After experimenting with a mixed approach (CSS block + inline overrides), we consolidated to **fully inline styles**. Each renderer sets all its own SVG attributes. Benefits:
- Each renderer file is self-contained — you can read one file and know exactly how it renders
- No hunting across CSS blocks and inline attributes to understand styling
- Easier to make style values dynamic (e.g., scaling font sizes with plan dimensions)
- SVG output works correctly when embedded in contexts that strip `<style>` blocks

### Proportional Scaling Pattern

Fixed pixel dimensions (title block, margins) don't work across different `--width` values. Use a reference-width scaling pattern:

```typescript
const REFERENCE_WIDTH = 1200;
const BASE_VALUE = 350;  // value at reference width

const scaledValue = BASE_VALUE * (svgWidth / REFERENCE_WIDTH);
```

This is used for: title block dimensions, title block font sizes, title block reserve height. The margin uses plan units (feet) and doesn't need this pattern since it scales naturally through `TransformContext.scale`.

### DrawingContext Design Choices

The `DrawingContext` interface uses `openGroup(attrs)`/`closeGroup()` pairs rather than a `group(className, fn)` callback style. The pair approach is simpler for sequential rendering where groups don't nest arbitrarily.

The `arc()` method signature matches SVG arc path semantics directly: `(startX, startY, radius, endX, endY, sweepFlag)` rather than the more geometric `(center, radius, startAngle, endAngle)`. This avoids angle-to-endpoint conversion in every renderer.

**Attribute ordering caveat:** When migrating from string concatenation to `DrawingContext` method calls, SVG attribute ordering may change (e.g., `fill` before `stroke` vs. after). This is visually identical but breaks string-based snapshot tests. Update snapshots after the migration.

### Wall Fill vs. Stroke

Walls are rendered as filled `<rect>` elements representing the actual wall cross-section. Adding both `fill` and `stroke` in the same color causes the wall to appear thicker than its actual dimension because SVG stroke extends outward by `stroke-width / 2` on each side.

**Rule:** Use `fill` only (`stroke: none`) for wall rectangles. The rect geometry already defines the exact physical wall extent.

### Font Size Scaling

Fixed pixel font sizes (e.g., `font-size: 14px`) don't scale with the drawing. A 14px label looks fine on a small plan but becomes unreadable on larger ones.

**Rule:** Define text sizes in plan units (feet/meters) and convert using `scaleValue(size, ctx)`. This ensures text remains proportional to the drawing regardless of plan dimensions. Current values:
- Room labels: `0.5 ft` (~6 inches in plan)
- Dimension text: `0.35 ft` (~4 inches in plan)
- Tick marks: `0.15 ft`
- Text offset from dimension line: `0.25 ft`

### Title Block Positioning

The title block uses fixed pixel dimensions (not scaled to plan units). If placed at `svgHeight - TB_HEIGHT - margin`, it overlaps dimension lines that also occupy the bottom margin area.

**Fix:** Reserve extra SVG height (`BASE_TITLE_BLOCK_RESERVE = 160px`, scaled proportionally) below the drawing area when the title block is enabled. The drawing content uses `ctx.svgHeight` for coordinate transforms (unaffected), while the SVG viewBox uses the expanded `totalHeight`. This puts the title block in dedicated space below all drawing content.

**Important:** Do NOT modify `ctx.svgHeight` to add title block space — it's used by `toSvg()` for the Y-flip calculation, and changing it would shift ALL drawing coordinates.

## Testing

### Visual Regression via SVG Snapshots

Vitest's built-in `toMatchSnapshot()` works well for SVG regression detection. It catches any change in coordinates, attributes, structure, or styling. No external dependencies needed.

**Trade-off vs. pixel comparison:** SVG snapshots are simpler and catch more types of changes (including attribute ordering), but they're more sensitive — any change requires snapshot update even if visually identical. Pixel comparison (via `sharp`/`pixelmatch`) would allow tolerance for anti-aliasing differences but requires image rendering infrastructure.

**When to update snapshots:** After any intentional rendering change, run `npx vitest run --update` (not `pnpm test -- -u`, which doesn't pass the flag through correctly).

### Snapshot Test Placement

Place visual regression tests *after* all rendering changes in the implementation sequence. Creating snapshots early means regenerating them at every step. In the Phase 1.5 implementation, visual regression tests were step 8 of 9, created after margin changes, title block scaling, and style consolidation were all complete.

## Visual Testing Pipeline

There is no browser or GUI in the development environment. To visually verify SVG output:

1. `pnpm build` — rebuild all packages
2. `node packages/cli/dist/index.js render examples/single-room.yaml -o /tmp/test.svg` — generate SVG
3. `node scripts/svg-to-png.mjs /tmp/test.svg /tmp/test.png` — convert to PNG via sharp
4. Read the PNG file to inspect visually

The `scripts/svg-to-png.mjs` script uses `sharp` (installed globally at `/opt/node22/lib/node_modules/`) with density 150 for crisp output. Playwright was attempted first but had issues with page crashes on large SVGs.

## Coordinate System Pitfalls

### Y-Flip Between Plan and SVG

FloorScript uses architectural convention (Y-up, origin at bottom-left) internally, but SVG uses Y-down (origin at top-left). The `toSvg()` function in `coordinate-transform.ts` handles this:

```
SVG_Y = svgHeight - (plan_Y - planBounds.y + margin) * scale
```

**Consequence:** When computing positions relative to wall thickness in SVG space:
- For **horizontal walls** (south/north): wall thickness extends in the **negative SVG Y** direction (upward on screen) from the gap point. Use `gapStart.y - wallThick/2` to find the center.
- For **vertical walls** (east/west): wall thickness extends in the **positive SVG X** direction (rightward on screen) from the gap point. Use `gapStart.x + wallThick/2` to find the center.

This asymmetry (subtract for Y, add for X) is because the Y-flip reverses the thickness direction for horizontal walls but X stays the same.

**Better approach:** Compute centerlines in plan coordinates (before Y-flip) where the formula is symmetric: `wallPos + thickness/2` for both axes. Then transform with `toSvg()`. This is now implemented via `ResolvedOpening.centerline`.

### Opening Gap Points

The opening resolver (`opening-resolver.ts`) sets `gapStart` and `gapEnd` at `rect.x` / `rect.y` of the wall — the **edge** of the wall rectangle, not the centerline. For vertical walls, both `gapStart.x` and `gapEnd.x` are identical (the wall's left edge in plan coords). For horizontal walls, both `gapStart.y` and `gapEnd.y` are identical.

This means averaging them (e.g., `(gapStart.x + gapEnd.x) / 2`) gives the **edge**, not the center. You must offset by `wallThickness / 2` to reach the centerline. Or better, use the pre-computed `opening.centerline`.

## Architecture Reminders

- **Pipeline order:** Input YAML/JSON → `parseConfig` (Zod validation) → `resolveLayout` (geometry) → `renderSvg` (SVG output)
- **Package dependency:** `cli → render-svg → core`. Always rebuild after changing `core` or `render-svg`.
- **Units are real-world:** All coordinates and dimensions in the resolved geometry are in feet or meters. Conversion to SVG pixels happens only at render time via `TransformContext.scale`.
- **Margin is in plan units:** The `margin` option (default: 3 ft) is in the same units as the plan, not SVG pixels.
- **DrawingContext for future backends:** All renderers accept a `DrawingContext` interface. To add PDF output, implement `PdfDrawingContext` without touching any renderer code.
