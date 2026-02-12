# Phase 2: Electrical & Plumbing — Implementation Plan

## Overview

This phase adds electrical and plumbing support to FloorScript: Zod-validated config schemas, geometry resolvers for absolute positioning, and SVG renderers using ANSI/NECA symbol conventions. Layer visibility is wired up so users can toggle electrical/plumbing/structural independently. The multi-room example is extended with electrical and plumbing annotations as the integration test case.

**Guiding principle:** Follow the established patterns exactly — pure-function resolvers, DrawingContext-based renderers, Zod schemas with inferred types, and snapshot-based visual regression tests.

---

## Step 1: Electrical & Plumbing Config Schemas (Zod)

**Files modified:**
- `packages/core/src/types/config.ts`

**What to do:**

Replace the `unknown` stubs in `ElectricalConfig` and `PlumbingConfig` with full Zod schemas matching SPEC.md §3.6–3.7. Also tighten the `LayersConfig` and `PlanSchema` Zod definitions so they validate rather than pass-through.

### 1a. Electrical element types and schemas

Define these types/schemas:

```
OutletType = "duplex" | "gfci" | "240v" | "dedicated" | "floor"
SwitchType = "single" | "three-way" | "four-way" | "dimmer"
LightFixtureType = "recessed" | "surface" | "pendant" | "under-cabinet" | "fan"
DetectorType = "smoke" | "co" | "combo"
```

Schemas to create:

- **`ElectricalPanelSchema`** — `{ position: DimensionTuple, amps: number, label?: string }`
- **`OutletSchema`** — `{ id?: string, type: OutletType, position: DimensionTuple, wall: string, height?: Dimension, circuit?: number, label?: string, status?: ElementStatus }`
- **`SwitchSchema`** — `{ id?: string, type: SwitchType, position: DimensionTuple, wall: string, controls?: string[], circuit?: number, status?: ElementStatus }`
- **`ElectricalFixtureSchema`** — `{ id?: string, type: LightFixtureType, position: DimensionTuple, width?: Dimension, circuit?: number, status?: ElementStatus }`
- **`SmokeDetectorSchema`** — `{ position: DimensionTuple, type: DetectorType }`
- **`ElectricalRunSchema`** — `{ circuit: number, path: DimensionTuple[], style?: "solid" | "dashed" }`
- **`ElectricalSchema`** (replaces the `z.record(z.unknown())` in `PlanSchema`) — combines all above

### 1b. Plumbing element types and schemas

Define these types/schemas:

- **`PlumbingFixtureType`** = `"kitchen-sink" | "bath-sink" | "toilet" | "shower" | "bathtub" | "dishwasher" | "washing-machine" | "water-heater" | "utility-sink" | "hose-bib"`
- **`ValveType`** = `"shutoff" | "pressure-regulator" | "check"`
- **`SupplyType`** = `"hot" | "cold"`

Schemas:

- **`PlumbingFixtureSchema`** — `{ id?: string, type: PlumbingFixtureType, position: DimensionTuple, width?: Dimension, depth?: Dimension, supply?: SupplyType[], drain?: boolean, status?: ElementStatus }`
- **`SupplyRunSchema`** — `{ type: SupplyType, path: DimensionTuple[], size?: string }`
- **`DrainRunSchema`** — `{ path: DimensionTuple[], size?: string, slope?: string }`
- **`ValveSchema`** — `{ type: ValveType, position: DimensionTuple, line?: SupplyType }`
- **`WaterHeaterSchema`** — `{ position: DimensionTuple, type: "tank" | "tankless", capacity?: string }`
- **`PlumbingSchema`** (replaces the `z.record(z.unknown())` in `PlanSchema`) — combines all above

### 1c. Tighten LayersConfig Zod schema

Replace the `z.record(z.unknown())` for `layers` in `PlanSchema` with:
```typescript
const LayerSchema = z.object({
  visible: z.boolean(),
  color_override: z.string().nullable().optional(),
});
const LayersSchema = z.record(z.string(), LayerSchema);
```

### 1d. Update PlanSchema

