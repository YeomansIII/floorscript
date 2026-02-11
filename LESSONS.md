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

## Architecture Reminders

- **Pipeline order:** Input YAML/JSON → `parseConfig` (Zod validation) → `resolveLayout` (geometry) → `renderSvg` (SVG output)
- **Package dependency:** `cli → render-svg → core`. Always rebuild after changing `core` or `render-svg`.
- **Units are real-world:** All coordinates and dimensions in the resolved geometry are in feet or meters. Conversion to SVG pixels happens only at render time via `TransformContext.scale`.
- **Margin is in plan units:** The `margin` option (default: 4 ft) is in the same units as the plan, not SVG pixels.
