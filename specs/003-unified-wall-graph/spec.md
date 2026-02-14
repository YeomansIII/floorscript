# Feature Specification: Unified Wall Graph

**Feature Branch**: `003-unified-wall-graph`
**Created**: 2026-02-14
**Status**: Draft
**Input**: User description: "Refactor the wall resolution and rendering system to eliminate the dual ResolvedWall/PlanWall type split and the three separate wall storage locations (wallGraph, room.enclosures[].walls, room.extensions[].walls). Replace with a single Wall type and a single unified WallGraph that contains ALL walls. Add a derived perimeter-edge concept. YAML configuration model does NOT change — purely internal refactor."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single Wall Rendering Path (Priority: P1)

A developer rendering a floor plan with composite rooms (extensions and enclosures) gets all walls drawn from a single unified wall graph. There is no need for the renderer to iterate three separate data structures (plan-level wall graph, per-room enclosure walls, per-room extension walls). All walls — parent room walls, enclosure interior walls, and extension exterior walls — are present in one graph and rendered in one pass.

**Why this priority**: This is the foundational change. The unified wall graph is the single data structure that all other improvements depend on. Without it, every downstream consumer (validation, dimensions, electrical/plumbing lookups) continues to need three separate code paths.

**Independent Test**: Can be fully tested by rendering the existing `multi-room.yaml` and composite room examples and verifying the SVG output is pixel-identical to the current output, while the renderer uses only the wall graph (no separate enclosure/extension wall rendering calls).

**Acceptance Scenarios**:

1. **Given** a floor plan with rooms, enclosures, and extensions, **When** the plan is resolved, **Then** every wall (parent, enclosure, extension) appears in `plan.wallGraph.walls` with correct geometry, type, and ownership metadata.
2. **Given** a resolved plan with a unified wall graph, **When** the SVG renderer draws the structural layer, **Then** it iterates only `plan.wallGraph.walls` — there is no separate enclosure or extension wall rendering path.
3. **Given** the existing `multi-room.yaml` example, **When** rendered with the new system, **Then** the SVG output is visually identical to the current output.

---

### User Story 2 - Unified Wall Type (Priority: P2)

A developer working with resolved geometry uses a single `Wall` type throughout the codebase instead of switching between `ResolvedWall` (per-room) and `PlanWall` (plan-level). The unified type carries ownership metadata (which room, which sub-space if any, whether shared) and all geometry fields needed by both resolvers and renderers.

**Why this priority**: Eliminating the type split removes conversion ceremony, reduces duplication (11 fields currently duplicated between the two types), and makes it possible for downstream consumers to work with one type consistently.

**Independent Test**: Can be tested by verifying that the `ResolvedWall` and `PlanWall` types no longer exist in the codebase, replaced by a single `Wall` type used in resolution, rendering, validation, and wall lookups. All 174 existing tests pass.

**Acceptance Scenarios**:

1. **Given** the resolved geometry types, **When** a developer inspects the type definitions, **Then** there is one `Wall` type (not `ResolvedWall` and `PlanWall`) and one `WallGraph` type containing `Wall[]`.
2. **Given** a wall in the unified graph, **When** a developer inspects it, **Then** it carries `roomId`, optional `subSpaceId`, `source` (parent/enclosure/extension), and `shared` flag alongside all geometry fields.
3. **Given** the full test suite, **When** all tests are run after the type unification, **Then** all 174 tests pass. Test code may change type names and wall access patterns (querying `wallGraph` instead of `room.walls`), but test intent and expected values remain the same.

---

### User Story 3 - Complete Wall Lookups (Priority: P3)

A developer placing electrical outlets or plumbing fixtures can reference any wall by ID — including walls belonging to enclosures and extensions — using the same `findWallById` lookup. Currently, enclosure and extension walls are not in the wall graph, so wall-relative positioning only works for parent room walls.

**Why this priority**: This unblocks practical use of enclosures and extensions for electrical/plumbing placement. A closet (enclosure) with an outlet on its wall, or a bay window extension with a fixture, requires the same wall lookup that parent rooms use.

**Independent Test**: Can be tested by creating a config with an outlet on an enclosure wall (e.g., `wall: "closet1.south"`) and verifying it resolves to the correct absolute position.

**Acceptance Scenarios**:

1. **Given** an enclosure with id "pantry" that has a south-facing interior wall, **When** `findWallById("pantry.south")` is called, **Then** it returns the correct wall from the unified graph.
2. **Given** an extension with id "bay" that has a north exterior wall, **When** `findWallById("bay.north")` is called, **Then** it returns the correct wall from the unified graph.
3. **Given** a plumbing fixture config referencing `wall: "closet1.east"`, **When** the plumbing resolver runs, **Then** the fixture is positioned correctly on the enclosure's east wall.

---

### User Story 4 - Building Perimeter Edges (Priority: P4)

A developer querying the resolved plan can access ordered perimeter edges — chains of exterior wall outer-edges that form the building outline. This enables future chain dimensions, overall building dimensions, and perimeter-based computations (area, insulation length) without ad-hoc geometry stitching.

