# Research: Fix Structural Rendering Foundations

**Feature**: `001-fix-structural-rendering`
**Date**: 2026-02-12

## Decision 1: Interior Dimensions Coordinate Model

**Decision**: Room `width`/`height` represent interior clear space
(sheetrock to sheetrock). Walls are additional material placed outside
and between rooms.

**Rationale**: Standard residential floor plan convention. When someone
says "12ft kitchen", they mean 12ft of usable space. The current model
where walls eat into room bounds is architecturally incorrect and
confusing for LLM agents.

**Alternatives considered**:
- Keep current model (outer bounds) — rejected: architecturally wrong
- Centerline-to-centerline — rejected: construction convention, not
  residential; confusing for non-builders

**Impact**: Breaking change. All wall geometry computation changes.
Room `bounds.x/y` now represents interior corner. Walls are offset
outward. All existing tests will need updates.

## Decision 2: Wall Graph Architecture

**Decision**: Add a plan-level `WallGraph` built as a post-processing
pass after all rooms are resolved. Keep per-room wall generation
unchanged; add shared wall detection and merging as a separate step.

**Rationale**: Minimizes risk by preserving existing per-room wall
logic. The wall graph is built by analyzing room boundaries after all
positions are resolved. This follows the existing resolver pattern
(isolated resolution → orchestrated composition).

**Alternatives considered**:
- Build wall graph incrementally during room resolution — rejected:
  adjacency depends on rooms resolved in order; all rooms must be
  positioned before shared walls can be detected
- Replace per-room walls entirely — rejected: too invasive; keeping
  room walls as intermediate representation reduces blast radius

**Implementation**: New `shared-wall-resolver.ts` called from
`layout-resolver.ts` after `resolveRooms()` completes. Produces
`WallGraph` added to `ResolvedPlan`.

## Decision 3: Wall Composition Model

**Decision**: Add `stud` field to wall config (e.g., `2x4`, `2x6`).
Total thickness = stud width + finish per side. Keep `thickness`
override for backwards compatibility.

**Rationale**: Captures real-world wall assembly. Enables future
construction-dimension output (centerline, stud face) without data
model changes. Default: interior = 2x4 (4.5" total), exterior = 2x6
(6.5" total).

**Alternatives considered**:
- Thickness-only (current) — rejected: loses structural info needed
  for construction dimensions
- Full assembly spec (studs + insulation + sheathing + siding) —
  rejected: over-engineering for current needs; stud + finish per side
  captures 90% of use cases

## Decision 4: Opening Merge Strategy for Shared Walls

**Decision**: Merge openings from both rooms onto the shared wall.
Validate no overlaps. `shared_walls` config can add more openings.

**Rationale**: Most intuitive for users. An LLM placing a door from
the kitchen side and a window from the living room side expects both
to appear. Overlap validation catches conflicts.

**Alternatives considered**:
- First room wins — rejected: order-dependent, unintuitive
- Explicit only (shared_walls config required) — rejected: too verbose
  for simple cases; forces users to learn a new config section

## Decision 5: Validation Architecture

**Decision**: Linter-style validation pass after layout resolution,
before rendering. Produces structured errors/warnings. Invokable
independently via CLI `validate` command.

**Rationale**: Separates concerns (validation != rendering). Allows
running validation without rendering overhead. Follows established
linter patterns (eslint, tsc --noEmit).

**Alternatives considered**:
- Validate during resolution — rejected: mixes concerns; harder to
  test independently
- Validate only at render time — rejected: can't validate without
  rendering; users may want to check YAML without generating SVG

## Decision 6: Dimension Placement Strategy

**Decision**: Smart offset calculation that checks for neighboring
rooms. Deduplicate shared-wall dimensions. Place on opposite side or
further offset when neighbor room occupies the default position.

**Rationale**: Fixed 2ft offset is too rigid for multi-room plans.
Neighbor-aware placement avoids overlaps without full text collision
detection (which is a harder problem deferred to future work).

**Alternatives considered**:
- Full text bounding-box collision detection — rejected: complex,
  diminishing returns for this phase
- Manual-only dimensions — rejected: auto-dimensions are a key
  usability feature for LLM agents

## Decision 7: Reuse of Electrical Resolver Patterns

**Decision**: Extract `findWallById()` and `computeWallPosition()`
from `electrical-resolver.ts` into a shared utility. Reuse for
plumbing wall-relative positioning.

**Rationale**: These helpers already solve the wall lookup and
position computation problem. Plumbing should use the same pattern
for consistency. Extraction avoids circular dependencies.

**Alternatives considered**:
- Duplicate the logic in plumbing resolver — rejected: DRY violation
- Import directly from electrical resolver — rejected: creates
  coupling between unrelated domain resolvers

## Decision 8: Rendering Pipeline Changes

**Decision**: Render walls from `WallGraph` (plan-level) instead of
per-room. Keep room iteration for labels. Openings render as part of
wall graph traversal.

**Rationale**: Each wall is rendered exactly once. Eliminates double
rendering of shared walls. The wall renderer itself needs minimal
changes — it already renders `Rect` segments.

**Current render order** (preserved):
1. Walls (from WallGraph instead of per-room)
2. Openings (doors, windows, cased openings — from wall openings)
3. Labels (per room)
4. Dimensions (plan-level)
5. Electrical layer
6. Plumbing layer
7. Title block

## Test Impact Assessment

| Test File | Cases | Will Break | Action |
|-----------|-------|-----------|--------|
| layout-resolver.test.ts | 10 | ALL | Update wall geometry assertions |
| config-parser.test.ts | 10 | 0 (add new) | Add stud/composition validation |
| integration.test.ts | 8 | ALL | Update SVG content assertions |
| visual-regression.test.ts | 8 | ALL | Regenerate snapshots |
| electrical-resolver.test.ts | 12 | MOST | Update wall position calculations |
| plumbing-resolver.test.ts | 11 | 0 | Add wall-relative tests |
| dimension.test.ts | — | 0 | No wall dependency |