Replace the pass-through `z.record(z.unknown())` entries for `electrical` and `plumbing` in `PlanSchema` with the new `ElectricalSchema.optional()` and `PlumbingSchema.optional()`.

### 1e. Infer TypeScript interfaces from Zod schemas

Replace the hand-written `ElectricalConfig`, `PlumbingConfig`, and `LayersConfig` interfaces with `z.infer<>` types where possible, or update the interfaces to match the new schemas exactly.

**Tests:** Add validation test cases to `packages/core/__tests__/config-parser.test.ts`:
- Valid electrical config parses without error
- Valid plumbing config parses without error
- Invalid outlet type is rejected
- Invalid plumbing fixture type is rejected
- Layer visibility config validates correctly

---

## Step 2: Resolved Geometry Types for Electrical & Plumbing

**Files modified:**
- `packages/core/src/types/geometry.ts`

**What to add to `geometry.ts`:**

```typescript
// ---- Electrical resolved geometry ----

interface ResolvedElectricalPanel {
  position: Point;
  amps: number;
  label?: string;
}

interface ResolvedOutlet {
  id?: string;
  outletType: OutletType;     // "outletType" to avoid clash with geometry "type"
  position: Point;             // absolute plan coordinates
  wallId: string;              // e.g. "kitchen.south"
  wallDirection: CardinalDirection;
  wallThickness: number;
  circuit?: number;
  label?: string;
}

interface ResolvedSwitch {
  id?: string;
  switchType: SwitchType;
  position: Point;
  wallId: string;
  wallDirection: CardinalDirection;
  wallThickness: number;
  controls?: string[];
  circuit?: number;
}

interface ResolvedLightFixture {
  id?: string;
  fixtureType: LightFixtureType;
  position: Point;             // room-relative → absolute
  width?: number;              // for under-cabinet strips
  circuit?: number;
}

interface ResolvedSmokeDetector {
  position: Point;
  detectorType: DetectorType;
}

interface ResolvedElectricalRun {
  circuit: number;
  path: Point[];               // absolute plan coordinates
  style: "solid" | "dashed";
}

interface ResolvedElectrical {
  panel?: ResolvedElectricalPanel;
  outlets: ResolvedOutlet[];
  switches: ResolvedSwitch[];
  fixtures: ResolvedLightFixture[];
  smokeDetectors: ResolvedSmokeDetector[];
  runs: ResolvedElectricalRun[];
}

// ---- Plumbing resolved geometry ----

interface ResolvedPlumbingFixture {
  id?: string;
  fixtureType: PlumbingFixtureType;
  position: Point;
  width?: number;
  depth?: number;
  supply?: SupplyType[];
  drain?: boolean;
}

interface ResolvedSupplyRun {
  supplyType: SupplyType;
  path: Point[];
  size?: string;
}

interface ResolvedDrainRun {
  path: Point[];
  size?: string;
  slope?: string;
}

interface ResolvedValve {
  valveType: ValveType;
  position: Point;
  line?: SupplyType;
}

interface ResolvedWaterHeater {
  position: Point;
  heaterType: "tank" | "tankless";
  capacity?: string;
}

interface ResolvedPlumbing {
  fixtures: ResolvedPlumbingFixture[];
  supplyRuns: ResolvedSupplyRun[];
  drainRuns: ResolvedDrainRun[];
  valves: ResolvedValve[];
  waterHeater?: ResolvedWaterHeater;
}
```

**Update `ResolvedPlan`:**
```typescript
interface ResolvedPlan {
  // ... existing fields ...
  electrical?: ResolvedElectrical;
  plumbing?: ResolvedPlumbing;
  layers?: LayersConfig;       // pass through for renderer filtering
}
```

---

## Step 3: Electrical Resolver

**Files created:**
- `packages/core/src/resolver/electrical-resolver.ts`

**Files modified:**
- `packages/core/src/resolver/layout-resolver.ts`

### 3a. `electrical-resolver.ts`

Pure function: `resolveElectrical(config: ElectricalConfig, rooms: ResolvedRoom[], units: UnitSystem): ResolvedElectrical`