**Why this priority**: Perimeter edges are a derived data structure that builds on the unified wall graph. They are not required for rendering correctness but are the key enabler for the upcoming smart dimensions feature (004) and other future features like material takeoffs and energy analysis.

**Independent Test**: Can be tested by resolving a multi-room plan and verifying that the perimeter edges form a closed, correctly-wound polygon matching the building outline, including extension bump-outs and excluding enclosure interior edges.

**Acceptance Scenarios**:

1. **Given** a rectangular single-room plan, **When** perimeter edges are computed, **Then** they form a closed rectangle matching the room's exterior wall outer-edges (4 edges, CCW winding).
2. **Given** a multi-room plan with shared walls, **When** perimeter edges are computed, **Then** shared interior walls are excluded — only exterior-facing wall edges appear in the perimeter.
3. **Given** a room with an extension bump-out, **When** perimeter edges are computed, **Then** the perimeter follows the extension's outer walls (not the parent room's original wall line), correctly tracing the L-shaped or T-shaped building outline.
4. **Given** a room with a corner enclosure, **When** perimeter edges are computed, **Then** the enclosure's interior walls do NOT appear in the building perimeter — the parent room's exterior walls define the perimeter at that corner.

---

### User Story 5 - Correct Bounds Computation (Priority: P5)

A developer resolving a plan with extensions gets correct plan bounds that include extension wall geometry. Currently, `computeBounds` only iterates parent room walls, so extension walls that project beyond the parent room are missed, potentially clipping the SVG output.

**Why this priority**: This is a bug fix that falls out naturally from the unified wall graph — iterating all walls in one structure automatically includes extension walls in bounds computation.

**Independent Test**: Can be tested by resolving a plan with a north-facing extension and verifying that `plan.bounds` extends to include the extension's north wall outer edge.

**Acceptance Scenarios**:

1. **Given** a room with a north extension that projects 4ft beyond the parent room, **When** the plan is resolved, **Then** `plan.bounds` includes the full extent of the extension's north wall (parent room top + extension depth + wall thickness).
2. **Given** the same plan rendered to SVG, **When** the output is inspected, **Then** no extension walls are clipped by the viewBox.

---

### User Story 6 - Complete Validation Coverage (Priority: P6)

A developer running validation on a plan with composite rooms gets complete coverage — opening overlap detection, sealed-space checks, and run-through-wall checks apply to enclosure and extension walls, not just parent room walls. Currently, several validators only check the wall graph, missing sub-space walls entirely.

**Why this priority**: Validation completeness is important for correctness but is lower priority than the structural refactor that enables it. Once all walls are in the graph, existing validation logic automatically covers them.

**Independent Test**: Can be tested by creating a config with overlapping openings on an enclosure wall and verifying the validator reports an error.

**Acceptance Scenarios**:

1. **Given** an enclosure with two overlapping door openings, **When** validation runs, **Then** an "overlapping-openings" error is reported for the enclosure wall.
2. **Given** a plumbing supply run that crosses an enclosure interior wall, **When** validation runs, **Then** a "run-through-wall" warning is reported.
3. **Given** an extension with no doors or windows, **When** validation runs, **Then** a "sealed-extension" warning is reported for the extension (distinct from the "sealed-room" warning for parent rooms).

---

### Edge Cases

