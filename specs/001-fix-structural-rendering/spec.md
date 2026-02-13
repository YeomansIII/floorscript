# Feature Specification: Fix Structural Rendering Foundations

**Feature Branch**: `001-fix-structural-rendering`
**Created**: 2026-02-12
**Status**: Draft
**Input**: Fix major structural and rendering defects identified in ANALYSIS.md. Improve foundations before building new features.

## Clarifications

### Session 2026-02-12

- Q: What do room dimensions represent — outer bounds (current), interior clear space, or centerline-to-centerline? → A: Room dimensions represent interior clear space (sheetrock to sheetrock). Walls are additional material placed around and between rooms. This matches standard residential floor plan convention. Auto-generated dimensions show interior (sheetrock-to-sheetrock) measurements. A future feature will add a toggle between residential and construction dimension styles.
- Q: Should wall configuration capture stud width (e.g., 2x4, 2x6) as a foundational property? → A: Yes. Wall config MUST include stud width to support future construction-dimension output. Total wall thickness is derived from stud width plus finish materials (e.g., 2x4 stud = 3.5" + 0.5" drywall each side = 4.5" total).
- Q: Can both rooms define openings on the same shared wall? → A: Yes — merge. Both rooms' openings are combined onto the shared wall. The system validates that openings do not overlap. `shared_walls` config can add additional openings beyond what individual rooms define. Validation runs as a linter-style pass that reports errors and warnings.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adjacent Rooms Render With a Single Shared Wall (Priority: P1)

When an LLM agent generates a multi-room floor plan with adjacent rooms
(e.g., a kitchen next to a living room), the rendered output MUST show
a single wall at the boundary — not two separate walls with a visible
gap between them. This is the most visually broken aspect of the current
system and undermines trust in all output.

Currently, `wall-resolver.ts` unconditionally generates 4 independent
walls per room. When two rooms are adjacent, this produces two separate
wall rectangles at the boundary with a visible gap. The total wall
material is nearly double what it should be (confirmed in source:
`resolveWalls()` loops through all 4 cardinal directions with no
neighbor awareness).

**Why this priority**: Double walls are immediately visible in every
multi-room plan. They cause cascading failures: doors open into wall
gaps, plumbing lines terminate between walls, and cased openings are
nearly invisible. Fixing shared walls resolves or simplifies bugs 1.1,
1.3, 1.5, and 1.9 from the analysis.

**Independent Test**: Render `examples/multi-room.yaml` and visually
confirm that every adjacent room pair shares a single wall with correct
thickness.

**Acceptance Scenarios**:

1. **Given** two rooms placed adjacent via `adjacent_to`, **When** the
   plan is rendered, **Then** exactly one wall appears at the shared
   boundary with no visible gap or doubling.
2. **Given** two adjacent rooms with different wall thicknesses (e.g.,
   4.5" interior vs 6" exterior), **When** no explicit `shared_walls`
   config is provided, **Then** the thicker wall is used for the shared
   segment.
3. **Given** an explicit `shared_walls` config with openings, **When**
   the plan is rendered, **Then** the opening cuts through the single
   shared wall and is clearly visible.
4. **Given** two adjacent rooms of different heights sharing a partial
   wall, **When** the plan is rendered, **Then** the shared portion is
   a single wall, and the non-overlapping portions remain as separate
   walls for each room.
5. **Given** a room with `width: 12ft`, **When** rendered, **Then**
   the interior clear space (sheetrock to sheetrock) is exactly 12ft.
   Walls are additional material outside the stated dimensions; the
   room's interior area is never reduced by wall thickness.

---

### User Story 2 - Doors on Shared Walls Swing Correctly (Priority: P1)

When a door is placed on a wall between two rooms, the door leaf and
swing arc MUST open into the correct room (the room that defines the
opening in its config). The hinge point MUST be on the wall's actual
face, not floating in a gap between double walls.

Currently, the opening resolver (`resolveOpenings()`) receives only a
wall object with no room context — it cannot determine which room
"owns" the opening. The door renderer interprets "inward" based on
cardinal direction alone, which is ambiguous on shared walls.

**Why this priority**: Incorrect door swings produce architecturally
invalid drawings. This is a direct consequence of the double-wall
problem and MUST be fixed alongside User Story 1.

**Independent Test**: Place doors on each cardinal wall with all four
swing types (inward-left, inward-right, outward-left, outward-right)
and verify each arc direction visually.

**Acceptance Scenarios**:

1. **Given** a door with `swing: inward-left` on the bathroom's north
   wall (shared with the living room), **When** rendered, **Then** the
   door arc sweeps into the bathroom (downward in plan view), hinged
   on the left side when viewed from outside the bathroom.
2. **Given** a door on a shared wall between two rooms, **When**
   rendered, **Then** the door opening cuts through the single shared
   wall completely — no solid wall blocks the opening on either side.
3. **Given** all 16 combinations of 4 cardinal walls and 4 swing
   types, **When** rendered, **Then** each produces the correct arc
   direction per SPEC.md Section 3.5 convention.

---

### User Story 3 - Plumbing Fixtures Position Against Walls (Priority: P2)

Plumbing fixtures (toilets, sinks, bathtubs) MUST be positionable
relative to a room's wall — the same way electrical elements already
work. Fixtures MUST render flush against the inner wall face, not
floating in room space due to manual absolute-coordinate math.

Currently, `PlumbingFixtureConfig` has only a `position: DimensionTuple`
field (absolute [x, y]). In contrast, `OutletConfig` and `SwitchConfig`
have a `wall: string` field and use `findWallById()` for wall-relative
resolution in the electrical resolver. This inconsistency means plumbing
fixtures break when rooms move.

**Why this priority**: Room-relative positioning makes fixture placement
resilient to room repositioning and eliminates a class of coordinate
math errors. However, it is lower priority than shared walls because
absolute positioning technically works — it's just fragile and
error-prone.

**Independent Test**: Define plumbing fixtures using wall references
(e.g., `wall: bathroom.south`), render the plan, and confirm fixtures
are flush against the inner wall face.

**Acceptance Scenarios**:

1. **Given** a toilet with `wall: bathroom.south` and `position: 2ft`,
   **When** rendered, **Then** the toilet symbol is flush against the
   bathroom's south wall inner face, 2ft from the wall's left edge.
2. **Given** a sink with `wall: bathroom.west` and `offset: 0in`,
   **When** rendered, **Then** the sink symbol touches the inner face
   of the west wall.
3. **Given** a fixture using legacy absolute `position: [x, y]`
   (no `wall` reference), **When** rendered, **Then** the fixture
   renders at the absolute coordinates unchanged (backwards
   compatibility preserved).
4. **Given** a room that moves (e.g., `adjacent_to` target changes),
   **When** plumbing fixtures use wall references, **Then** fixtures
   move with the room automatically.

---

### User Story 4 - Dimension Lines Do Not Overlap Other Elements (Priority: P2)

Auto-generated dimension lines MUST avoid overlapping room labels,
other dimension lines, and adjacent rooms. When a neighboring room
occupies the space where a dimension line would normally be placed, the
system MUST reposition the dimension line to an unoccupied area.

Currently, `dimension-resolver.ts` uses hard-coded constants
(`DIMENSION_OFFSET_FT = 2`, `DIMENSION_OFFSET_M = 0.6`) and places
dimensions at fixed offsets with zero collision detection. In the
multi-room example, the kitchen's width dimension lands directly on
top of the hallway's room label.

**Why this priority**: Overlapping text makes drawings unreadable but
does not produce structurally incorrect geometry. This is a readability
issue that matters for permit-quality output.

**Independent Test**: Render `examples/multi-room.yaml` and confirm no
dimension text overlaps any room label or other dimension text.

**Acceptance Scenarios**:

1. **Given** a kitchen with a hallway directly below it, **When**
   auto-dimensions are generated, **Then** the kitchen's width
   dimension does not overlap the hallway's room label.
2. **Given** two adjacent rooms sharing a wall, **When** both rooms
   would generate width dimensions on the same side, **Then** the
   dimension lines are stacked in separate "lanes" without overlapping.
3. **Given** a room dimension that would land inside an adjacent room,
   **When** auto-dimensions are generated, **Then** the dimension is
   placed on the opposite side of the room or at a further offset.
4. **Given** adjacent rooms that share a wall, **When** dimensions are
   generated for the shared edge, **Then** only one dimension line is
   produced (no duplicate dimensions for the same measurement).

---

### User Story 5 - Cased Openings Are Clearly Visible (Priority: P3)

Cased openings (doorways without a door leaf) MUST render with visible
casing marks that are proportional to wall thickness depth. The current
implementation draws two tiny tick marks sized to wall thickness
(~0.375ft), which are nearly invisible for a 6ft opening.

Currently, `renderCasedOpening()` in `door-renderer.ts` uses
`tickLen = scaleValue(opening.wallThickness, ctx)` — the tick length
equals the wall thickness, not the opening width.

**Why this priority**: This is a visual polish issue. Cased openings
technically render but are hard to see, especially on shared walls.

**Independent Test**: Render a 6ft cased opening between two rooms and
confirm the casing marks are clearly visible at normal zoom.

**Acceptance Scenarios**:

1. **Given** a 6ft cased opening on a shared wall, **When** rendered,
   **Then** L-shaped casing marks at each end of the opening are clearly
   visible (proportional to wall thickness depth, extending visibly
   along the opening edge).
2. **Given** a cased opening, **When** rendered, **Then** the opening
   gap in the wall is clearly distinguishable from an intact wall
   segment.

---

### User Story 6 - Supply and Drain Lines Connect to Meaningful Endpoints (Priority: P3)

Plumbing supply and drain lines MUST connect to fixtures and MUST NOT
terminate in empty space or inside walls. When a run references a
fixture by ID, the system resolves the endpoint to the fixture's
actual position.

Currently, supply/drain runs use raw absolute coordinate paths that
can terminate in the dead zone between double walls or extend past
room boundaries. There is no path validation or fixture reference
resolution.

**Why this priority**: This depends on User Story 1 (shared walls) and
User Story 3 (room-relative plumbing) to be fully effective. It is a
correctness improvement but lower urgency because the lines are
visually secondary to walls and fixtures.

**Independent Test**: Define supply runs using fixture references
(e.g., `from: bath-sink`) and confirm the rendered lines connect to
the fixture positions.

**Acceptance Scenarios**:

1. **Given** a supply run with `from: bath-sink`, **When** rendered,
   **Then** the supply line originates at the bath-sink fixture's
   resolved position.
2. **Given** a drain run path, **When** rendered, **Then** the line
   does not extend past the room's outer wall boundary.
3. **Given** a fixture using wall-relative positioning that moves when
   the room moves, **When** a supply run references that fixture,
   **Then** the run endpoint updates to match the fixture's new
   position.

---

### Edge Cases

- What happens when two rooms are adjacent but have zero Y-overlap
  (stacked vertically with no shared boundary)? The system MUST NOT
  create a shared wall — they are separate rooms with separate walls.
- What happens when three rooms meet at a T-junction? The shared wall
  logic MUST handle partial overlaps: the long wall shares one segment
  with room A and another segment with room B.
- What happens when a door opening is wider than the shared wall
  segment? The system MUST produce a validation error.
- What happens when a room has no openings at all? The system MUST
  produce a validation warning ("sealed room — no egress").
- What happens when a plumbing fixture uses a wall reference to a wall
  that doesn't exist (e.g., `wall: kitchen.north` but kitchen has no
  north wall config)? The system MUST produce a clear error message
  identifying the invalid reference.