Logic:
1. **Panel:** Parse `position` DimensionTuple → absolute Point.
2. **Outlets:** For each outlet config:
   - Parse the `wall` field (e.g., `"kitchen.south"`) to find the matching `ResolvedWall` from the rooms list.
   - The outlet `position` field is a DimensionTuple where the first element is the distance along the wall from the wall start (same convention as openings). The second element can be ignored for rendering (it represents height above floor, only relevant for elevation views).
   - Place the outlet on the wall's centerline: for horizontal walls use `wall.rect.y + wall.thickness / 2`, for vertical walls use `wall.rect.x + wall.thickness / 2`.
   - Compute the along-wall absolute position: for south/north walls, `wall.rect.x + offset`; for east/west walls, `wall.rect.y + offset`.
   - Carry through `id`, `outletType`, `circuit`, `label`, `wallId`, `wallDirection`, `wallThickness`.
3. **Switches:** Same wall-lookup and centerline positioning as outlets.
4. **Light fixtures:** These are room-relative (ceiling-mounted). The `position` is plan-absolute (following the same convention as plumbing fixtures — coordinates in the plan coordinate space). Parse the DimensionTuple directly to a Point.
5. **Smoke detectors:** Same as light fixtures (ceiling-mounted, plan-absolute position).
6. **Runs:** Parse each DimensionTuple in the `path` array to absolute Points. Default `style` to `"solid"`.

**Wall lookup helper:** Create a helper function `findWallById(wallRef: string, rooms: ResolvedRoom[]): { room: ResolvedRoom, wall: ResolvedWall }` that parses `"roomId.direction"` and finds the corresponding wall. Throw a descriptive error if the room or wall direction is not found.

### 3b. Wire into `layout-resolver.ts`

After resolving rooms/bounds/dimensions, add:
```typescript
const electrical = plan.electrical
  ? resolveElectrical(plan.electrical, rooms, config.units)
  : undefined;
```

Add `electrical` to the returned `ResolvedPlan`.

**Tests:** Create `packages/core/__tests__/electrical-resolver.test.ts`:
- Outlet placed on south wall at correct centerline position
- Outlet placed on east wall (vertical) at correct centerline position
- Switch placed on a wall with correct positioning
- Light fixture resolves to plan-absolute coordinates
- Run paths resolve correctly
- Invalid wall reference (bad room) throws descriptive error
- Invalid wall reference (bad direction) throws descriptive error
- Panel position resolves correctly

---

## Step 4: Plumbing Resolver

**Files created:**
- `packages/core/src/resolver/plumbing-resolver.ts`

**Files modified:**
- `packages/core/src/resolver/layout-resolver.ts`

### 4a. `plumbing-resolver.ts`

Pure function: `resolvePlumbing(config: PlumbingConfig, rooms: ResolvedRoom[], units: UnitSystem): ResolvedPlumbing`

Logic:
1. **Fixtures:** Plumbing fixtures use plan-absolute `[x, y]` positions. Parse each DimensionTuple to a Point. Parse optional `width` and `depth` dimensions.
2. **Supply runs:** Parse each DimensionTuple in path arrays to Points. Carry through `type` and `size`.
3. **Drain runs:** Parse each DimensionTuple in path arrays to Points. Carry through `size` and `slope`.
4. **Valves:** Parse position DimensionTuple. Carry through `type` and `line`.
5. **Water heater:** Parse position DimensionTuple. Carry through `type` and `capacity`.

Note: Plumbing positions are simpler than electrical — they're all plan-absolute coordinates (no wall-lookup needed).

### 4b. Wire into `layout-resolver.ts`

Same pattern as electrical:
```typescript
const plumbing = plan.plumbing
  ? resolvePlumbing(plan.plumbing, rooms, config.units)
  : undefined;
```

Add `plumbing` and `layers: plan.layers` to the returned `ResolvedPlan`.