- What happens when an enclosure wall is collinear with a parent wall? The enclosure wall is a separate entry in the graph with its own ID and `source: "enclosure"` metadata. It is not merged with the parent wall.
- What happens when two extensions on the same parent wall create adjacent walls? Each extension's walls are separate entries. They are not merged into shared walls (extensions don't share walls with each other — only rooms share walls with rooms).
- What happens when a wall-based enclosure spans the full length of a parent wall (`length: "full"`)? The enclosure's facing wall runs the full parent wall interior length. It appears in the graph as a separate wall with `source: "enclosure"`.
- What happens with the existing `shared_walls` config override? It continues to work for parent room walls exactly as before. Enclosure and extension walls are never candidates for shared-wall merging.
- What happens to `room.walls` on `ResolvedRoom`? It is removed. All walls live in the wall graph. `ResolvedRoom` retains `bounds`, `labelPosition`, `compositeOutline`, and references to its enclosure/extension sub-space metadata (ids, bounds, labels) but not wall geometry.
- What happens to plans with no shared walls (single room)? The wall graph contains the room's 4 parent walls as non-shared entries. The perimeter edges form a simple rectangle. Behavior is identical to current output.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST replace the `ResolvedWall` and `PlanWall` types with a single `Wall` type that carries room ownership (`roomId`), optional sub-space ownership (`subSpaceId`), source classification (`"parent" | "enclosure" | "extension"`), and shared-wall flag.
- **FR-002**: System MUST produce a single `WallGraph` containing ALL walls — parent room walls (shared, remainder, and non-shared), enclosure interior walls, and extension exterior walls.
- **FR-003**: System MUST render all walls from the unified wall graph in a single rendering pass — no separate enclosure or extension wall rendering paths.
- **FR-004**: System MUST support wall lookup by ID for all wall sources (parent, enclosure, extension) through the existing `findWallById` interface.
- **FR-005**: System MUST compute plan bounds by iterating all walls in the unified graph, including extension walls that project beyond parent room geometry.
- **FR-006**: System MUST derive ordered perimeter edges from the unified wall graph — closed chains of exterior wall outer-edges forming the building outline, excluding interior and shared walls.
- **FR-007**: System MUST exclude enclosure interior walls from perimeter edges (enclosures are inward sub-spaces; their walls are interior to the building).
- **FR-008**: System MUST include extension exterior walls in perimeter edges (extensions project outward and form part of the building envelope).
- **FR-008a**: System MUST wind perimeter edges in CCW (counter-clockwise) order, consistent with the existing compositeOutline convention.
- **FR-009**: System MUST maintain the existing `byRoom` index on the wall graph and add a separate `bySubSpace` index for enclosure and extension wall lookup by sub-space ID and direction.
- **FR-010**: System MUST apply all existing validation checks (overlapping openings, opening exceeds wall, sealed room, run through wall) to enclosure and extension walls, not just parent room walls.
- **FR-011**: System MUST NOT change the YAML/JSON configuration format — this is a purely internal refactor of resolved output types.
- **FR-012**: System MUST produce visually identical rendered output (verified by PNG inspection) for all existing example files and test cases. SVG source element ordering may differ due to unified iteration.
- **FR-013**: System MUST preserve all existing shared-wall behavior: gap-aware detection, thicker-wins rule, centered-in-gap positioning, opening merging, and vertical wall corner gap-filling.
- **FR-014**: System MUST preserve the `shared_walls` config override mechanism for parent room walls.
- **FR-015**: System MUST remove `walls` from `ResolvedRoom`, `ResolvedEnclosure`, and `ResolvedExtension` — wall geometry lives only in the wall graph.

### Key Entities

- **Wall**: A single wall segment with full geometry (rect, edges, thickness, segments, openings), ownership metadata (roomId, subSpaceId, source, shared), and composition data (stud, finish, type). Replaces both `ResolvedWall` and `PlanWall`.
- **WallGraph**: A plan-level collection of all `Wall` instances with indexes for efficient lookup: `byRoom` (roomId + direction), `bySubSpace` (subSpaceId + direction), and `walls` (flat list). Single source of truth for all wall geometry.
- **PerimeterEdge**: An ordered segment of the building's exterior outline, derived from exterior-facing wall outer-edges. A chain of perimeter edges forms a closed polygon representing the building footprint.
- **WallSource**: Classification of where a wall originates — `"parent"` (room cardinal wall), `"enclosure"` (interior sub-space wall), or `"extension"` (exterior bump-out wall).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 174 existing tests pass. Test code may update type names and wall access patterns (querying `wallGraph` instead of `room.walls`), but test intent and expected values remain the same.
- **SC-002**: SVG output for all existing example YAML files is visually identical to current output (verified by visual inspection of rendered PNGs).
- **SC-003**: The `ResolvedWall` and `PlanWall` types no longer exist in the codebase — only `Wall` remains.
- **SC-004**: The SVG renderer has exactly one wall rendering code path (no conditional branching between wall graph, enclosure walls, and extension walls).
- **SC-005**: `findWallById` successfully resolves walls for parent rooms, enclosures, and extensions using the same lookup mechanism.
- **SC-006**: Plan bounds for a room with extensions include the full extent of extension wall geometry (no clipping).
- **SC-007**: Perimeter edges for a multi-room plan with extensions form a closed polygon that traces the building outline including bump-outs.
- **SC-008**: Validation detects overlapping openings on enclosure walls (currently undetected).

## Clarifications

### Session 2026-02-14

- Q: Should perimeter edges replace compositeOutline, coexist alongside it, or should one be derived from the other? → A: Coexist — compositeOutline remains for per-room shape (label positioning, room rendering); perimeter edges are a separate plan-level building outline computed from exterior wall edges.
- Q: What winding order should perimeter edges use? → A: CCW (counter-clockwise), matching the existing compositeOutline convention and standard exterior polygon winding.

## Assumptions

- The existing `compositeOutline` computation (coordinate-compression grid) is retained for per-room purposes (label positioning, room-level composite shape). Perimeter edges are a separate plan-level concept computed from exterior wall outer-edges in the unified wall graph. The two serve different scopes (room vs building) and are computed independently.
- Enclosure and extension walls are never candidates for shared-wall merging. Only parent room walls participate in shared-wall detection. This simplifies graph construction and matches the physical reality (a closet wall is not shared with an adjacent room).
- The `byRoom` index key format (`roomId.direction`) extends naturally to sub-spaces (`subSpaceId.direction`). Sub-space IDs are already globally unique within a plan.
- Wall IDs for sub-space walls follow the existing convention: `{subSpaceId}.{direction}` (e.g., `pantry.south`, `bay-window.north`).
- The `interiorStartOffset` field (currently on `ResolvedWall` only, used for extension far-wall opening positioning) will be carried on the unified `Wall` type for extension walls and defaulted to 0 for other wall sources.
