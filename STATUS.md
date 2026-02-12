# FloorScript Implementation Status

**Last updated:** 2026-02-11
**Spec version:** 0.1.0-draft

## Summary

Phase 1 (Core Foundation / MVP) is **complete and tested**. Phase 1.5 (Architecture Improvements) is **complete** — all 9 pre-Phase-2 recommendations implemented. All subsequent phases are either stubbed at the type level or not yet started.

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 1 | Core Foundation (MVP) | **Complete** | 8/8 items |
| 1.5 | Architecture Improvements | **Complete** | 9/9 items |
| 2 | Electrical & Plumbing | Not started | 0/5 items |
| 3 | Renovation & Diffing | Not started | 0/6 items |
| 4 | Validation | Not started | 0/3 items |
| 5 | PDF & Polish | Not started | 0/6 items |

---

## Phase 1: Core Foundation (MVP) — Complete

All Phase 1 deliverables are implemented, tested, and working end-to-end.

### Parser Layer

| Feature | Files | Status |
|---------|-------|--------|
| YAML + JSON config parsing | `packages/core/src/parser/config-parser.ts` | Done |
| Zod schema validation | `packages/core/src/types/config.ts` | Done |
| Imperial dimension parsing (`12ft`, `12ft 6in`, `4ft 3-1/2in`, `33in`) | `packages/core/src/parser/dimension.ts` | Done |
| Metric dimension parsing (`3.5m`, `900mm`) | `packages/core/src/parser/dimension.ts` | Done |
| Bare number passthrough | `packages/core/src/parser/dimension.ts` | Done |

### Layout Resolution

| Feature | Files | Status |
|---------|-------|--------|
| Absolute room positioning via `position: [x, y]` | `packages/core/src/resolver/layout-resolver.ts` | Done |
| Adjacent room positioning via `adjacent_to` | `packages/core/src/resolver/layout-resolver.ts` | Done |
| Adjacency alignment (`start`, `center`, `end`) and offset | `packages/core/src/resolver/layout-resolver.ts` | Done |
| 4-wall generation per room (N/S/E/W) | `packages/core/src/resolver/wall-resolver.ts` | Done |
| Wall thickness defaults (exterior 6in, interior 4.5in imperial; 150mm/100mm metric) | `packages/core/src/resolver/wall-resolver.ts` | Done |
| Wall type classification + line weight assignment | `packages/core/src/resolver/wall-resolver.ts` | Done |
| Door/window position resolution on walls | `packages/core/src/resolver/opening-resolver.ts` | Done |
| Opening gap computation for wall segmentation | `packages/core/src/resolver/opening-resolver.ts` | Done |
| Auto-dimension generation (width below south, height left of west) | `packages/core/src/resolver/dimension-resolver.ts` | Done |
| Plan bounds computation | `packages/core/src/resolver/layout-resolver.ts` | Done |

### SVG Rendering

| Feature | Files | Status |
|---------|-------|--------|
| DOM-free SVG builder | `packages/render-svg/src/svg-document.ts` | Done |
| Y-flip coordinate transform (architectural Y-up to SVG Y-down) | `packages/render-svg/src/coordinate-transform.ts` | Done |
| Wall rectangles (pre-segmented in resolver) | `packages/render-svg/src/renderers/wall-renderer.ts` | Done |
| Door symbols (standard swing + cased-opening) | `packages/render-svg/src/renderers/door-renderer.ts` | Done |
| All 4 swing directions (inward/outward + left/right) | `packages/render-svg/src/renderers/door-renderer.ts` | Done |
| Window symbols | `packages/render-svg/src/renderers/window-renderer.ts` | Done |
| Room labels (centered) | `packages/render-svg/src/renderers/label-renderer.ts` | Done |
| Dimension lines with extension lines, ticks, and text | `packages/render-svg/src/renderers/dimension-renderer.ts` | Done |
| Title block (project metadata, lower-right corner) | `packages/render-svg/src/renderers/title-block-renderer.ts` | Done |
| Fully inline SVG styling (no CSS classes) | `packages/render-svg/src/render-svg.ts` | Done |
| Render options: `--no-dimensions`, `--no-labels`, `--no-title-block`, `--width` | `packages/render-svg/src/render-svg.ts` | Done |

