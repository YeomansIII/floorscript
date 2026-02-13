# Research: Composite Rooms

**Date**: 2026-02-13 | **Branch**: `002-composite-rooms`

## R1: Where do extensions/enclosures hook into the resolver pipeline?

**Decision**: Extensions and enclosures are resolved during `resolveRoom()` in `layout-resolver.ts`, after the parent room's bounds are established but before wall generation.

**Rationale**: The parent room's `width`/`height` define the outer bounding rectangle. Enclosures carve from it (modifying which walls exist and their lengths). Extensions project outward (adding new wall segments beyond the rectangle). Both must be resolved before `resolveWalls()` runs, because wall geometry depends on knowing which wall segments exist and their lengths.

**Alternatives considered**:
- Resolving as separate rooms in the main `resolveRooms()` loop — rejected because extensions/enclosures are semantically part of the parent room, not independent rooms. They don't participate in `adjacent_to` from external rooms.
- Post-processing pass after all rooms — rejected because wall generation needs to know about enclosures/extensions at resolve time.

**Implementation approach**:
1. After parsing parent `width`/`height` and computing `(x, y)` position
2. Call `resolveEnclosures(enclosureConfigs, parentBounds, units)` → returns `ResolvedEnclosure[]` with bounds, interior walls
3. Call `resolveExtensions(extensionConfigs, parentBounds, units)` → returns `ResolvedExtension[]` with bounds, exterior walls
4. Modify parent wall generation to account for shortened walls (enclosures) and wall gaps (extensions)
5. Compute composite outline from parent + extensions - enclosures
6. Each enclosure/extension also produces a `ResolvedRoom` entry (for labeling, fixtures, etc.)

## R2: How should `from`/`offset` be added to OpeningConfig?

**Decision**: Add optional `from` (CardinalDirection) and `offset` (Dimension) fields alongside the existing `position` field. The Zod schema validates that either `position` alone or `from`+`offset` is provided (not both).

**Rationale**: Backward compatibility requires keeping `position`. The `from`/`offset` pair is a direct mapping from voice transcript language. Making them mutually exclusive with `position` avoids ambiguity.

**Alternatives considered**:
- Overloading `position` to accept an object `{from, offset}` — rejected because it changes the type of an existing field, breaking Zod schema compatibility.
- Making `position` optional and always using `from`/`offset` — rejected because it breaks backward compatibility and existing YAML files.

**Implementation approach**:
1. Add `from?: CardinalDirection` and `offset?: Dimension` to `OpeningConfig` and `OpeningSchema`
2. Add Zod `.refine()` that validates: either `position` is present, or both `from` and `offset` are present, or `position` is `"center"`
3. In `resolveOpenings()`, convert `from`/`offset` to a numeric position relative to the wall start before calling `resolveOpeningGeometry()`

## R3: How should composite outlines be represented in resolved geometry?

**Decision**: Add a `compositeOutline?: Point[]` field to `ResolvedRoom`. This is an ordered list of vertices forming a closed rectilinear polygon (all edges axis-aligned). When absent, the room is a simple rectangle (backward compatible).

**Rationale**: The composite outline is needed by the renderer for drawing room boundaries, by the dimension resolver for tracing exterior edges, and by the label renderer for computing the centroid. A simple `Point[]` is the most flexible representation for a rectilinear polygon.

**Alternatives considered**:
- A separate `CompositeOutline` type with edges and metadata — rejected as over-engineering for rectilinear polygons.
- Storing the outline on the plan level rather than per-room — rejected because it's a room-level concern.
- Storing as `Rect[]` (union of rectangles) — rejected because the renderer needs a single closed path, not overlapping rectangles.

**Implementation approach**:
1. Compute in `composite-outline.ts` using sweep-line algorithm over axis-aligned rectangles
2. Input: parent `Rect` + extension `Rect[]` - enclosure `Rect[]`
3. Output: `Point[]` in counterclockwise winding order
4. Store on `ResolvedRoom.compositeOutline`

## R4: How do enclosures affect parent wall geometry?

