# FloorScript Specification

**Version:** 0.1.0-draft
**Date:** 2026-02-11
**Status:** Draft

## 1. Overview

FloorScript is a TypeScript library and CLI tool that enables programmatic generation of architectural floor plans from structured configuration. It is designed primarily for LLM AI agents to produce permit-ready residential floor plans, kitchen/bath renovation documents (with before/after diffing), and basic electrical and plumbing layouts.

There is no existing "floor plan as code" DSL in the ecosystem today. FloorScript fills this gap — analogous to what Mermaid did for diagrams or Terraform did for infrastructure.

### 1.1 Design Principles

1. **LLM-first** — Simple, forgiving API surface with good defaults. An AI agent should be able to generate a valid floor plan config without specialized training.
2. **Text-based and diffable** — All input is JSON/YAML configuration. Floor plans live in version control.
3. **Architecturally correct by default** — Standard line weights, symbol conventions, and drawing practices are built in, not user-configured.
4. **Renovation as a first-class concept** — Before/after states, automatic demolition plan generation, and change summaries are core features, not afterthoughts.
5. **Explicit coordinates with smart helpers** — Precise control when needed, convenience functions to avoid manual coordinate math.

### 1.2 Prior Art

| Tool | Language | Approach | Limitations FloorScript Addresses |
|------|----------|----------|-----------------------------------|
| [renovation](https://github.com/Nikolay-Lysenko/renovation) | Python/YAML | YAML config → matplotlib PNG/PDF | No room model, no SVG, no validation, no diffing, manual coordinates only |
| [Maker.js](https://maker.js.org/) | JS/TS | Parametric 2D vector library | General-purpose, no architectural domain knowledge |
| [Archilogic SDK](https://developers.archilogic.com/) | JS/TS | Floor plan viewer/interaction | Visualization only, requires their platform |
| [FloorspaceJS](https://nrel.github.io/floorspace.js/) | JS | 2D geometry editor | Energy modeling focus, not permit drawings |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Input Layer                        │
│  JSON config ─┐                                     │
│  YAML config ─┼──▶ Parser ──▶ FloorPlan Model (AST) │
│  TS API ──────┘                                     │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                 Processing Layer                     │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ Layout   │  │ Validator │  │ Diff Engine      │  │
│  │ Resolver │  │ / Linter  │  │ (before/after)   │  │
│  └──────────┘  └───────────┘  └──────────────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                 Render Layer                         │
│  ┌─────────┐  ┌─────────┐  ┌──────────────────────┐ │
│  │   SVG   │  │   PDF   │  │  Future: DXF, PNG    │ │
│  │ Renderer│  │ Renderer│  │  Renderers           │ │
│  └─────────┘  └─────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 2.1 Core Modules

| Module | Responsibility |
|--------|---------------|
| `@floorscript/core` | Model types, parser, layout resolver, diff engine |
| `@floorscript/render-svg` | SVG output renderer (via `DrawingContext` abstraction) |
| `@floorscript/render-pdf` | PDF output renderer (via PDFKit + `DrawingContext`) |
| `@floorscript/validate` | Code compliance checks and structural validation |
| `@floorscript/cli` | CLI tool for file-based workflows |
| `@floorscript/symbols` | Standard architectural symbol library (electrical, plumbing, fixtures) |

---

## 3. Input Format

FloorScript accepts JSON or YAML configuration. Both are equivalent — JSON is more natural for LLM output, YAML is more readable for humans. The examples below use YAML for readability.

### 3.1 Top-Level Structure

```yaml
version: "0.1"

project:
  title: "Kitchen Renovation - 123 Main St"
  address: "123 Main Street, Anytown, ST 12345"
  owner: "Jane Smith"
  date: "2026-02-11"
  sheet: "A1"
  scale: "1/4in = 1ft"       # default residential scale

units: imperial               # "imperial" (feet/inches) or "metric" (meters)

# Shared definitions referenced by name
definitions:
  components: { ... }         # reusable element groups
  materials: { ... }          # wall/floor material definitions

# The floor plan(s)
plans:
  - id: existing
    title: "Existing Floor Plan"
    layers: { ... }
    rooms: [ ... ]
    elements: [ ... ]

  - id: proposed
    title: "Proposed Floor Plan"
    layers: { ... }
    rooms: [ ... ]
    elements: [ ... ]

# Optional: auto-generate diff plans from two plan IDs
diffs:
  - before: existing
    after: proposed
    title: "Demolition & Construction Plan"
```

### 3.2 Units and Coordinate System

- **Origin:** Bottom-left corner of the drawing area (architectural convention: Y increases upward).
- **Imperial units:** Specified as feet with decimal or fractional inches: `12ft`, `12ft 6in`, `12.5ft`, `4ft 3.5in`.
- **Metric units:** Specified in meters: `3.5m`, `0.9m`.
- **Angles:** Degrees, counterclockwise from the positive X-axis (east). `0` = east, `90` = north, `180` = west, `270` = south.
- **Scale:** Applies only at render time. All coordinates are in real-world units.

String shorthand for dimensions:

```yaml
# All equivalent ways to express 12 feet 6 inches:
width: "12ft 6in"
width: "12.5ft"
width: 12.5          # bare number = default unit (ft or m based on `units`)
```

### 3.3 Rooms

Rooms are the primary organizational unit. A room defines an enclosed space with walls, and elements (doors, windows, fixtures) are placed relative to rooms or walls.

```yaml
rooms:
  - id: kitchen
    label: "Kitchen"
    position: [0, 0]           # bottom-left corner of the room
    width: 12ft
    height: 10ft               # "height" = depth in plan view
    walls:
      north:
        thickness: 6in          # default: 4.5in for interior, 6in for exterior
        type: exterior
      south:
        thickness: 4.5in
        type: interior
      east:
        thickness: 4.5in
        type: interior
        openings:
          - type: door
            position: 5ft       # distance from wall start (left/bottom)
            width: 3ft
            style: standard     # standard, sliding, pocket, bifold, cased-opening
            swing: inward-left  # inward-left, inward-right, outward-left, outward-right
      west:
        thickness: 6in
        type: exterior
        openings:
          - type: window
            position: 3ft
            width: 4ft
            sill_height: 3ft    # for elevation reference; optional on plan

  - id: dining
    label: "Dining Room"
    position: [12ft, 0]         # adjacent to kitchen's east wall
    width: 14ft
    height: 10ft
    # ...
```

#### 3.3.1 Room Positioning Helpers

Instead of absolute coordinates, rooms can reference other rooms:

```yaml
rooms:
  - id: kitchen
    label: "Kitchen"
    position: [0, 0]
    width: 12ft
    height: 10ft

  - id: dining
    label: "Dining Room"
    adjacent_to:
      room: kitchen
      wall: east               # place dining room against kitchen's east wall
      alignment: start         # start, center, end — align along shared wall
    width: 14ft
    height: 10ft

  - id: pantry
    label: "Pantry"
    adjacent_to:
      room: kitchen
      wall: north
      offset: 2ft              # offset from alignment point
      alignment: end
    width: 4ft
    height: 6ft
```

#### 3.3.2 Shared Walls

When two rooms are adjacent, their shared wall is automatically merged. The thicker wall wins by default, or it can be explicit:

```yaml
shared_walls:
  - rooms: [kitchen, dining]
    wall: east/west            # kitchen's east = dining's west
    thickness: 4.5in
    openings:
      - type: cased-opening
        position: 2ft
        width: 6ft
```

### 3.4 Walls

Walls can also be defined independently of rooms for irregular layouts:

```yaml
elements:
  - type: wall
    start: [0, 0]
    end: [15ft, 0]
    thickness: 6in
    wall_type: exterior        # exterior, interior, load-bearing
    material: frame            # frame, masonry, concrete — affects hatching
```

### 3.5 Doors and Windows

When defined as wall openings (section 3.3), doors and windows inherit their wall's position. They can also be standalone:

```yaml
elements:
  - type: door
    wall: kitchen.east         # reference: room.wall
    position: 5ft
    width: 3ft
    style: standard
    swing: inward-left

  - type: window
    wall: kitchen.west
    position: 3ft
    width: 4ft
    style: double-hung         # double-hung, casement, sliding, fixed, awning
```

**Door styles:** `standard`, `double`, `sliding`, `pocket`, `bifold`, `barn`, `french`, `cased-opening`

**Door swing notation:** `{direction}-{hinge-side}` where direction is `inward`/`outward` relative to the room the door belongs to, and hinge-side is `left`/`right` when facing the door from outside the room.

### 3.6 Electrical Elements

#### 3.6.1 Symbols (Placement)

```yaml
electrical:
  panel:
    position: [0.5ft, 8ft]
    amps: 200
    label: "Main Panel"

  outlets:
    - id: k-out-1
      type: duplex              # duplex, gfci, 240v, dedicated, floor
      position: [2ft, 0.5ft]
      wall: kitchen.south
      height: 18in              # height above floor (for elevation ref)
      circuit: 1

    - type: gfci
      position: [4ft, 0.5ft]
      wall: kitchen.south
      circuit: 2
      label: "Countertop"

  switches:
    - type: single              # single, three-way, four-way, dimmer
      position: [0.5ft, 0.5ft]
      wall: kitchen.east
      controls: [k-light-1]     # IDs of fixtures this switch controls
      circuit: 1

    - type: three-way
      position: [11.5ft, 0.5ft]
      wall: kitchen.east
      controls: [k-light-1]
      circuit: 1

  fixtures:
    - id: k-light-1
      type: recessed            # recessed, surface, pendant, under-cabinet, fan
      position: [6ft, 5ft]
      circuit: 1

    - type: under-cabinet
      position: [3ft, 9.5ft]
      width: 6ft
      circuit: 2

  smoke_detectors:
    - position: [6ft, 5ft]
      type: combo               # smoke, co, combo

  # Basic routing lines showing circuit runs
  runs:
    - circuit: 1
      path: [[0.5ft, 8ft], [0.5ft, 5ft], [6ft, 5ft]]
      style: solid              # solid, dashed (for existing)
    - circuit: 2
      path: [[0.5ft, 8ft], [0.5ft, 9.5ft], [3ft, 9.5ft]]
```

#### 3.6.2 Circuit Summary Table

FloorScript auto-generates a circuit summary from the electrical elements:

| Circuit | Breaker | Description | Outlets | Fixtures |
|---------|---------|-------------|---------|----------|
| 1 | 20A | Kitchen general | k-out-1 | k-light-1 |
| 2 | 20A GFCI | Kitchen countertop | gfci-1 | under-cab-1 |

### 3.7 Plumbing Elements

#### 3.7.1 Fixtures

```yaml
plumbing:
  fixtures:
    - id: k-sink
      type: kitchen-sink        # kitchen-sink, bath-sink, toilet, shower, bathtub,
      position: [6ft, 9.5ft]   # utility-sink, washing-machine, dishwasher,
      width: 33in               # water-heater, hose-bib
      depth: 22in
      supply: [hot, cold]       # hot, cold, or both
      drain: true

    - id: k-dw
      type: dishwasher
      position: [8ft, 9.5ft]
      width: 24in
      supply: [hot]
      drain: true

  # Water supply routing
  supply_runs:
    - type: hot                 # hot, cold
      path: [[0ft, 5ft], [6ft, 5ft], [6ft, 9.5ft]]
      size: "1/2in"
    - type: cold
      path: [[0.5ft, 5ft], [6ft, 5ft], [6ft, 9.5ft]]
      size: "1/2in"

  # Drain/waste/vent routing
  drain_runs:
    - path: [[6ft, 9.5ft], [6ft, 0ft]]
      size: "2in"
      slope: "1/4in per ft"     # optional annotation

  # Shutoff valves
  valves:
    - type: shutoff             # shutoff, pressure-regulator, check
      position: [6ft, 9ft]
      line: hot

  water_heater:
    position: [0.5ft, 0.5ft]
    type: tank                  # tank, tankless
    capacity: "50gal"
```

#### 3.7.2 Plumbing Symbol Types

| Symbol | Description |
|--------|-------------|
| `kitchen-sink` | Rectangle with single/double basin |
| `bath-sink` | Oval with faucet marks |
| `toilet` | Elongated oval with tank rectangle |
| `shower` | Square with drain mark |
| `bathtub` | Rectangle with rounded end |
| `water-heater` | Circle with "WH" label |
| `dishwasher` | Square with "DW" label |
| `washing-machine` | Square with "WM" label |
| `hose-bib` | Triangle with "HB" label |
| `utility-sink` | Rectangle with "US" label |
| `shutoff` | Diamond on pipe line |
| `cleanout` | Circle with "CO" label |

### 3.8 Fixtures and Appliances

Non-plumbing fixtures placed in the plan:

```yaml
fixtures:
  - type: countertop
    outline: [[2ft, 9ft], [10ft, 9ft], [10ft, 10ft], [2ft, 10ft]]
    # or shorthand:
    position: [2ft, 9ft]
    width: 8ft
    depth: 25in

  - type: range                  # range, refrigerator, oven, microwave, island
    position: [4ft, 9.5ft]
    width: 30in
    depth: 25in

  - type: refrigerator
    position: [0.5ft, 9ft]
    width: 36in
    depth: 30in

  - type: island
    position: [4ft, 4ft]
    width: 6ft
    depth: 3ft
```

### 3.9 Dimensions and Annotations

```yaml
dimensions:
  # Automatic: FloorScript auto-generates room dimensions from the room model.
  # Additional manual dimensions can be added:
  - from: [0, 0]
    to: [12ft, 0]
    offset: -2ft               # offset from the measured line for readability
    label: "12'-0\""           # auto-generated if omitted

  # Chain dimensions (continuous series)
  - chain:
      baseline_y: -1.5ft
      points: [0, 4ft, 8ft, 12ft]
      # Produces: |--4'-0"--|--4'-0"--|--4'-0"--|

annotations:
  - type: text
    position: [6ft, 5ft]
    text: "Open to above"
    font_size: 10

  - type: leader               # arrow pointing to something with a note
    from: [8ft, 3ft]
    to: [6ft, 5ft]
    text: "New beam above"

  - type: section-cut           # section cut line with reference
    start: [0, 5ft]
    end: [12ft, 5ft]
    label: "A"
    direction: north            # which direction the section looks
```

### 3.10 Layers

Elements are organized into layers that can be independently toggled:

```yaml
layers:
  structural:
    visible: true
    elements: [walls, doors, windows, rooms]
  electrical:
    visible: true
    color_override: null        # optional: force all elements to a color
  plumbing:
    visible: true
  dimensions:
    visible: true
  fixtures:
    visible: true
  annotations:
    visible: true
  furniture:
    visible: false              # hidden by default
```

### 3.11 Reusable Components

Named groups of elements that can be referenced across plans:

```yaml
definitions:
  components:
    standard-bathroom:
      elements:
        - type: toilet
          position: [0.5ft, 0.5ft]
        - type: bath-sink
          position: [3ft, 0.5ft]
        - type: bathtub
          position: [0.5ft, 3ft]
          width: 5ft
          depth: 30in
        - type: gfci
          position: [3ft, 3.5ft]
          wall: north
          circuit: auto

# Usage in a room:
rooms:
  - id: bathroom
    label: "Bathroom"
    position: [15ft, 0]
    width: 8ft
    height: 5ft
    use_component:
      name: standard-bathroom
      offset: [0.5ft, 0.5ft]   # offset within the room
```

---

## 4. Renovation Diffing

FloorScript supports two approaches to renovation documentation, which can be used independently or together.

### 4.1 Two-Plan Diff (Recommended for Full Renovations)

Define `existing` and `proposed` as separate complete plans. FloorScript computes the diff and auto-generates:

1. **Existing Conditions Plan** — the "before" plan rendered with standard conventions.
2. **Demolition Plan** — existing plan with removed elements highlighted (dashed lines, lighter weight, "X" hatching).
3. **Proposed Plan** — the "after" plan with new elements highlighted (heavier lines, filled wall poche).
4. **Combined Overlay** — both states overlaid with visual differentiation.

```yaml
plans:
  - id: existing
    title: "Existing Conditions"
    rooms: [ ... ]
    elements: [ ... ]

  - id: proposed
    title: "Proposed Floor Plan"
    rooms: [ ... ]
    elements: [ ... ]

diffs:
  - before: existing
    after: proposed
    title: "Demolition & New Construction"
    outputs:
      - demolition              # shows existing with removals marked
      - construction            # shows proposed with new work marked
      - combined                # overlay of both states
      - summary                 # text summary of changes
```

The diff engine compares elements by `id`. Elements with matching IDs are compared for changes. Elements in `before` but not `after` are demolition. Elements in `after` but not `before` are new construction.

### 4.2 Annotated Single Plan (For Simple Changes)

For minor renovations, elements can be tagged directly:

```yaml
rooms:
  - id: kitchen
    label: "Kitchen"
    position: [0, 0]
    width: 12ft
    height: 10ft
    walls:
      east:
        status: demolish         # existing (default), demolish, new
        thickness: 4.5in
      # ...

elements:
  - type: wall
    start: [8ft, 0]
    end: [8ft, 10ft]
    thickness: 4.5in
    status: new
```

**Status values:**
- `existing` (default) — solid lines, unfilled walls
- `demolish` — dashed lines, lighter weight, "X" hatching or screened gray
- `new` — solid lines, filled/hatched wall poche, heavier weight

### 4.3 Change Summary

FloorScript auto-generates a scope-of-work summary from the diff:

```
Scope of Work:
- Remove 12 LF interior wall between kitchen and dining room
- Add 8 LF interior wall at new pantry
- Relocate kitchen sink from south wall to island
- Add 4 new GFCI outlets on kitchen countertop circuit
- Add 6 recessed light fixtures in kitchen
- Re-route hot/cold supply to island sink location
```

---

## 5. Rendering

### 5.1 SVG Output

The primary output format. SVG is generated with:

- **Semantic structure:** Elements are grouped by layer using `<g>` elements with class names (`class="layer-structural"`, `class="room"`, `class="wall-exterior"`).
- **Architectural line weights:** Mapped to `stroke-width` values at the configured scale.
- **Standard symbols:** Defined as `<defs>` / `<symbol>` blocks and instantiated with `<use>`.
- **Dimensions:** Rendered with proper extension lines, tick marks, and text.
- **Title block:** Rendered in the bottom-right corner with project metadata.
- **North arrow:** Rendered in the top-right corner.
- **Scale bar:** Graphic scale bar plus text scale notation.

Line weight mapping (at 1/4" = 1'-0" scale):

| Element | stroke-width |
|---------|-------------|
| Walls cut in plan (exterior) | 0.7mm |
| Walls cut in plan (interior) | 0.5mm |
| Doors, windows, openings | 0.35mm |
| Fixtures, appliances | 0.25mm |
| Dimension lines, text, leaders | 0.18mm |
| Electrical/plumbing routing | 0.25mm |
| Grid lines, hidden elements | 0.13mm |

Line type mapping:

| Pattern | SVG `stroke-dasharray` | Use |
|---------|----------------------|-----|
| Solid | none | Visible walls, edges |
| Dashed | `8,4` | Hidden elements, demolition |
| Dash-dot | `8,3,2,3` | Center lines |
| Dotted | `2,4` | Grid lines, projected |

### 5.2 PDF Output

Generated via PDFKit with:

- Exact same visual output as SVG, converted to PDF vector graphics.
- Configurable page size (default: ARCH D, 24"×36" for residential).
- Proper margins and title block placement.
- Multi-page support for plan sets (existing, demolition, proposed on separate sheets).
- Print-at-scale support with crop marks.

### 5.3 Rendering Options

```yaml
render:
  svg:
    width: 1200                # pixel width (SVG viewBox)
    background: white
    include_grid: false
    interactive: false          # if true, adds CSS classes for hover/click styling

  pdf:
    page_size: "ARCH-D"        # ARCH-D, ANSI-D, A1, A2, letter, tabloid
    orientation: landscape
    margins: 0.5in
    title_block: true
    scale_bar: true
    north_arrow: true
```

---

## 6. Validation and Linting

FloorScript validates plans at two levels.

### 6.1 Structural Validation (Errors)

These are errors that prevent a valid floor plan from being generated:

| Check | Description |
|-------|-------------|
| `wall-overlap` | Walls overlap in a way that creates ambiguous geometry |
| `room-unclosed` | Room walls do not form a closed polygon |
| `door-wider-than-wall` | Door/opening width exceeds the wall segment length |
| `element-out-of-bounds` | Element placed outside any room or drawing boundary |
| `duplicate-id` | Two elements share the same ID |
| `missing-reference` | Element references a room/wall/element that does not exist |
| `invalid-dimensions` | Negative or zero dimensions |

### 6.2 Code Compliance Checks (Warnings)

These are warnings based on common residential building code requirements (IRC/NEC). They do not prevent rendering but alert the user to potential permit issues:

| Check | Code Reference | Description |
|-------|---------------|-------------|
| `gfci-near-water` | NEC 210.8 | Outlets within 6ft of a water source must be GFCI |
| `gfci-countertop` | NEC 210.8(A)(6) | Kitchen countertop outlets must be GFCI |
| `countertop-outlet-spacing` | NEC 210.52(C) | No point on countertop should be more than 24in from an outlet |
| `bathroom-outlet` | NEC 210.52(D) | Bathrooms require at least one GFCI outlet |
| `smoke-detector-bedrooms` | IRC R314 | Smoke detectors required in each bedroom and hallway |
| `co-detector` | IRC R315 | CO detectors required on each level with fuel-burning appliances |
| `egress-window-bedroom` | IRC R310 | Bedrooms require an egress window (min 5.7 sq ft, 24in min height, 20in min width) |
| `min-room-dimension` | IRC R304 | Habitable rooms must be at least 7ft in any dimension |
| `min-ceiling-height` | IRC R305 | Habitable rooms must have 7ft min ceiling height (noted but not enforced in plan view) |
| `hallway-width` | IRC R311.6 | Hallways must be at least 3ft wide |
| `door-clearance` | IRC R311.2 | Required egress doors must be at least 32in clear width |
| `stair-width` | IRC R311.7 | Stairs must be at least 36in wide |
| `outlet-spacing` | NEC 210.52(A) | No point on a wall should be more than 6ft from an outlet |
| `dedicated-circuits` | NEC 210.11(C) | Kitchen requires two 20A small-appliance circuits; laundry requires one 20A circuit |
| `bathroom-circuit` | NEC 210.11(C)(3) | Bathroom requires dedicated 20A circuit |

### 6.3 Validation Output

```typescript
interface ValidationResult {
  errors: ValidationIssue[];    // must fix — plan cannot render correctly
  warnings: ValidationIssue[];  // should fix — potential code violations
  info: ValidationIssue[];      // suggestions and best practices
}

interface ValidationIssue {
  code: string;                 // e.g., "gfci-near-water"
  severity: "error" | "warning" | "info";
  message: string;              // human-readable description
  element_id?: string;          // the element that triggered the issue
  room_id?: string;             // the room context
  suggestion?: string;          // how to fix it
}
```

---

## 7. CLI Interface

```bash
# Render a floor plan from config
floorscript render plan.yaml --output plan.svg
floorscript render plan.yaml --output plan.pdf
floorscript render plan.yaml --output-dir ./output  # all formats

# Validate without rendering
floorscript validate plan.yaml

# Generate diff outputs from a config with before/after plans
floorscript diff plan.yaml --output-dir ./output

# Generate scope-of-work summary from diff
floorscript diff plan.yaml --summary

# Initialize a new plan from a template
floorscript init --template kitchen-reno > plan.yaml
floorscript init --template single-room > plan.yaml
floorscript init --template full-house > plan.yaml

# Show available fixture/symbol types
floorscript symbols --list
floorscript symbols --list electrical
floorscript symbols --list plumbing
```

---

## 8. TypeScript API

For programmatic use (e.g., integration into an LLM tool pipeline):

```typescript
import { FloorScript, parse, render, validate, diff } from "floorscript";

// Parse from JSON/YAML string
const plan = parse(yamlString);

// Or build programmatically
const plan = FloorScript.create({
  project: {
    title: "Kitchen Renovation",
    address: "123 Main St",
    scale: "1/4in = 1ft",
  },
  units: "imperial",
});

plan.addRoom({
  id: "kitchen",
  label: "Kitchen",
  position: [0, 0],
  width: "12ft",
  height: "10ft",
  walls: {
    north: { type: "exterior", thickness: "6in" },
    south: { type: "interior" },
    east: {
      type: "interior",
      openings: [
        { type: "door", position: "5ft", width: "3ft", swing: "inward-left" },
      ],
    },
    west: { type: "exterior" },
  },
});

plan.addElectrical({
  outlets: [
    { type: "gfci", wall: "kitchen.south", position: "2ft", circuit: 1 },
  ],
});

// Validate
const issues = validate(plan);

// Render
const svg = render(plan, { format: "svg" });
const pdf = render(plan, { format: "pdf" });

// Diff two plans
const diffResult = diff(existingPlan, proposedPlan);
const demolitionSvg = render(diffResult.demolition, { format: "svg" });
const summaryText = diffResult.summary();
```

---

## 9. Symbol Library

FloorScript includes a standard symbol library following ANSI/NECA conventions. Symbols are rendered at appropriate sizes relative to the drawing scale.

### 9.1 Electrical Symbols

| Symbol ID | Visual | Description |
|-----------|--------|-------------|
| `outlet-duplex` | ⊙ with 2 lines | Standard 120V duplex outlet |
| `outlet-gfci` | ⊙ "GFI" | Ground fault circuit interrupter |
| `outlet-240v` | ⊙ with special mark | 240V outlet (dryer, range) |
| `outlet-dedicated` | ⊙▲ | Dedicated circuit outlet |
| `outlet-floor` | ⊙ in square | Floor-mounted outlet |
| `switch-single` | S | Single-pole switch |
| `switch-three-way` | S₃ | Three-way switch |
| `switch-four-way` | S₄ | Four-way switch |
| `switch-dimmer` | S_D | Dimmer switch |
| `light-recessed` | ⊙ in square | Recessed ceiling light |
| `light-surface` | ⊙ with rays | Surface-mounted ceiling light |
| `light-pendant` | ⊙ with line | Pendant/hanging light |
| `light-under-cabinet` | dashed line | Under-cabinet light strip |
| `light-fan` | ⊙ with blades | Ceiling fan with light |
| `smoke-detector` | SD in ⊙ | Smoke detector |
| `co-detector` | CO in ⊙ | Carbon monoxide detector |
| `smoke-co-combo` | S/CO in ⊙ | Combination smoke/CO detector |
| `panel` | rectangle "PANEL" | Electrical panel |

### 9.2 Plumbing Symbols

| Symbol ID | Visual | Description |
|-----------|--------|-------------|
| `kitchen-sink` | rectangle with basin | Kitchen sink (single or double) |
| `bath-sink` | oval with faucet marks | Bathroom sink / lavatory |
| `toilet` | oval + tank rectangle | Toilet / water closet |
| `bathtub` | rectangle, rounded end | Bathtub |
| `shower` | square with drain | Shower stall |
| `water-heater` | circle "WH" | Water heater |
| `dishwasher` | square "DW" | Dishwasher |
| `washing-machine` | square "WM" | Washing machine |
| `hose-bib` | triangle "HB" | Exterior hose connection |
| `utility-sink` | rectangle "US" | Utility/laundry sink |
| `shutoff-valve` | diamond on line | Shutoff valve |
| `cleanout` | circle "CO" | Drain cleanout |

### 9.3 Door Symbols

| Style | Visual | Description |
|-------|--------|-------------|
| `standard` | line + arc | Single swing door with arc showing swing |
| `double` | two lines + two arcs | Double swing doors |
| `sliding` | parallel lines + arrows | Sliding door |
| `pocket` | dashed line into wall | Pocket door |
| `bifold` | V/W shape | Bi-fold door |
| `barn` | line + arrow on track | Barn/sliding track door |
| `french` | double with glass marks | French doors |
| `cased-opening` | gap with no door | Cased opening (no door leaf) |

### 9.4 Fixture/Appliance Symbols

| Symbol ID | Description |
|-----------|-------------|
| `range` | Range/stove with burners |
| `refrigerator` | Rectangle "REF" |
| `oven` | Rectangle "OVEN" |
| `microwave` | Rectangle "MW" |
| `countertop` | Filled rectangle |
| `island` | Rectangle with countertop hatching |
| `cabinet-base` | Rectangle with "B" |
| `cabinet-upper` | Dashed rectangle with "U" |
| `stairs-up` | Rectangle with arrow and "UP" |
| `stairs-down` | Rectangle with arrow and "DN" |

---

## 10. Drawing Conventions

FloorScript follows standard US residential architectural drawing conventions automatically.

### 10.1 Wall Rendering

| Wall Type | Line Weight | Fill |
|-----------|-------------|------|
| Exterior (existing) | 0.7mm | None (outline only) |
| Exterior (new) | 0.7mm | Solid fill or cross-hatch |
| Interior (existing) | 0.5mm | None |
| Interior (new) | 0.5mm | Solid fill |
| Demolition | 0.35mm dashed | Light gray or "X" hatch |
| Load-bearing (noted) | 0.5mm | Diagonal hatch |

### 10.2 Dimension Style

- Extension lines extend 1/8" past dimension line (at print scale)
- Tick marks (45° slash) at dimension line endpoints — not arrowheads (architectural convention)
- Dimension text centered above the dimension line
- Text format: feet and inches with dash separator: `12'-6"`, `4'-0"`
- String (chain) dimensions on the outer layer, detail dimensions closer to the plan
- Overall dimensions on the outermost layer

### 10.3 Text and Labels

- Room labels: centered in room, larger font (12pt at print scale)
- Fixture labels: smaller font (8pt), positioned near fixture
- Dimension text: 8pt, always readable (rotated to follow dimension line direction but never upside-down)
- Title block: standard architectural title block format

### 10.4 Title Block

Rendered in the lower-right corner of the drawing:

```
┌──────────────────────────────┐
│ [Project Title]              │
│ [Address]                    │
│ [Owner Name]                 │
├──────────────────────────────┤
│ Sheet: [A1]   Date: [date]  │
│ Scale: 1/4" = 1'-0"         │
│ Drawn by: FloorScript v0.1  │
└──────────────────────────────┘
```

---

## 11. Templates

FloorScript ships with starter templates to reduce boilerplate:

| Template | Description |
|----------|-------------|
| `kitchen-reno` | Kitchen renovation with before/after structure, countertop outlets, plumbing |
| `bathroom-reno` | Bathroom renovation with fixtures, GFCI, plumbing |
| `single-room` | Single room with basic walls — minimal starting point |
| `full-house` | Multi-room house with all systems — comprehensive example |
| `addition` | Room addition with new exterior walls |
| `adu` | Accessory dwelling unit (ADU) with full systems |
| `basement-finish` | Basement finishing with egress windows |

---

## 12. Output Examples

### 12.1 Minimal Example (Single Room)

```yaml
version: "0.1"
project:
  title: "Test Room"
  scale: "1/4in = 1ft"
units: imperial

plans:
  - id: main
    title: "Floor Plan"
    rooms:
      - id: room1
        label: "Living Room"
        position: [0, 0]
        width: 15ft
        height: 12ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east:
            type: exterior
            openings:
              - type: window
                position: 3ft
                width: 6ft
          west:
            type: exterior
            openings:
              - type: door
                position: 4ft
                width: 3ft
                swing: inward-right
```

### 12.2 Kitchen Renovation Example

```yaml
version: "0.1"
project:
  title: "Kitchen Renovation - 123 Main St"
  address: "123 Main Street, Anytown, ST 12345"
  owner: "Jane Smith"
  date: "2026-02-11"
  scale: "1/4in = 1ft"
units: imperial

plans:
  - id: existing
    title: "Existing Kitchen"
    rooms:
      - id: kitchen
        label: "Kitchen"
        position: [0, 0]
        width: 12ft
        height: 10ft
        walls:
          north: { type: exterior, thickness: 6in }
          south: { type: interior }
          east: { type: interior }
          west:
            type: exterior
            thickness: 6in
            openings:
              - type: window
                position: 3ft
                width: 4ft
    electrical:
      outlets:
        - id: e-out-1
          type: duplex
          wall: kitchen.south
          position: 2ft
          circuit: 1
        - id: e-out-2
          type: duplex
          wall: kitchen.south
          position: 8ft
          circuit: 1
    plumbing:
      fixtures:
        - id: e-sink
          type: kitchen-sink
          position: [6ft, 9.5ft]
          width: 33in
          supply: [hot, cold]
          drain: true

  - id: proposed
    title: "Proposed Kitchen"
    rooms:
      - id: kitchen
        label: "Kitchen"
        position: [0, 0]
        width: 12ft
        height: 10ft
        walls:
          north: { type: exterior, thickness: 6in }
          south: { type: interior }
          east:
            type: interior
            openings:
              - type: cased-opening
                position: 2ft
                width: 8ft
                status: new
          west:
            type: exterior
            thickness: 6in
            openings:
              - type: window
                position: 3ft
                width: 4ft
      - id: island
        label: "Island"
        # Island is a fixture, not a room — see fixtures below

    fixtures:
      - id: p-island
        type: island
        position: [4ft, 4ft]
        width: 6ft
        depth: 3ft
        status: new

    electrical:
      outlets:
        - id: p-out-1
          type: gfci
          wall: kitchen.south
          position: 2ft
          circuit: 2
        - id: p-out-2
          type: gfci
          wall: kitchen.south
          position: 5ft
          circuit: 2
        - id: p-out-3
          type: gfci
          wall: kitchen.south
          position: 8ft
          circuit: 2
        - id: p-out-island
          type: gfci
          position: [5ft, 4ft]
          circuit: 3
          status: new
      fixtures:
        - id: p-light-1
          type: recessed
          position: [3ft, 5ft]
          circuit: 4
          status: new
        - id: p-light-2
          type: recessed
          position: [6ft, 5ft]
          circuit: 4
          status: new
        - id: p-light-3
          type: recessed
          position: [9ft, 5ft]
          circuit: 4
          status: new
        - id: p-pendant-1
          type: pendant
          position: [5.5ft, 5.5ft]
          circuit: 4
          status: new
        - id: p-pendant-2
          type: pendant
          position: [7.5ft, 5.5ft]
          circuit: 4
          status: new
        - id: p-under-cab
          type: under-cabinet
          position: [2ft, 9.5ft]
          width: 8ft
          circuit: 5
          status: new

    plumbing:
      fixtures:
        - id: p-sink
          type: kitchen-sink
          position: [5ft, 9.5ft]
          width: 33in
          supply: [hot, cold]
          drain: true
        - id: p-dw
          type: dishwasher
          position: [7.5ft, 9.5ft]
          width: 24in
          supply: [hot]
          drain: true
          status: new

diffs:
  - before: existing
    after: proposed
    title: "Kitchen Renovation - Demo & New Construction"
    outputs: [demolition, construction, combined, summary]
```

---

## 13. Implementation Roadmap

### Phase 1: Core Foundation (MVP) — Complete
- [x] Config parser (JSON + YAML)
- [x] Room model with wall generation
- [x] Door and window placement on walls
- [x] Basic SVG renderer (walls, doors, windows, room labels)
- [x] Dimension generation (automatic room dimensions)
- [x] Title block rendering
- [x] CLI: `render` and `init` commands
- [x] Unit system (imperial + metric)

### Phase 1.5: Architecture Improvements — Complete
- [x] Wall centerline on resolved openings (prevents Y-flip bugs in renderers)
- [x] Wall segmentation moved from renderer to resolver (`ResolvedWall.segments`)
- [x] Visual regression tests (6 SVG snapshot test cases)
- [x] Multi-room example (4-room adjacency test)
- [x] Dynamic margin (3ft based on dimension line requirements)
- [x] Proportional title block scaling
- [x] Fully inline SVG styling (CSS block removed)
- [x] DrawingContext abstraction (enables PDF backend without renderer changes)
- [x] Shared utilities module (`n()`, `escapeXml()`)

### Phase 2: Electrical & Plumbing
- [ ] Electrical symbol placement (outlets, switches, fixtures)
- [ ] Plumbing symbol placement (sinks, toilets, etc.)
- [ ] Basic routing lines (electrical runs, supply/drain lines)
- [ ] Circuit and plumbing grouping
- [ ] Layer system (toggle electrical/plumbing/structural)

### Phase 3: Renovation & Diffing
- [ ] Two-plan diff engine
- [ ] Demolition plan rendering
- [ ] New construction highlighting
- [ ] Combined overlay rendering
- [ ] Change summary generation
- [ ] Single-plan annotation mode (status: existing/demolish/new)

### Phase 4: Validation
- [ ] Structural validation (overlaps, unclosed rooms, bad references)
- [ ] Code compliance warnings (GFCI, smoke detectors, egress, spacing)
- [ ] CLI: `validate` command

### Phase 5: PDF & Polish
- [ ] PDF renderer via PDFKit
- [ ] Multi-sheet plan sets
- [ ] Scale bar and north arrow
- [ ] Template library
- [ ] Room adjacency helpers
- [ ] Fixture/appliance symbol library completion

### Future Considerations
- DXF export for CAD interoperability
- PNG raster export
- Interactive SVG with hover/click for web embedding
- 3D elevation view generation
- AI-assisted layout suggestions
- Constraint solver for auto-layout from room adjacency graphs
- Integration with permit application APIs (jurisdiction-specific)

---

## 14. Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript | LLM agents generate TS/JS natively; strong typing for config validation |
| Primary output | SVG | Text-based (diffable), browser-renderable, CSS-styleable, scales perfectly |
| Secondary output | PDF | Required for permit submission; PDFKit is mature |
| Config format | JSON + YAML | JSON for LLM output; YAML for human authoring; both parse to same model |
| Coordinate model | Explicit + helpers | Precise control as foundation; adjacency helpers reduce boilerplate |
| Unit system | Imperial + Metric | US permits use imperial; international use metric |
| Rendering engine | Custom SVG generation | No dependency on canvas/DOM; works in Node.js; full control over output |
| PDF engine | PDFKit | Mature, Node.js native, vector graphics support |
| Validation | Built-in IRC/NEC checks | Unique value-add; catches issues before permit submission |
| Diff approach | Element ID matching | Simple, predictable; IDs are required for diffable elements |
| Package structure | Monorepo with scoped packages | Allows tree-shaking; users import only what they need |
| Symbol library | Built-in ANSI/NECA standard | Correct by default; no user configuration needed |

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **Poche** | Solid fill or hatching inside wall cross-sections to indicate cut material |
| **Cased opening** | A doorway without a door leaf — just trim/casing around the opening |
| **String dimension** | A chain of continuous dimensions along one line |
| **Extension line** | Short line extending from the measured element to the dimension line |
| **Leader** | An arrow line connecting an annotation to the element it describes |
| **Egress** | A path of exit from a building; bedrooms require egress windows |
| **GFCI** | Ground Fault Circuit Interrupter — required near water sources |
| **IRC** | International Residential Code — US model building code |
| **NEC** | National Electrical Code — US model electrical code |
| **LF** | Linear feet — unit of measurement for wall lengths |
| **Section cut** | An imaginary vertical cut through the building showing interior structure |

## Appendix B: Dimension String Format

FloorScript parses dimension strings flexibly:

```
"12ft"          → 12.0 feet
"12ft 6in"      → 12.5 feet
"12ft 6.5in"    → 12.541667 feet
"12.5ft"        → 12.5 feet
"4ft 3-1/2in"   → 4.291667 feet  (fractional inches)
"3.5m"          → 3.5 meters
"900mm"         → 0.9 meters
"33in"          → 2.75 feet
12.5            → 12.5 (default unit from config)
```

## Appendix C: Scale Reference

| Scale | Use Case | 1 foot = |
|-------|----------|----------|
| 1/4" = 1'-0" | Standard residential floor plan | 0.25 inches on paper |
| 1/2" = 1'-0" | Enlarged plan (kitchen, bath) | 0.5 inches on paper |
| 3/4" = 1'-0" | Wall sections, details | 0.75 inches on paper |
| 1" = 1'-0" | Construction details | 1 inch on paper |
| 1" = 10'-0" | Site plan | 0.1 inches on paper |