### CLI

| Feature | Files | Status |
|---------|-------|--------|
| `floorscript render <input>` with `--output`, `--plan`, `--width` | `packages/cli/src/commands/render.ts` | Done |
| `floorscript init --template <name>` | `packages/cli/src/commands/init.ts` | Done |
| Template: `single-room` | `packages/cli/src/templates/single-room.ts` | Done |
| Template: `kitchen-reno` | `packages/cli/src/templates/kitchen-reno.ts` | Done |

### Tests

| Test file | Coverage |
|-----------|----------|
| `packages/core/__tests__/config-parser.test.ts` | YAML/JSON parsing, Zod validation, minimal config |
| `packages/core/__tests__/dimension.test.ts` | Imperial/metric string formats, fraction parsing |
| `packages/core/__tests__/layout-resolver.test.ts` | Room bounds, wall geometry, adjacency, openings, dimensions |
| `packages/render-svg/__tests__/integration.test.ts` | End-to-end SVG rendering, render options |
| `packages/render-svg/__tests__/visual-regression.test.ts` | SVG snapshot regression (6 cases) |

**Total: 44 tests across 5 test files (all passing)**

### Examples

| Example | Files |
|---------|-------|
| Single room | `examples/single-room.yaml`, `.svg`, `.png` |
| Kitchen renovation | `examples/kitchen-reno.yaml`, `.svg`, `.png` |
| Multi-room (4 rooms) | `examples/multi-room.yaml`, `.svg` |

### Public API Surface

```typescript
// @floorscript/core
export { parseConfig } from "./parser/config-parser.js";
export { resolveLayout } from "./resolver/layout-resolver.js";
export { parseDimension, formatDimension } from "./parser/dimension.js";
export * from "./types/config.js";
export * from "./types/geometry.js";

// @floorscript/render-svg
export { renderSvg } from "./render-svg.js";
export type { SvgRenderOptions } from "./render-svg.js";
export type { DrawingContext } from "./drawing-context.js";
export { SvgDrawingContext } from "./svg-drawing-context.js";
```

---

## Phase 1.5: Architecture Improvements — Complete

All 9 recommendations from `RECOMMENDATIONS.md` implemented in commit `eee1f6d`. See `PLAN.md` for the detailed implementation plan.

### Geometry Layer Improvements

| Feature | Files | Status |
|---------|-------|--------|
| Wall centerline on `ResolvedOpening` | `geometry.ts`, `opening-resolver.ts` | Done |
| Wall segmentation in resolver (`ResolvedWall.segments`) | `geometry.ts`, `segment-resolver.ts` (new), `layout-resolver.ts`, `wall-resolver.ts` | Done |

### Rendering Improvements

| Feature | Files | Status |
|---------|-------|--------|
| Dynamic margin (3ft default, down from 4ft) | `render-svg.ts` | Done |
| Proportional title block scaling | `title-block-renderer.ts`, `render-svg.ts` | Done |
| Fully inline styling (CSS block removed) | All renderers, `render-svg.ts` | Done |
| DrawingContext abstraction | `drawing-context.ts` (new), `svg-drawing-context.ts` (new), all renderers | Done |
| `n()` utility relocation | `utils.ts` (new), `svg-document.ts`, all renderers | Done |

### Testing & Examples

| Feature | Files | Status |
|---------|-------|--------|
| Visual regression tests (6 snapshot cases) | `visual-regression.test.ts` (new) | Done |
| Multi-room example (4 rooms with adjacency) | `multi-room.yaml`, `multi-room.svg` (new) | Done |

### New Files Created

| File | Purpose |
|------|---------|
| `packages/render-svg/src/utils.ts` | Shared utilities (`n()`, `escapeXml()`) |
| `packages/render-svg/src/drawing-context.ts` | `DrawingContext` interface for renderer abstraction |
| `packages/render-svg/src/svg-drawing-context.ts` | SVG implementation of `DrawingContext` |
| `packages/core/src/resolver/segment-resolver.ts` | Wall segmentation logic (moved from render layer) |
| `packages/render-svg/__tests__/visual-regression.test.ts` | SVG snapshot regression tests |
| `examples/multi-room.yaml` | 4-room floor plan with adjacency |
| `PLAN.md` | Implementation plan for the 9 recommendations |