**Decision**: Enclosures shorten the parent room's affected walls. A northwest corner enclosure with `facing: east`, `depth: 2'4"`, `length: 6'` shortens the north wall by 2'4" (from the west end) and the west wall by 6' (from the north end).

**Rationale**: This matches the physical reality — the closet occupies that corner, so the parent room's walls only extend along the exposed portions. The wall resolver already handles walls of arbitrary length; it just needs the correct reduced length.

**Implementation approach**:
1. `resolveEnclosures()` returns wall modifications: `Map<CardinalDirection, { shortenFromStart?: number, shortenFromEnd?: number }>`
2. `resolveWalls()` receives these modifications and adjusts wall `rect` dimensions accordingly
3. Enclosure interior walls (the edges facing the parent room) are generated as new `ResolvedWall` objects with `type: interior`

## R5: How do extensions create wall gaps in the parent?

**Decision**: Extensions remove a segment from the parent wall where they connect. The parent wall is split into up to two segments (before and after the gap). The extension's three exposed walls are new `ResolvedWall` objects.

**Rationale**: This is analogous to how openings already split walls into segments via `resolveWallSegments()`. The difference is that an extension gap removes the wall entirely (no frame/header like a door), and the extension adds new walls perpendicular to the parent wall.

**Implementation approach**:
1. `resolveExtensions()` returns wall gaps: `Map<CardinalDirection, Array<{ gapStart: number, gapEnd: number }>>`
2. Parent wall generation creates wall segments with these gaps (similar to opening segments but full wall removal)
3. Extension walls are generated as new `ResolvedWall` objects — the three exposed sides get `type: exterior`

## R6: How does the `facing` inference work for corner enclosures?

**Decision**: Three-tier inference: (1) explicit `facing` field → use directly; (2) door opening on one of the enclosure's interior walls → infer facing from that wall's direction; (3) neither → face the room interior along the shorter enclosure dimension.

**Rationale**: The explicit field is always unambiguous. Door inference covers the common case where a closet has a door. The shorter-dimension fallback handles the rare case where neither is specified (a closet is typically deeper than it is wide, so the shorter dimension is the face).

**Implementation approach**:
1. In `resolveEnclosures()`, for each corner enclosure:
   - If `facing` is set, use it
   - Else if any wall in the enclosure's `walls` config has openings, infer facing = that wall's direction
   - Else use the shorter dimension: if `depth < length`, face along the depth axis; if equal, use a per-corner default (NW→east, NE→west, SW→east, SE→west)
2. Once facing is determined, map `depth` to the facing axis and `length` to the perpendicular axis

## R7: How should enclosure/extension IDs work?

**Decision**: IDs are unique within the parent room. The resolved wall IDs use the format `{parentRoomId}.{subspaceId}.{direction}` (e.g., `bedroom1.closet.east`).

**Rationale**: Scoping to the parent room matches the YAML nesting. The dotted ID format is consistent with existing wall IDs (`room.direction`) and extends naturally to sub-spaces.

**Alternatives considered**:
- Global uniqueness — rejected as unnecessary burden on LLMs.
- Flat namespace mixed with rooms — rejected because enclosures are semantically children of rooms.

## R8: Rectilinear polygon union algorithm

**Decision**: Use a coordinate-compression sweep-line approach for computing the union of axis-aligned rectangles.

**Rationale**: All rectangles are axis-aligned (no rotation), so the union is guaranteed to produce a rectilinear polygon. This is a well-studied problem with O(n log n) sweep-line solutions.

**Implementation approach**:
1. Collect all unique X and Y coordinates from all rectangles (parent + extensions)
2. Create a 2D grid of cells between coordinate pairs
3. Mark cells as "inside" if they fall within any rectangle and NOT within any enclosure rectangle
4. Trace the boundary of the inside region to produce an ordered vertex list
5. Simplify by removing collinear vertices (straight-line segments)

This is pure geometry with no external dependencies. Input: `Rect[]` (include) and `Rect[]` (exclude). Output: `Point[]`.