- What happens when two rooms are placed with explicit absolute
  coordinates that are close but not exactly aligned? The system MUST
  NOT auto-merge their walls — shared wall detection applies only when
  boundaries are within a small epsilon of each other.
- What happens when room A defines a door at 3ft on a shared wall and
  room B defines a window at 4ft on the same wall, and they overlap?
  The validator MUST report an error identifying both openings and
  their overlapping positions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Room `width` and `height` MUST represent interior clear
  space (sheetrock-to-sheetrock / finished surface to finished surface).
  Walls are additional material placed outside and between rooms. A room
  specified as `width: 12ft` MUST have exactly 12ft of usable interior
  width regardless of wall thickness.
- **FR-002**: Wall configuration MUST support a `stud` field specifying
  lumber dimensions (e.g., `2x4`, `2x6`). Total wall thickness MUST be
  derivable from stud width plus finish material thickness (default:
  0.5" drywall per side). A plain `thickness` override MUST remain
  supported for backwards compatibility and non-standard assemblies.
- **FR-003**: The system MUST detect when two rooms share a boundary
  edge (within a tolerance of 0.01ft, approximately 1/8") and produce
  a single wall at that boundary instead of two independent walls.
  This tolerance is an internal constant, not user-configurable.
- **FR-004**: The system MUST support an optional `shared_walls`
  configuration section that explicitly defines thickness, type, and
  openings for shared walls, overriding auto-detection defaults.
- **FR-005**: When no explicit `shared_walls` config is provided, the
  system MUST use the thicker of the two adjacent room walls for the
  shared wall ("thicker wins" rule).
- **FR-006**: When both rooms define openings on a shared wall, the
  system MUST merge all openings onto the single shared wall. The
  `shared_walls` config can define additional openings beyond those
  from individual rooms. Openings from all sources (room A, room B,
  shared_walls) are combined into a single ordered list.
- **FR-007**: Door swing direction ("inward"/"outward") MUST be
  resolved relative to the room whose configuration defines the
  opening — not relative to the wall's geometric position alone.
- **FR-008**: The opening resolver MUST track which room owns each
  opening so that door swing direction can be unambiguously determined
  on shared walls.
- **FR-009**: Plumbing fixtures MUST support wall-relative positioning
  via a `wall` reference field (e.g., `wall: bathroom.south`), with
  a `position` field for distance along the wall measured from the
  wall segment's start point (left edge for horizontal walls, bottom
  edge for vertical walls), and an `offset` field for distance from
  the inner wall face. When `wall` is present, `position` is a 1D
  scalar (distance along wall); when `wall` is absent, the existing
  2D absolute `position: [x, y]` semantics are preserved (see FR-011).
- **FR-010**: Plumbing fixtures MUST support an `orientation` field to
  indicate which direction the fixture faces (e.g., `facing-north`).
- **FR-011**: Legacy absolute `position: [x, y]` for plumbing fixtures
  MUST continue to work unchanged (backwards compatibility).
- **FR-012**: Auto-generated dimension lines MUST measure and display
  interior clear space (sheetrock-to-sheetrock), consistent with the
  coordinate model defined in FR-001.
- **FR-012a**: Auto-generated dimension line text and extension lines
  MUST NOT overlap room labels, other dimension text, or extend into
  adjacent room interiors. When a neighboring room occupies the
  default dimension offset position, the system MUST reposition the
  dimension to an unoccupied area.
- **FR-013**: Dimension lines for shared walls MUST be deduplicated —
  one dimension line per measurement, not two overlapping lines.
- **FR-014**: Cased opening symbols MUST render L-shaped casing marks
  at both ends, proportional to wall thickness, clearly visible at
  standard zoom levels.
- **FR-015**: Supply and drain runs MUST support fixture ID references
  as endpoints (e.g., `from: bath-sink`), resolving to the fixture's
  actual position at render time.
- **FR-016**: The system MUST include a validation pass that runs after
  layout resolution, operating like a linter. The validator examines
  the resolved plan and produces a structured list of errors (MUST
  fix — indicates invalid geometry) and warnings (SHOULD fix —
  potential issues). The validator MUST be invokable independently
  of rendering (e.g., `floorscript validate plan.yaml`).
- **FR-017**: Validator error: overlapping openings on a shared wall
  (two or more openings occupy the same wall segment).
- **FR-018**: Validator error: opening wider than its wall segment.
- **FR-019**: Validator warning: sealed room with no openings (no
  egress).
- **FR-020**: Validator warning: fixture placed outside its referenced
  room bounds.
- **FR-021**: Validator warning: plumbing/supply run path passes
  through a wall without a defined penetration point.

### Key Entities

- **PlanWall**: A plan-level wall segment potentially shared by two
  rooms. Replaces per-room wall ownership with a centralized wall
  graph. Key attributes: references to adjacent rooms (A and B, where
  null means exterior/boundary), wall type, wall composition (stud
  width + finish materials = total thickness), centerline geometry,
  and openings list. Walls are positioned as additional material
  outside room interior dimensions.
- **WallComposition**: Describes how a wall is built — stud size
  (e.g., 2x4, 2x6), finish material per side (default: 0.5" drywall),
  and total derived thickness. This foundational data enables future
  construction-dimension output without changing the data model later.
- **WallGraph**: A collection of PlanWalls with indexed lookup by
  room ID and cardinal direction. Becomes part of the resolved plan
  output and is the single source of truth for wall geometry.
- **PlumbingFixture (extended)**: Adds optional `wall` reference and
  `offset` for room-relative positioning, and `orientation` for
  fixture facing direction. Falls back to absolute positioning when
  no wall reference is provided.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All adjacent room pairs in `examples/multi-room.yaml`
  render with a single shared wall — zero visible double-wall
  artifacts.
- **SC-002**: All door swings in the multi-room example open into the
  correct room with the arc fully inside the room interior — no arcs
  entering wall gaps or adjacent rooms.
- **SC-003**: Plumbing fixtures defined with wall references render
  flush against the specified wall's inner face (within drawing
  tolerance).
- **SC-004**: No auto-generated dimension text overlaps any room label
  or other dimension text in the multi-room example.
- **SC-005**: Cased openings are clearly visible at standard zoom —
  casing marks are distinguishable from wall segments.
- **SC-006**: All existing tests pass after changes (zero test
  regressions).
- **SC-007**: The multi-room example renders a visually correct,
  permit-quality floor plan as verified by visual inspection following
  the project's visual verification workflow.
- **SC-008**: The validator catches all defined error and warning
  conditions when fed a deliberately invalid plan (overlapping
  openings, sealed rooms, out-of-bounds fixtures, etc.).

### Assumptions

- **Coordinate model change**: Room `width`/`height` now represent
  interior clear space. This is a breaking change from the current
  model where dimensions include wall thickness. Existing YAML files
  and tests MUST be updated to reflect the new semantics.
- The scope is limited to axis-aligned rectangular rooms. Polygon and
  composite room shapes (ANALYSIS.md Section 3.2) are explicitly out
  of scope — they are a future enhancement that builds on top of this
  foundation work.
- Shared wall detection applies only to rooms placed via `adjacent_to`
  or whose boundaries align within the tolerance defined in FR-003
  (0.01ft). Rooms with explicit absolute coordinates that happen to be
  near each other but not precisely aligned are NOT auto-merged.
- Validation warnings and errors are informational at this stage — they
  do not block rendering.
- The `shared_walls` YAML config section defines: a room pair
  (`rooms`), wall direction pairing (`wall`), optional thickness
  override, and optional openings list. See data-model.md
  SharedWallConfig for the full schema.
- Fixture orientation values follow a `facing-{direction}` convention
  using cardinal directions.
- Default wall composition: 2x4 studs (3.5") with 0.5" drywall each
  side = 4.5" total for interior walls. Exterior walls default to 2x6
  studs (5.5") with 0.5" drywall inside + 0.5" sheathing outside =
  6.5" total. These defaults can be overridden per wall.
- Toggle between residential (sheetrock-to-sheetrock) and construction
  (centerline/stud-face) dimension styles is deferred to a future
  feature. This feature implements residential dimensions only.