---

## Phase 2: Electrical & Plumbing — Not Started

**Spec references:** Sections 3.6, 3.7, 3.8, 9.1, 9.2, 9.4

### Current state

Type stubs exist in `packages/core/src/types/config.ts` but use `unknown` for all fields:

```typescript
export interface ElectricalConfig {
  panel?: unknown;
  outlets?: unknown[];
  switches?: unknown[];
  fixtures?: unknown[];
  smoke_detectors?: unknown[];
  runs?: unknown[];
}

export interface PlumbingConfig {
  fixtures?: unknown[];
  supply_runs?: unknown[];
  drain_runs?: unknown[];
  valves?: unknown[];
  water_heater?: unknown;
}

export interface FixtureConfig {
  id?: string;
  type: string;
  position?: DimensionTuple | Dimension;
  width?: Dimension;
  depth?: Dimension;
  outline?: DimensionTuple[];
  status?: ElementStatus;
}
```

The Zod schemas for plans accept these fields as `z.record(z.unknown()).optional()` — they pass through validation without structure enforcement.

### Work needed

| Item | Description | Estimated scope |
|------|-------------|-----------------|
| Electrical Zod schemas | Replace `unknown` types with full schemas matching spec section 3.6 (outlets, switches, fixtures, panels, smoke detectors, runs with circuit grouping) | `config.ts` |
| Plumbing Zod schemas | Replace `unknown` types with full schemas matching spec section 3.7 (fixture types, supply/drain runs, valves, water heater) | `config.ts` |
| Fixture/appliance Zod schemas | Full schemas matching spec section 3.8 (countertop, range, refrigerator, island, cabinets, stairs) | `config.ts` |
| Electrical resolver | Resolve outlet/switch/fixture positions (wall-relative and absolute), compute routing paths | New file in `resolver/` |
| Plumbing resolver | Resolve fixture positions, supply/drain paths | New file in `resolver/` |
| Fixture resolver | Resolve appliance/countertop positions and outlines | New file in `resolver/` |
| Resolved geometry types | Add `ResolvedElectrical`, `ResolvedPlumbing`, `ResolvedFixture` to `geometry.ts` | `geometry.ts` |
| Electrical SVG renderer | ANSI/NECA symbols for outlets, switches, fixtures, panels, detectors, circuit runs | New file in `renderers/` |
| Plumbing SVG renderer | Plumbing symbols per spec section 9.2, supply/drain line rendering | New file in `renderers/` |
| Fixture SVG renderer | Appliance symbols per spec section 9.4 | New file in `renderers/` |
| Layer visibility | Wire `layers` config to control which SVG groups render | `render-svg.ts` |
| Integration into pipeline | Update `resolveLayout` and `renderSvg` to process new element types | `layout-resolver.ts`, `render-svg.ts` |

---

## Phase 3: Renovation & Diffing — Not Started

**Spec references:** Sections 4.1, 4.2, 4.3

### Current state

- `DiffConfig` interface and Zod schema exist (fields: `before`, `after`, `title`, `outputs`)
- `ElementStatus` type (`"existing" | "demolish" | "new"`) is defined and accepted by wall/opening schemas
- The kitchen-reno template includes before/after plans and a `diffs` block
- **No diff engine, no demolition rendering, no status-aware rendering exists**

### Work needed

| Item | Description |
|------|-------------|
| Diff engine | Compare two plans by element ID; classify elements as existing/demolish/new |
| Demolition plan rendering | Dashed lines (stroke-dasharray `8,4`), lighter weight (0.35mm), "X" hatching for demolished elements |
| New construction rendering | Heavier lines, solid fill/poche for new walls |
| Combined overlay | Both states overlaid with visual differentiation |
| Change summary generation | Auto-generated scope-of-work text (LF walls removed/added, relocated fixtures, etc.) |
| Single-plan annotation mode | Render elements differently based on their `status` field |
| CLI `diff` command | `floorscript diff plan.yaml --output-dir ./output` |

---

## Phase 4: Validation — Not Started

**Spec references:** Sections 6.1, 6.2, 6.3

### Current state

No validation module exists. The only validation is Zod schema parsing in the config parser.

### Work needed

