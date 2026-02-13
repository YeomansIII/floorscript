# Data Model: Fix Structural Rendering Foundations

**Feature**: `001-fix-structural-rendering`
**Date**: 2026-02-12

## New Entities

### WallComposition

Describes how a wall is physically constructed.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| stud | StudSize | No | Lumber dimension: "2x4", "2x6", "2x8" |
| studWidthFt | number | Derived | Actual stud width in feet (3.5"/12, 5.5"/12, etc.) |
| finishA | number | No | Finish material thickness on side A (default: 0.5" drywall) |
| finishB | number | No | Finish material thickness on side B (default: 0.5" drywall) |
| totalThickness | number | Derived | studWidth + finishA + finishB |

**StudSize enum**: `"2x4"` → 3.5", `"2x6"` → 5.5", `"2x8"` → 7.25"

**Defaults**:
- Interior wall: 2x4 stud, 0.5" drywall each side = 4.5" total
- Exterior wall: 2x6 stud, 0.5" drywall inside + 0.5" sheathing outside = 6.5" total

**Backwards compatibility**: When only `thickness` is specified (no
`stud`), use thickness directly. When `stud` is specified, derive
thickness from composition.

### PlanWall

A plan-level wall segment, potentially shared by two rooms. This is
the single source of truth for wall geometry after resolution.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique identifier (e.g., "living.east\|kitchen.west") |
| roomA | string \| null | Yes | Room ID on one side (null = exterior/boundary) |
| roomB | string \| null | Yes | Room ID on other side (null = exterior/boundary) |
| directionInA | CardinalDirection \| null | Yes | Which wall of roomA this is |
| directionInB | CardinalDirection \| null | Yes | Which wall of roomB this is |
| type | WallType | Yes | "exterior", "interior", "load-bearing" |
| composition | WallComposition | Yes | Stud + finish = thickness |
| thickness | number | Derived | Total wall thickness in plan units |
| lineWeight | number | Derived | From type (exterior=0.7, interior=0.5) |
| centerline | LineSegment | Yes | Wall centerline (before thickness applied) |
| outerEdge | LineSegment | Yes | Edge toward roomA (or exterior) |
| innerEdge | LineSegment | Yes | Edge toward roomB (or interior) |
| rect | Rect | Yes | Bounding rectangle of wall material |
| openings | ResolvedOpening[] | Yes | Merged openings from both rooms |
| segments | Rect[] | Derived | Wall rects after openings are carved out |
| shared | boolean | Yes | True if wall separates two rooms |

**Positioning rule**: Walls are placed as additional material between
rooms. For a shared wall between rooms A and B:
- Room A's interior ends at the wall's face toward A
- Room B's interior ends at the wall's face toward B
- The wall material sits between them

For an exterior wall on room A's north side:
- Room A's interior ends at the wall's inner face
- The wall extends outward from the room

### WallGraph

Collection of all PlanWalls with indexed lookup.

| Field | Type | Description |
|-------|------|-------------|
| walls | PlanWall[] | All walls in the plan |
| byRoom | Map<string, Map<CardinalDirection, PlanWall>> | Lookup by room ID + direction |

### ResolvedOpening (extended)

Existing entity with new field.

| New Field | Type | Required | Description |
|-----------|------|----------|-------------|
| ownerRoomId | string | Yes | Room whose config defined this opening |

This field resolves the door swing ambiguity on shared walls.
"Inward" means into the ownerRoomId's interior.

### PlumbingFixtureConfig (extended)

Existing config entity with new optional fields.

| New Field | Type | Required | Description |
|-----------|------|----------|-------------|
| wall | string | No | Wall reference (e.g., "bathroom.south") |
| offset | Dimension | No | Distance from inner wall face (default: 0) |
| orientation | FacingDirection | No | Which direction fixture faces |

**FacingDirection enum**: `"facing-north"`, `"facing-south"`,
`"facing-east"`, `"facing-west"`

When `wall` is provided, `position` becomes distance along the wall
(1D), not absolute coordinates (2D). When `wall` is absent, legacy
absolute `position: [x, y]` behavior is preserved.

### SupplyRunConfig / DrainRunConfig (extended)

Existing config entities with new optional fields.

| New Field | Type | Required | Description |
|-----------|------|----------|-------------|
| from | string | No | Fixture ID reference as start point |
| to | string \| object | No | Fixture ID or wall reference as end point |

When `from` or `to` is a fixture ID string, the system resolves it to
the fixture's absolute position. When it's a wall reference object
(e.g., `{ wall: "bathroom.north", position: "5ft" }`), it resolves to
a point on the wall.

Legacy `path: [[x,y], ...]` continues to work when `from`/`to` are
not specified.

### ValidationResult

New entity for the linter-style validation pass.

| Field | Type | Description |
|-------|------|-------------|
| errors | ValidationIssue[] | Must fix — invalid geometry |
| warnings | ValidationIssue[] | Should fix — potential issues |

### ValidationIssue

| Field | Type | Description |
|-------|------|-------------|
| code | string | Machine-readable code (e.g., "overlapping-openings") |
| severity | "error" \| "warning" | Issue severity |
| message | string | Human-readable description |
| roomId | string \| null | Room context if applicable |
| wallId | string \| null | Wall context if applicable |
| elementId | string \| null | Element that triggered the issue |
| suggestion | string \| null | How to fix it |

**Validation codes**:
- `overlapping-openings` (error): Two openings on same wall overlap
- `opening-exceeds-wall` (error): Opening wider than wall segment
- `sealed-room` (warning): Room has no openings
- `fixture-out-of-bounds` (warning): Fixture outside its room
- `run-through-wall` (warning): Plumbing run passes through a wall

## Modified Entities

### ResolvedPlan (modified)

| New/Changed Field | Type | Description |
|-------------------|------|-------------|
| wallGraph | WallGraph | Plan-level wall graph (new) |
| validation | ValidationResult \| null | Validation results (new) |

### ResolvedRoom (modified)

| Changed Field | Description |
|---------------|-------------|
| bounds | Now represents interior clear space (was outer bounds) |
| walls | Retained for backward compat; references PlanWalls |

### WallConfig (modified)

| New Field | Type | Required | Description |
|-----------|------|----------|-------------|
| stud | StudSize | No | Lumber dimension |
| finish | Dimension | No | Finish material thickness per side |

`thickness` becomes an override — when present, used directly.
When absent, derived from `stud` + `finish` or defaults.

## Entity Relationships

```
FloorPlanConfig
  └── PlanConfig
       ├── RoomConfig[] ──→ WallConfig (per direction)
       │                         └── OpeningConfig[]
       ├── SharedWallConfig[] (new, optional)
       ├── ElectricalConfig
       └── PlumbingConfig
            ├── PlumbingFixtureConfig (extended: wall, offset, orientation)
            ├── SupplyRunConfig (extended: from, to)
            └── DrainRunConfig (extended: from, to)

ResolvedPlan
  ├── ResolvedRoom[] (bounds = interior clear space)
  ├── WallGraph
  │    └── PlanWall[] (each with composition, openings, segments)
  │         └── ResolvedOpening[] (each with ownerRoomId)
  ├── ResolvedDimension[] (measuring interior space)
  ├── ResolvedElectrical
  ├── ResolvedPlumbing
  └── ValidationResult
```