**Tests:** Create `packages/core/__tests__/plumbing-resolver.test.ts`:
- Plumbing fixture resolves position from DimensionTuple
- Plumbing fixture resolves width and depth dimensions
- Supply run path resolves all points
- Drain run with slope annotation preserved
- Valve position resolves correctly
- Water heater position, type, and capacity preserved

---

## Step 5: DrawingContext Extensions

**Files modified:**
- `packages/render-svg/src/drawing-context.ts`
- `packages/render-svg/src/svg-drawing-context.ts`

Add three new primitives needed by electrical and plumbing renderers. These are backward-compatible — existing renderers continue working unchanged.

### 5a. New interface methods

```typescript
interface DrawingContext {
  // ... existing methods ...
  circle(cx: number, cy: number, r: number, opts?: StyleOpts): void;
  polyline(points: { x: number; y: number }[], opts?: StyleOpts): void;
  ellipse(cx: number, cy: number, rx: number, ry: number, opts?: StyleOpts): void;
}
```

**Rationale:**
- `circle` — Outlet symbols, detector symbols, water heater, recessed lights are all circles. Currently would require computing arc endpoints for a full circle through the `arc()` method, which is awkward.
- `polyline` — Electrical runs and plumbing supply/drain routes are multi-point paths. Multiple `line()` calls would produce N separate `<line>` elements instead of one clean `<polyline>`.
- `ellipse` — Bath sink (oval) and toilet bowl (elongated oval) symbols.

### 5b. SVG implementation

In `svg-drawing-context.ts`, implement:
- `circle` → `<circle cx="..." cy="..." r="..." .../>`
- `polyline` → `<polyline points="x1,y1 x2,y2 ..." .../>`
- `ellipse` → `<ellipse cx="..." cy="..." rx="..." ry="..." .../>`

Follow the same pattern as existing methods: build attribute string, push to output array, use `n()` for number formatting.

---

## Step 6: Layer Visibility in Render Pipeline

**Files modified:**
- `packages/render-svg/src/render-svg.ts`

### 6a. Add layer visibility to SvgRenderOptions

```typescript
export interface SvgRenderOptions {
  // ... existing options ...
  layers?: Record<string, { visible: boolean; color_override?: string | null }>;
}
```

### 6b. Layer filtering helper

Create a helper in `render-svg.ts`:
```typescript
function isLayerVisible(
  layerName: string,
  plan: ResolvedPlan,
  opts: ResolvedOptions,
): boolean {
  // Render options take precedence over plan-level layers
  const optLayer = opts.layers?.[layerName];
  if (optLayer !== undefined) return optLayer.visible;
  const planLayer = plan.layers?.[layerName];
  if (planLayer !== undefined) return planLayer.visible;
  return true; // visible by default
}
```

### 6c. Wire layer checks into rendering

Wrap render blocks with layer visibility checks:
- `structural` layer → walls + openings
- `labels` layer → room labels (existing `showLabels` boolean still takes precedence for backward compat)
- `dimensions` layer → dimension lines (existing `showDimensions` still takes precedence)
- `electrical` layer → electrical rendering (Step 7)
- `plumbing` layer → plumbing rendering (Step 8)

The existing `showDimensions`, `showLabels`, `showTitleBlock` booleans continue to work as before. For the structural/labels/dimensions layers, the boolean option acts as an override: if the boolean is `false`, the layer is hidden regardless of `layers` config.

---

## Step 7: Electrical Renderers

**Files created:**
- `packages/render-svg/src/renderers/electrical-renderer.ts`

**Files modified:**
- `packages/render-svg/src/render-svg.ts`

### 7a. `electrical-renderer.ts`

All renderers follow the established pattern: take resolved geometry + TransformContext + DrawingContext, draw using `dc` primitives.

**Symbol sizing:** Define `SYMBOL_RADIUS_FT = 0.25` (3 inches in plan units). Use `scaleValue(SYMBOL_RADIUS_FT, ctx)` for consistent SVG-space sizing. Symbols scale with the drawing.

**Functions to implement:**