| Item | Description |
|------|-------------|
| New package or module | `@floorscript/validate` or `packages/core/src/validator/` |
| Structural validation (errors) | `wall-overlap`, `room-unclosed`, `door-wider-than-wall`, `element-out-of-bounds`, `duplicate-id`, `missing-reference`, `invalid-dimensions` |
| Code compliance checks (warnings) | `gfci-near-water`, `gfci-countertop`, `countertop-outlet-spacing`, `bathroom-outlet`, `smoke-detector-bedrooms`, `co-detector`, `egress-window-bedroom`, `min-room-dimension`, `hallway-width`, `door-clearance`, `stair-width`, `outlet-spacing`, `dedicated-circuits`, `bathroom-circuit` |
| ValidationResult type | `{ errors: ValidationIssue[], warnings: ValidationIssue[], info: ValidationIssue[] }` |
| CLI `validate` command | `floorscript validate plan.yaml` |

---

## Phase 5: PDF & Polish — Not Started

**Spec references:** Sections 5.2, 5.3, 7, 8, 9, 11

### Work needed

| Item | Description |
|------|-------------|
| PDF renderer | New `@floorscript/render-pdf` package using PDFKit; same visual output as SVG |
| Multi-sheet plan sets | Separate sheets for existing, demolition, proposed |
| Scale bar rendering | Graphic scale bar in SVG and PDF |
| North arrow rendering | Standard north arrow symbol |
| Missing templates | `bathroom-reno`, `full-house`, `addition`, `adu`, `basement-finish` (5 of 7 missing) |
| `FloorScript` builder API | Programmatic builder class per spec section 8 |
| CLI `symbols` command | `floorscript symbols --list [electrical|plumbing]` |
| Reusable components | `definitions.components` resolution and instantiation |

---

## Spec Features Parsed but Not Processed

These features are accepted by the config parser (via permissive Zod schemas) but have no effect on resolution or rendering:

| Feature | Config field | Spec section |
|---------|-------------|--------------|
| Layer visibility | `plans[].layers` | 3.10 |
| Standalone wall elements | `plans[].elements` (type: wall) | 3.4 |
| Manual dimensions | `plans[].dimensions` | 3.9 |
| Annotations (text, leader, section-cut) | `plans[].annotations` | 3.9 |
| Reusable components | `definitions.components` | 3.11 |
| Material definitions | `definitions.materials` | 3.2 |
| Shared walls | `shared_walls` | 3.3.2 |
| Element status rendering | `status: demolish | new` on walls/openings | 4.2 |

---

## Spec Modules Not Yet Created

| Module | Spec section | Description |
|--------|-------------|-------------|
| `@floorscript/render-pdf` | 2.1, 5.2 | PDF renderer via PDFKit |
| `@floorscript/validate` | 2.1, 6 | Structural validation + code compliance |
| `@floorscript/symbols` | 2.1, 9 | Standalone symbol library (currently symbols are inline in renderers) |

---

## Door Style Rendering Coverage

The spec defines 8 door styles. Only 2 are rendered with distinct visuals:

| Style | Rendered | Notes |
|-------|----------|-------|
| `standard` | Yes | Line + swing arc |
| `cased-opening` | Yes | Gap with trim marks, no door leaf |
| `double` | No | Falls back to standard |
| `sliding` | No | Falls back to standard |
| `pocket` | No | Falls back to standard |
| `bifold` | No | Falls back to standard |
| `barn` | No | Falls back to standard |
| `french` | No | Falls back to standard |

---

## Git History

| Commit | Description |
|--------|-------------|
| `a1d00ed` | Initial spec and MIT license |
| `af00bce` | Implement FloorScript MVP (full Phase 1) |
| `d923ca1` | Add example floor plan outputs (YAML, SVG, PNG) |
| `43573de` | Add CLAUDE.md with codebase documentation |
| `35b348b` | Add STATUS.md documenting implementation progress |
| `de59c25` | Fix SVG rendering: window alignment, wall weight, font sizes, title block |
| `16cdb9b` | Add LESSONS.md with development notes |
| `57e8e69` | Add RECOMMENDATIONS.md with architecture improvements |
| `eee1f6d` | Implement pre-Phase-2 architecture recommendations (all 9) |
