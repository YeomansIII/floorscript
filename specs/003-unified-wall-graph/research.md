# Research: Unified Wall Graph

## R1: Unified Wall Type Design

**Decision**: Merge `ResolvedWall` (11 fields) and `PlanWall` (17 fields) into a single `Wall` type with ownership metadata.

**Rationale**: The two types share 11 fields (`id`, `direction`, `type`, `thickness`, `lineWeight`, `outerEdge`, `innerEdge`, `rect`, `openings`, `segments`, `interiorStartOffset`). `PlanWall` adds 6 fields for shared-wall semantics (`roomA`/`roomB`, `directionInA`/`directionInB`, `composition`, `centerline`, `shared`). The unified type carries all fields, with ownership expressed via `roomId`, `subSpaceId?`, `source`, and `shared`.

**Alternatives considered**:
- Keep both types with a shared interface — rejected because it doesn't eliminate the conversion ceremony or dual rendering paths.
- Use a discriminated union (`SharedWall | OwnedWall`) — rejected because downstream consumers still need two code paths.

## R2: Wall Graph Extension Strategy

**Decision**: Extend `buildWallGraph` to accept enclosure and extension walls as additional inputs (alongside resolved rooms), then add them to the graph with correct metadata. Enclosure/extension walls skip shared-wall detection entirely.

**Rationale**: The 4-stage shared-wall resolver (detect → merge → remainder → gap-fill) only applies to parent room walls. Enclosure/extension walls are appended after stage 4 with their source metadata. This minimizes changes to the shared-wall detection logic.

**Alternatives considered**:
- Build a separate graph for sub-space walls and merge — rejected because it defeats the purpose of a unified graph.
- Have each sub-resolver (enclosure, extension) add walls directly to the graph — rejected because graph construction should be centralized for consistency.

## R3: Enclosure/Extension Resolver Output Change

**Decision**: Enclosure and extension resolvers return walls separately from metadata. `EnclosureResult` and `ExtensionResult` gain a top-level `walls: Wall[]` field alongside the existing enclosure/extension metadata arrays.

**Rationale**: Currently walls are stored on each `ResolvedEnclosure.walls` and `ResolvedExtension.walls`. To feed them into the unified graph, the layout-resolver needs access to the walls before they're attached to sub-space objects. Returning them separately is cleaner than extracting them afterward.

**Alternatives considered**:
- Extract walls from enclosure/extension objects after resolution — rejected because it requires iterating nested structures and the walls would be duplicated (on objects and in graph).

## R4: Rendering Simplification

**Decision**: Remove the per-room wall rendering fallback and the separate enclosure/extension wall rendering passes. The renderer iterates `wallGraph.walls` once.

**Rationale**: With all walls in the graph, the three separate rendering code paths (`renderWallGraph`, `renderEnclosureWalls`, `renderExtensionWalls`) collapse into one. The existing `renderWallGraph` function already iterates `PlanWall[]` — it just needs to accept `Wall[]` and include all wall sources.

**Alternatives considered**:
- Keep separate rendering for different wall sources (just pull from graph) — rejected because it adds no value if the rendering logic is identical.

## R5: Perimeter Edge Computation

**Decision**: New `perimeter-resolver.ts` computes perimeter edges from exterior-facing wall outer-edges in the unified graph. Uses directed edge chaining (same technique as composite outline) with CCW winding.

**Rationale**: Perimeter edges are derived by collecting outer-edges of non-shared walls, filtering to exterior-facing edges only (exclude enclosure interior walls), then chaining into closed polygons. This is similar to the existing composite outline algorithm but operates at plan level on wall edges rather than room-level on rectangles.

**Alternatives considered**:
- Derive from composite outlines — rejected because compositeOutline is per-room and doesn't account for multi-room building perimeters.
- Use coordinate-compression grid at plan level — rejected because we already have the wall edges; we just need to chain them.

## R6: findWallById Extension

**Decision**: Extend `findWallById` to query `wallGraph.bySubSpace` for IDs like `"pantry.south"`. The function first checks if the prefix matches a room ID (existing behavior), then checks sub-space IDs.

**Rationale**: Sub-space IDs are globally unique within a plan (Zod validates this). The lookup is: split ID into `{prefix}.{direction}`, check `byRoom`, check `bySubSpace`, return first match.

**Alternatives considered**:
- Require explicit namespace prefix (`"enclosure:pantry.south"`) — rejected because it breaks the existing `"roomId.direction"` convention and makes YAML authoring harder.

## R7: Bounds Computation Fix

**Decision**: `computeBounds` switches from iterating `room.walls` to iterating `wallGraph.walls`. This automatically includes extension walls that project beyond parent rooms.

**Rationale**: This is a bug fix. Currently extension walls are missed, which can cause SVG clipping. With the unified graph, all walls (including extensions) are in one flat list.

**Alternatives considered**:
- Keep per-room iteration but also iterate sub-space walls — rejected because the unified graph makes this unnecessary.

## R8: Migration Strategy

**Decision**: Use temporary type aliases (`type ResolvedWall = Wall; type PlanWall = Wall;`) during migration to allow incremental file-by-file updates. Remove aliases in final cleanup.

**Rationale**: Changing all ~20 source files and ~13 test files simultaneously is error-prone. Type aliases allow the codebase to compile at every intermediate step while files are migrated one at a time.

**Alternatives considered**:
- Big-bang rename — rejected because it creates a single massive commit that's hard to review and debug.
- Automated codemod — considered but the project is small enough that manual migration with aliases is clearer.