1. **`renderOutlet(outlet, ctx, dc)`** — ANSI outlet symbol: circle with type-specific marks.
   - `duplex`: Circle + two short horizontal lines extending from circle edge
   - `gfci`: Circle + "GFI" text label below
   - `240v`: Circle + three short diagonal lines
   - `dedicated`: Circle + small triangle
   - `floor`: Circle inside a square

2. **`renderSwitch(sw, ctx, dc)`** — "S" text with type-specific suffix:
   - `single`: "S"
   - `three-way`: "S3"
   - `four-way`: "S4"
   - `dimmer`: "SD"

3. **`renderLightFixture(fixture, ctx, dc)`** — Ceiling-mount symbols:
   - `recessed`: Small circle inside small square
   - `surface`: Circle with 4 short ray lines at 45° angles
   - `pendant`: Circle with short line extending downward
   - `under-cabinet`: Dashed line of specified width
   - `fan`: Circle with 3 blade lines at 120° intervals

4. **`renderSmokeDetector(detector, ctx, dc)`** — Circle with text label:
   - `smoke`: Circle + "SD" text
   - `co`: Circle + "CO" text
   - `combo`: Circle + "S/CO" text

5. **`renderElectricalPanel(panel, ctx, dc)`** — Rectangle with "PANEL" text and amps label below.

6. **`renderElectricalRun(run, ctx, dc)`** — Polyline through path points:
   - `solid` style: solid line
   - `dashed` style: `strokeDasharray: "4 2"`

7. **Top-level `renderElectrical(electrical, ctx, dc)`** — Opens group with `class: "electrical"`, iterates all elements, calls appropriate render function for each.

### 7b. Wire into `render-svg.ts`

After dimension rendering:
```typescript
if (plan.electrical && isLayerVisible("electrical", plan, opts)) {
  const dc = new SvgDrawingContext();
  renderElectrical(plan.electrical, ctx, dc);
  doc.addToLayer("electrical", dc.getOutput());
}
```

---

## Step 8: Plumbing Renderers

**Files created:**
- `packages/render-svg/src/renderers/plumbing-renderer.ts`

**Files modified:**
- `packages/render-svg/src/render-svg.ts`

### 8a. `plumbing-renderer.ts`

**Functions to implement:**

1. **`renderPlumbingFixture(fixture, ctx, dc)`** — Based on `fixtureType`:
   - `kitchen-sink`: Rectangle with vertical dividing line (double basin)
   - `bath-sink`: Ellipse shape
   - `toilet`: Elongated ellipse (bowl) connected to small rectangle (tank)
   - `shower`: Square with small circle (drain) at center
   - `bathtub`: Rectangle with one rounded end (arc)
   - `dishwasher`: Square with "DW" text
   - `washing-machine`: Square with "WM" text
   - `water-heater`: Circle with "WH" text
   - `utility-sink`: Rectangle with "US" text
   - `hose-bib`: Triangle with "HB" text

2. **`renderSupplyRun(run, ctx, dc)`** — Polyline with color coding:
   - Hot: red stroke (`#CC0000`)
   - Cold: blue stroke (`#0000CC`)
   - Size annotation at midpoint if specified

3. **`renderDrainRun(run, ctx, dc)`** — Polyline with green stroke (`#006600`), thicker line weight. Slope annotation at midpoint if present.

4. **`renderValve(valve, ctx, dc)`** — Diamond shape:
   - `shutoff`: Filled diamond
   - `pressure-regulator`: Diamond with "PR" text
   - `check`: Diamond with arrow

5. **`renderWaterHeater(heater, ctx, dc)`** — Circle with "WH" text and capacity annotation.

6. **Top-level `renderPlumbing(plumbing, ctx, dc)`** — Opens group with `class: "plumbing"`, iterates all plumbing elements.

### 8b. Wire into `render-svg.ts`

Same pattern as electrical:
```typescript
if (plan.plumbing && isLayerVisible("plumbing", plan, opts)) {
  const dc = new SvgDrawingContext();
  renderPlumbing(plan.plumbing, ctx, dc);
  doc.addToLayer("plumbing", dc.getOutput());
}
```

---

## Step 9: Extend Multi-Room Example

**Files modified:**
- `examples/multi-room.yaml`

Add electrical and plumbing annotations to the existing multi-room example. This serves as the primary integration test case covering the full pipeline: YAML parse → Zod validate → resolve → render.

Add to the existing `main` plan:

```yaml
electrical:
  panel:
    position: [0.5ft, 11ft]
    amps: 200
    label: "Main Panel"
  outlets:
    - type: duplex
      position: [5ft, 0]
      wall: living.south
      circuit: 1
    - type: gfci
      position: [4ft, 0]
      wall: kitchen.south
      circuit: 2
    - type: duplex
      position: [3ft, 0]
      wall: bathroom.west
      circuit: 3
  switches:
    - type: single
      position: [1ft, 0]
      wall: living.west
      controls: [lr-light-1]
      circuit: 1
    - type: three-way
      position: [1ft, 0]
      wall: kitchen.east
      controls: [k-light-1]
      circuit: 2
  fixtures:
    - id: lr-light-1
      type: recessed
      position: [7.5ft, 6ft]
      circuit: 1
    - id: k-light-1
      type: surface
      position: [21ft, 7ft]
      circuit: 2
  smoke_detectors:
    - position: [7.5ft, 6ft]
      type: combo
  runs:
    - circuit: 1
      path: [[0.5ft, 11ft], [0.5ft, 6ft], [7.5ft, 6ft]]
      style: solid
    - circuit: 2
      path: [[0.5ft, 11ft], [21ft, 11ft], [21ft, 7ft]]
      style: solid

plumbing:
  fixtures:
    - id: bath-toilet
      type: toilet
      position: [2ft, -4.5ft]
      width: 18in
      depth: 28in
    - id: bath-sink
      type: bath-sink
      position: [5ft, -4.5ft]
      width: 20in
      depth: 18in
  supply_runs:
    - type: cold
      path: [[5ft, -4.5ft], [5ft, -2ft]]
      size: "1/2in"
    - type: hot
      path: [[5.5ft, -4.5ft], [5.5ft, -2ft]]
      size: "1/2in"
  drain_runs:
    - path: [[2ft, -4.5ft], [2ft, -6ft]]
      size: "3in"

layers:
  structural:
    visible: true
  electrical:
    visible: true
  plumbing:
    visible: true
  dimensions:
    visible: true
```

(Exact positions will be adjusted during implementation to align with resolved room geometry.)

---

## Step 10: Tests

### 10a. Unit tests for resolvers

**Files created:**
- `packages/core/__tests__/electrical-resolver.test.ts`
- `packages/core/__tests__/plumbing-resolver.test.ts`

Test cases are described in Steps 3 and 4.

### 10b. Config parser tests

**Files modified:**
- `packages/core/__tests__/config-parser.test.ts`

Add validation tests for the new electrical and plumbing schemas.

### 10c. Integration test

**Files modified:**
- `packages/render-svg/__tests__/integration.test.ts`

Add a test that loads the updated multi-room example, resolves layout, renders SVG, and verifies the output contains electrical and plumbing layer groups (`<g class="layer-electrical">`, `<g class="layer-plumbing">`).

### 10d. Visual regression snapshots

**Files modified:**
- `packages/render-svg/__tests__/visual-regression.test.ts`

The existing multi-room snapshot will need updating (`pnpm test -- -u`) since the example now includes electrical/plumbing content. Add two additional test cases:
- Multi-room with electrical layer hidden via `layers` option → verify no electrical content in output
- Multi-room with plumbing layer hidden via `layers` option → verify no plumbing content in output

This validates that layer visibility correctly excludes content from the SVG output.

---

## Step 11: Exports & Build Verification

**Files potentially modified:**
- `packages/core/src/index.ts` — New types auto-export via existing `export *` from geometry.ts and config.ts
- `packages/core/src/types/config.ts` — Verify new type aliases are exported (OutletType, SwitchType, etc.)

**Verification commands:**
```bash
pnpm build        # Build all packages — must pass clean
pnpm typecheck    # Type-check all packages — no errors
pnpm test         # Run all tests (update snapshots with -u for intentional changes)
```

---

## Implementation Order

The steps are ordered by dependency:

| Order | Step | Description | Depends on |
|-------|------|-------------|------------|
| 1 | Step 1 | Zod schemas for electrical, plumbing, layers | — |
| 2 | Step 2 | Resolved geometry types | Step 1 (type imports) |
| 3 | Step 5 | DrawingContext extensions (circle, polyline, ellipse) | — |
| 4 | Step 3 | Electrical resolver | Steps 1, 2 |
| 5 | Step 4 | Plumbing resolver | Steps 1, 2 |
| 6 | Step 6 | Layer visibility in render pipeline | Step 2 (ResolvedPlan.layers) |
| 7 | Step 7 | Electrical renderers | Steps 3, 5, 6 |
| 8 | Step 8 | Plumbing renderers | Steps 4, 5, 6 |
| 9 | Step 9 | Extend multi-room example | Steps 1, 7, 8 |
| 10 | Step 10 | Tests (unit + integration + visual regression) | All above |
| 11 | Step 11 | Exports & build verification | All above |

---

## Files Summary

### New files (6)
| File | Description |
|------|-------------|
| `packages/core/src/resolver/electrical-resolver.ts` | Resolves electrical config to absolute geometry |
| `packages/core/src/resolver/plumbing-resolver.ts` | Resolves plumbing config to absolute geometry |
| `packages/render-svg/src/renderers/electrical-renderer.ts` | SVG rendering of electrical symbols and runs |
| `packages/render-svg/src/renderers/plumbing-renderer.ts` | SVG rendering of plumbing fixtures and pipes |
| `packages/core/__tests__/electrical-resolver.test.ts` | Unit tests for electrical resolver |
| `packages/core/__tests__/plumbing-resolver.test.ts` | Unit tests for plumbing resolver |

### Modified files (9)
| File | Changes |
|------|---------|
| `packages/core/src/types/config.ts` | Full Zod schemas replacing `unknown` stubs |
| `packages/core/src/types/geometry.ts` | New resolved geometry interfaces |
| `packages/core/src/resolver/layout-resolver.ts` | Wire in electrical + plumbing resolvers, pass layers |
| `packages/render-svg/src/drawing-context.ts` | Add circle, polyline, ellipse methods |
| `packages/render-svg/src/svg-drawing-context.ts` | Implement new drawing primitives |
| `packages/render-svg/src/render-svg.ts` | Layer visibility + electrical/plumbing render calls |
| `examples/multi-room.yaml` | Add electrical + plumbing annotations |
| `packages/core/__tests__/config-parser.test.ts` | Schema validation test cases |
| `packages/render-svg/__tests__/visual-regression.test.ts` | Layer visibility test cases |

---

## Risk Areas

1. **Wall reference parsing** (`"kitchen.south"`) — New addressing pattern for electrical elements. Needs robust error messages when rooms or wall directions aren't found. Should validate at resolve time, not render time.

2. **Coordinate systems** — Three different coordinate conventions in play:
   - Outlets/switches: wall-relative (distance along wall) → absolute via wall geometry
   - Light fixtures/detectors: plan-absolute coordinates
   - Plumbing fixtures: plan-absolute coordinates
   Each resolver must handle its coordinate space correctly.

3. **Symbol scaling** — Symbols must be legible at different `width` options (600px–2400px). Using `scaleValue()` with plan-unit constants (e.g., 0.25ft radius) ensures proportional scaling, but constants may need tuning during visual review.

4. **Snapshot churn** — Adding electrical/plumbing to the multi-room example invalidates its existing snapshot. This is expected — update with `pnpm test -- -u`. Existing single-room and kitchen-reno snapshots should be unaffected.

5. **DrawingContext backward compatibility** — Adding `circle()`, `polyline()`, `ellipse()` to the interface requires implementing them in `SvgDrawingContext`. No other implementations exist today, so this is safe. If external consumers have implemented the interface, they'd need to add these methods — but the package is pre-1.0 and this is expected.
