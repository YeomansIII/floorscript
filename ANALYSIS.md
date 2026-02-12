# FloorScript Structural Analysis & Improvement Plan

## Table of Contents

1. [Root Cause Analysis of Visible Bugs](#1-root-cause-analysis-of-visible-bugs)
2. [Architectural Deficiencies](#2-architectural-deficiencies)
3. [Structural Changes Required](#3-structural-changes-required)
4. [Implementation Plan by Package](#4-implementation-plan-by-package)
5. [Recommended Implementation Order](#5-recommended-implementation-order)
6. [YAML Config Format Changes](#6-yaml-config-format-changes)
7. [Risk Assessment](#7-risk-assessment)

---

## 1. Root Cause Analysis of Visible Bugs

### 1.1 Double Walls Between Adjacent Rooms

**Symptom:** Every adjacent room pair shows two separate walls with a visible gap between them (Living/Kitchen, Living/Bathroom, Kitchen/Hallway).

**Root Cause:** `wall-resolver.ts` generates 4 independent walls per room unconditionally. There is zero shared-wall logic anywhere in the codebase. When a kitchen is placed adjacent to a living room via `adjacent_to: { room: living, wall: east }`, the layout resolver positions the kitchen's `bounds.x` at `living.x + living.width`. Both rooms then independently generate walls at that boundary:

- Living room east wall: `{x: 14.625, y: 0, width: 0.375, height: 12}` (interior, 4.5" thick)
- Kitchen west wall: `{x: 15, y: 2, width: 0.375, height: 10}` (interior, 4.5" thick)

These are separate rectangles separated by a visible gap. The total wall material is 0.75ft (9 inches) — nearly double what it should be. The SPEC (Section 3.3.2) explicitly describes shared wall merging with "thicker wall wins" semantics, but this was never implemented.

**Files involved:**
- `packages/core/src/resolver/wall-resolver.ts` — generates walls per-room, no awareness of neighbors
- `packages/core/src/resolver/layout-resolver.ts` — resolves rooms sequentially, never revisits walls
- `packages/core/src/types/geometry.ts` — `ResolvedWall` has no concept of ownership by multiple rooms

---

### 1.2 Rectangular-Only Rooms (No L-Shapes, Polygons)

**Symptom:** Every room is a rigid axis-aligned rectangle with exactly 4 walls (N/S/E/W).

**Root Cause:** The entire pipeline is hardcoded around `Rect` (x, y, width, height):

- **Config types** (`config.ts`): `RoomConfig` only has `width` and `height` — no polygon/vertex support
- **Wall resolver** (`wall-resolver.ts`): Hardcoded `directions: ["north", "south", "east", "west"]` loop, each wall derived from `Rect` bounds
- **Geometry types** (`geometry.ts`): `ResolvedRoom` has `bounds: Rect` and `walls: ResolvedWall[]` where each wall has a `direction: CardinalDirection`
- **Renderers**: All wall/door/window renderers branch on cardinal direction (`switch (dir) { case "north": ... }`)

There is no vertex list, polygon, or wall-segment-based room definition anywhere. The SPEC (Section 3.4) describes standalone wall elements with arbitrary `start`/`end` points, but this is unimplemented.

**Files involved:**
- `packages/core/src/types/config.ts` — `RoomConfig` schema (width/height only)
- `packages/core/src/types/geometry.ts` — `ResolvedRoom` (Rect bounds only)
- `packages/core/src/resolver/wall-resolver.ts` — 4-direction loop
- All renderers in `packages/render-svg/src/renderers/`

---

### 1.3 Bathroom Door Rendered Incorrectly

**Symptom:** The bathroom door on the north wall swings through the double-wall region and appears to clip into the living room.

**Root Cause:** This is a compound bug with two contributing factors:

**Factor 1 — Double wall blocks the door opening.** The bathroom's north wall has a door opening, but the living room's south wall is a separate, solid wall directly above it. The opening only cuts through the bathroom's wall, not the living room's wall. So the door is opening into a solid wall.

**Factor 2 — "Inward" direction ambiguity.** Per SPEC Section 3.5, swing direction is "relative to the room the door belongs to." For the bathroom's north wall with `swing: inward-left`, "inward" means into the bathroom. In the door renderer (`door-renderer.ts`), for `case "north"` with `isInward=true`:

```typescript
doorEndPoint = { x: hingePoint.x, y: hingePoint.y + doorWidth };
```

In SVG coordinates (Y-down), `y + doorWidth` moves the door leaf downward, which IS into the bathroom (correct direction). However, the hinge point is computed from `gapStart`/`gapEnd` which are on the bathroom's north wall inner edge. Because of the double-wall problem, this hinge position is inside the gap between the two walls, not at the room boundary a person would walk through. The arc sweeps through the dead zone between the two walls.

**Factor 3 — The gapStart/gapEnd Y coordinate.** For the bathroom's north wall, the opening resolver computes `gapStart.y = rect.y` where `rect.y = bathroom.y + bathroom.height - thickness = -0.375`. This is inside the double-wall gap. When transformed to SVG, the door arc starts from within the wall stack rather than from the room's actual entry point.

**Files involved:**
- `packages/render-svg/src/renderers/door-renderer.ts` — swing geometry calculation
- `packages/core/src/resolver/opening-resolver.ts` — gap position computation
- `packages/core/src/resolver/wall-resolver.ts` — wall rect positioning

---

### 1.4 Bathroom Fixtures Not Against Walls

**Symptom:** Toilet and sink float in the middle of the bathroom rather than being against walls.

**Root Cause:** Plumbing fixtures use **plan-absolute coordinates** with no room-relative positioning. From the YAML:

```yaml
- id: bath-toilet
  type: toilet
  position: [2, -4.5]
```

The bare numbers `[2, -4.5]` are parsed as feet in plan-absolute space. The bathroom bounds are `{x: 0, y: -6, width: 8, height: 6}`. So the toilet is at (2ft, -4.5ft) — 2ft from the west wall and 1.5ft from the south wall. This is roughly correct for a toilet position.

However, the plumbing resolver (`plumbing-resolver.ts`) does NO room-relative coordinate resolution. Unlike electrical elements (which reference walls via `wall: bathroom.west`), plumbing fixtures have no `wall` or `room` reference. The user must manually calculate plan-absolute coordinates, which:

1. Breaks when room positions change (e.g., if the bathroom moves via `adjacent_to` changes)
2. Doesn't account for wall thickness (fixtures should be positioned relative to the inner wall face)
3. Makes it nearly impossible to position a fixture "against the south wall" without knowing the exact wall Y coordinate

The toilet at `(2, -4.5)` places it 1.5ft from the south outer edge but the wall is 0.5ft thick (exterior), so it's actually 1.0ft from the inner wall face — floating about a foot away from the wall.

**Files involved:**
- `packages/core/src/resolver/plumbing-resolver.ts` — all-absolute coordinate resolution
- `packages/core/src/types/config.ts` — `PlumbingFixtureConfig.position` is `DimensionTuple` (absolute)

---

### 1.5 Supply Lines Go Nowhere

**Symptom:** Hot and cold supply lines terminate in empty space near the bathroom's north wall boundary.

**Root Cause:** The supply runs are defined as:

```yaml
supply_runs:
  - type: cold
    path: [[5, -4], [5, -1]]
  - type: hot
    path: [[5.5, -4], [5.5, -1]]
```

The endpoint `y = -1` is above the bathroom's north wall (at y = 0) but below the living room's south wall inner face (at y = 0.5). The lines terminate in the dead zone between the double walls — literally in the wall gap. There's no "supply entry point" concept, no connection to a main line, and no validation that the path endpoints are meaningful.

The resolver passes these coordinates through unchanged. The renderer draws polylines that just stop in space.

**Files involved:**
- `packages/core/src/resolver/plumbing-resolver.ts` — no path validation
- `packages/render-svg/src/renderers/plumbing-renderer.ts` — renders raw polylines

---

### 1.6 Drain Line Exits the Building

**Symptom:** The green drain line from the toilet extends below the bathroom's south exterior wall.

**Root Cause:** The drain run is:

```yaml
drain_runs:
  - path: [[2, -4.5], [2, -6]]
```

The endpoint `y = -6` is exactly the outer edge of the bathroom's south wall. The drain line renders on top of the wall fill, then the wall renders on top of it (layer ordering). More fundamentally, there's no concept of a drain exit point through a wall, no wall penetration symbol, and no validation that the path doesn't clip through geometry.

---

### 1.7 Hallway Label Overlaps Dimension Text

**Symptom:** "Hallway" and "12'-0"" are drawn on top of each other.

**Root Cause:** The dimension resolver (`dimension-resolver.ts`) generates dimension lines at a fixed 2ft offset from each room. The kitchen's width dimension is placed 2ft below the kitchen's south wall — which happens to be right where the hallway label sits. There is zero collision detection between:

- Room labels and dimension lines
- Dimension lines from different rooms
- Any text elements at all

The hallway is only 3ft tall, so its label position (center of room) is 1.5ft from its top wall, which nearly coincides with the kitchen's width dimension line.

**Files involved:**
- `packages/core/src/resolver/dimension-resolver.ts` — fixed offset, no collision avoidance
- `packages/render-svg/src/renderers/label-renderer.ts` — no awareness of other text

---

### 1.8 Hallway Has No Doors (Dead-End Box)

**Symptom:** The hallway is a sealed rectangle with no way in or out.

**Root Cause:** The hallway config defines 4 interior walls with no openings:

```yaml
walls:
  north: { type: interior }
  south: { type: interior }
  east: { type: interior }
  west: { type: interior }
```

This is a YAML authoring issue, but the system provides no warning. A room with no openings is architecturally invalid. There's no validation that rooms are accessible.

---

### 1.9 Cased Opening Nearly Invisible

**Symptom:** The 6ft cased opening between Living Room and Kitchen renders as two tiny tick marks.

**Root Cause:** The cased opening renderer (`door-renderer.ts:renderCasedOpening`) draws only two small perpendicular tick marks at the gap endpoints:

```typescript
const tickLen = scaleValue(opening.wallThickness, ctx);
dc.line(gapStart.x, gapStart.y - tickLen/2, gapStart.x, gapStart.y + tickLen/2);
dc.line(gapEnd.x, gapEnd.y - tickLen/2, gapEnd.x, gapEnd.y + tickLen/2);
```

The tick length equals the wall thickness (0.375ft = ~14px at render scale). For a 6ft opening, these tiny marks at the edges are nearly invisible. Standard architectural convention shows cased openings with visible casing lines (thicker marks or L-shaped corners), not microscopic ticks.

Additionally, the cased opening is rendered on the double-wall boundary between the two rooms, where the wall gap makes it even harder to see.

**Files involved:**
- `packages/render-svg/src/renderers/door-renderer.ts` — `renderCasedOpening()`

---

### 1.10 Kitchen Dimension Line Misplaced

**Symptom:** The "12'-0"" dimension for the kitchen width appears at the hallway level, overlapping with the hallway label.

**Root Cause:** Every room gets a width dimension placed below its south wall at a fixed 2ft offset. The kitchen's south wall is at the same Y level as the hallway's north wall (due to adjacency), so the kitchen's width dimension line lands right in the hallway's vertical space.

---

## 2. Architectural Deficiencies

### 2.1 No Plan-Level Wall Graph

The most fundamental deficiency is the lack of a plan-level wall representation. Currently, walls exist only as properties of rooms. There is no data structure that represents "the wall between the kitchen and dining room" as a single entity. This prevents:

- Shared wall merging
- Opening placement on shared walls
- Consistent wall thickness resolution
- Proper door swing direction (which side is "inward"?)

### 2.2 Room Model Too Rigid

The `Rect`-based room model cannot represent:

- L-shaped rooms (e.g., a living room that wraps around a staircase)
- Rooms with angled walls
- Rooms with more than 4 walls
- Rooms with fewer than 4 walls (3-wall alcoves)

### 2.3 Plumbing Has No Room Context

Electrical elements reference walls (`wall: kitchen.south`), which gives them room-relative positioning. Plumbing has no equivalent — all positions are plan-absolute. This is inconsistent and fragile.

### 2.4 No Coordinate Validation

Nothing validates that:

- Fixtures are inside their intended room
- Runs don't pass through walls
- Openings don't exceed wall length
- Rooms don't overlap

### 2.5 No Text Collision Avoidance

Labels, dimensions, and annotation text can overlap freely. There's no bounding-box tracking, no nudging, and no warning.

### 2.6 Dimension Lines Are Non-Configurable

Auto-generated dimensions use a fixed 2ft offset and can't be overridden. The SPEC defines `ManualDimensionConfig` but it's parsed and discarded — the resolver ignores it.

---

## 3. Structural Changes Required

### 3.1 Shared Wall System (Critical — fixes bugs 1.1, 1.3, 1.4, 1.5, 1.9)

**New concept: `WallGraph`** — a plan-level structure that owns all walls, independent of rooms.

#### New Types

```typescript
// A wall segment in the plan, potentially shared by two rooms
interface PlanWall {
  id: string;
  // The two rooms this wall separates (null = exterior/boundary)
  roomA: string | null;
  roomB: string | null;
  // Which cardinal direction this wall is for each room
  directionInA?: CardinalDirection;
  directionInB?: CardinalDirection;
  // Geometry
  type: WallType;
  thickness: number;
  lineWeight: number;
  // The wall centerline (before thickness is applied)
  centerline: LineSegment;
  // Computed from centerline + thickness
  outerEdge: LineSegment;  // toward roomA (or exterior)
  innerEdge: LineSegment;  // toward roomB (or interior)
  rect: Rect;
  openings: ResolvedOpening[];
  segments: Rect[];
}

interface WallGraph {
  walls: PlanWall[];
  // Quick lookup: given a room ID and direction, find the wall
  wallsByRoom: Map<string, Map<CardinalDirection, PlanWall>>;
}
```

#### Resolution Algorithm

```
1. Resolve all room positions (existing adjacency logic)
2. Build wall graph:
   a. For each room, identify its 4 boundary edges
   b. For each edge, check if another room's edge overlaps (shared wall detection)
   c. If shared: create ONE PlanWall with both room references
      - Use the thicker wall type (or explicit shared_walls config)
      - Center the wall on the boundary line
   d. If not shared: create a PlanWall with one room reference
3. Resolve openings on PlanWalls (not on per-room walls)
4. Compute wall segments around openings
5. Return WallGraph as part of ResolvedPlan
```

#### Shared Wall Detection Logic

Two walls are shared when their edges overlap on the same line:

```
Room A east wall outer edge: x = A.x + A.width
Room B west wall outer edge: x = B.x

If A.x + A.width == B.x (within epsilon):
  Compute Y overlap: max(A.y, B.y) to min(A.y + A.height, B.y + B.height)
  If overlap > 0: these walls are shared along the overlap segment
```

For the shared portion, create a single wall. For non-overlapping portions, create separate walls for each room. This naturally handles rooms of different heights sharing a partial wall.

#### Impact on Rendering

The wall renderer iterates `WallGraph.walls` instead of `room.walls`. Each wall is rendered exactly once. Door/window openings on shared walls automatically work because the opening cuts through the single shared wall.

---

### 3.2 Polygon Room Support (Important — fixes bug 1.2)

This is a larger change that can be phased. The approach:

#### Phase 1: Composite Rectangular Rooms

Allow rooms to be defined as a union of rectangles:

```yaml
rooms:
  - id: living
    label: "Living Room"
    position: [0, 0]
    shape:
      - rect: { width: 20ft, height: 15ft }
      - rect: { x: 20ft, y: 0, width: 8ft, height: 10ft }  # alcove
```

This keeps the rectangular wall logic but allows L-shapes, T-shapes, and U-shapes. Each sub-rectangle generates walls, then internal walls between sub-rectangles are removed.

#### Phase 2: Polygon Rooms (Future)

```yaml
rooms:
  - id: living
    label: "Living Room"
    vertices:
      - [0, 0]
      - [20ft, 0]
      - [20ft, 10ft]
      - [28ft, 10ft]
      - [28ft, 15ft]
      - [0, 15ft]
```

This requires:
- Replacing `CardinalDirection` walls with indexed wall segments
- Updating all renderers to handle arbitrary angles
- New opening placement logic (position along a segment rather than cardinal offset)

**Recommendation:** Implement Phase 1 first. It handles 90% of real residential floor plan shapes while preserving the existing cardinal-direction wall system.

---

### 3.3 Room-Relative Plumbing Coordinates (Important — fixes bugs 1.4, 1.5, 1.6)

Add wall-relative and room-relative positioning for plumbing fixtures, matching the electrical system:

```yaml
plumbing:
  fixtures:
    - id: bath-toilet
      type: toilet
      wall: bathroom.south     # NEW: wall reference
      position: 2ft            # distance along wall from start
      offset: 0in              # distance from wall inner face (0 = against wall)
      orientation: facing-north # NEW: which way the fixture faces

    - id: bath-sink
      type: bath-sink
      wall: bathroom.west
      position: 3ft
      offset: 0in
```

**Implementation:**
- Add `wall` and `offset` fields to `PlumbingFixtureConfig`
- Add `orientation` field for fixtures that have a facing direction
- In `plumbing-resolver.ts`, use `findWallById()` (already exists in `electrical-resolver.ts`) to resolve wall references
- Compute absolute position from wall inner face + offset + along-wall position
- Keep raw `position: [x, y]` as a fallback for backwards compatibility

Supply and drain runs should also support room-relative coordinates:

```yaml
supply_runs:
  - type: cold
    from: bath-sink              # NEW: fixture reference
    to: { wall: bathroom.north, position: 5ft }  # exit point
    size: "1/2in"
```

---

### 3.4 Door Swing Fix (Critical — fixes bug 1.3)

Once shared walls exist, the door swing logic simplifies dramatically. Currently, "inward" for a door on `bathroom.north` is ambiguous because there are two walls. With a shared wall:

1. The door is placed on the single shared `PlanWall` between living room and bathroom
2. "Inward" is relative to the room that **owns** the opening config — the bathroom
3. The hinge point is on the wall's centerline (or inner face toward the bathroom)
4. The arc sweeps into the bathroom's interior space

The door renderer needs to know **which room's interior** the door swings into. This information comes from the `PlanWall.roomA`/`roomB` association and the opening's owning room.

Additionally, independent of the shared wall fix, the current door renderer has logic that should be verified against all 16 combinations (4 walls x 4 swing types) with visual tests.

---

### 3.5 Improved Dimension Placement (Moderate — fixes bugs 1.7, 1.10)

#### Smart Offset Calculation

Instead of a fixed 2ft offset, dimensions should:

1. Check for neighboring rooms in the offset direction
2. If a neighbor exists, place the dimension on the opposite side or further out
3. Track occupied dimension "lanes" to avoid stacking

```typescript
function chooseDimensionOffset(
  room: ResolvedRoom,
  side: "south" | "west",
  allRooms: ResolvedRoom[],
  existingDimensions: ResolvedDimension[],
): number {
  const baseOffset = 2; // ft
  // Check if another room is within baseOffset distance on this side
  // If so, increase offset or move to opposite side
  // Check if existing dimension lines would overlap
  // Return adjusted offset
}
```

#### Dimension Deduplication

When two adjacent rooms share a wall, their dimension lines along that shared edge are often redundant. The dimension resolver should detect shared edges and only generate one dimension line.

#### Manual Dimension Support

Implement the already-parsed `ManualDimensionConfig` to allow users to override auto-generated dimensions. When manual dimensions exist for a room, skip auto-generation for that room/axis.

---

### 3.6 Cased Opening Rendering Improvement (Minor — fixes bug 1.9)

Replace the tiny tick marks with a proper cased opening symbol:

```typescript
function renderCasedOpening(opening, ctx, dc) {
  const gapStart = toSvg(opening.gapStart, ctx);
  const gapEnd = toSvg(opening.gapEnd, ctx);
  const casingDepth = scaleValue(opening.wallThickness * 0.75, ctx);

  // Draw L-shaped casing marks at each end of the opening
  // These should be clearly visible and indicate the casing trim
  if (dir === "south" || dir === "north") {
    // Left casing: vertical line + short horizontal return
    dc.line(gapStart.x, gapStart.y - casingDepth, gapStart.x, gapStart.y + casingDepth);
    dc.line(gapStart.x, gapStart.y - casingDepth, gapStart.x + casingReturn, gapStart.y - casingDepth);
    dc.line(gapStart.x, gapStart.y + casingDepth, gapStart.x + casingReturn, gapStart.y + casingDepth);
    // Right casing: mirror
    // ...
  }
  // Also draw a dashed centerline through the opening to indicate passage
}
```

---

## 4. Implementation Plan by Package

### 4.1 `@floorscript/core` Changes

#### `types/config.ts`

| Change | Description |
|--------|-------------|
| Add `SharedWallConfig` | Schema for `shared_walls` YAML section |
| Add `shape` to `RoomConfig` | Optional composite rectangle shape definition |
| Add `wall` to `PlumbingFixtureConfig` | Wall reference for room-relative positioning |
| Add `orientation` to `PlumbingFixtureConfig` | Fixture facing direction |
| Add `from`/`to` fixture refs for runs | Supply/drain endpoint references |

#### `types/geometry.ts`

| Change | Description |
|--------|-------------|
| Add `PlanWall` interface | Plan-level wall with dual-room ownership |
| Add `WallGraph` interface | Collection of PlanWalls with lookup index |
| Add `WallGraph` to `ResolvedPlan` | Replace per-room wall rendering with plan-level walls |
| Add `owningRoom` to `ResolvedOpening` | Track which room's config defined the opening |
| Keep `ResolvedRoom.walls` | Backward compat — but these now reference PlanWalls |

#### `resolver/wall-resolver.ts`

| Change | Description |
|--------|-------------|
| Refactor to `buildWallGraph()` | New entry point that processes all rooms together |
| Add `detectSharedWalls()` | Edge-overlap detection between room pairs |
| Add `mergeSharedWall()` | Creates single PlanWall from two room edges |
| Add `resolveWallThickness()` | "Thicker wins" logic + explicit override |

#### `resolver/layout-resolver.ts`

| Change | Description |
|--------|-------------|
| Call `buildWallGraph()` after all rooms resolved | Plan-level wall resolution |
| Process `shared_walls` config | Apply explicit shared wall overrides |
| Pass `WallGraph` to opening resolver | Openings resolve against plan walls |
| Include `WallGraph` in `ResolvedPlan` | For rendering |

#### `resolver/opening-resolver.ts`

| Change | Description |
|--------|-------------|
| Accept `PlanWall` instead of `ResolvedWall` | Work with plan-level walls |
| Track `owningRoom` on openings | For door swing direction resolution |

#### `resolver/plumbing-resolver.ts`

| Change | Description |
|--------|-------------|
| Add wall-relative fixture resolution | Use `findWallById()` for wall references |
| Add fixture reference resolution for runs | Resolve `from: bath-sink` to coordinates |
| Keep absolute fallback | Backwards compatibility |

#### `resolver/dimension-resolver.ts`

| Change | Description |
|--------|-------------|
| Smart offset calculation | Avoid neighbor rooms and existing dimensions |
| Dimension deduplication on shared walls | Skip redundant dimensions |
| Manual dimension support | Process `ManualDimensionConfig` |

#### New file: `resolver/validation.ts`

| Check | Description |
|-------|-------------|
| Room overlap detection | Warn if room bounds intersect |
| Opening width validation | Error if opening wider than wall segment |
| Fixture bounds checking | Warn if fixture position is outside its room |
| Sealed room detection | Warn if a room has no openings |
| Run path validation | Warn if run passes through walls |

---

### 4.2 `@floorscript/render-svg` Changes

#### `render-svg.ts`

| Change | Description |
|--------|-------------|
| Render from `WallGraph` | Iterate plan walls instead of room walls |
| Deduplicate wall rendering | Each PlanWall rendered exactly once |

#### `renderers/wall-renderer.ts`

| Change | Description |
|--------|-------------|
| Accept `PlanWall` | Render plan-level walls |
| No change to rect rendering | Segments still work the same way |

#### `renderers/door-renderer.ts`

| Change | Description |
|--------|-------------|
| Use `owningRoom` for swing direction | "Inward" is into the owning room |
| Fix hinge/arc point for shared walls | Compute from wall centerline, not edge |
| Improve cased opening rendering | Larger, more visible casing marks |
| Add door styles (sliding, pocket, etc.) | Currently only standard + cased-opening render |

#### `renderers/plumbing-renderer.ts`

| Change | Description |
|--------|-------------|
| No renderer changes needed | Positions are absolute after resolution |
| Fixture orientation support | Rotate fixture symbols based on `orientation` |

#### `renderers/dimension-renderer.ts`

| Change | Description |
|--------|-------------|
| No renderer changes needed | Smart placement handled in resolver |

---

## 5. Recommended Implementation Order

### Phase 1: Shared Wall System (fixes the most visible bugs)

**Estimated scope:** ~400-500 lines of new/modified code

1. **Add `PlanWall` and `WallGraph` types** to `geometry.ts`
2. **Implement `buildWallGraph()`** in `wall-resolver.ts`:
   - Generate initial 4-wall set per room (existing logic)
   - Run `detectSharedWalls()` across all room pairs
   - Merge shared walls into single `PlanWall` entries
   - Resolve openings on merged walls
3. **Update `layout-resolver.ts`** to call `buildWallGraph()` and include in plan
4. **Update `render-svg.ts`** to render from `WallGraph`
5. **Fix door renderer** to use `owningRoom` for swing direction
6. **Update tests** for shared wall scenarios
7. **Update `multi-room.yaml`** with `shared_walls` config
8. **Visual verification** of rendered output

### Phase 2: Plumbing Room-Relative Coordinates

**Estimated scope:** ~150-200 lines of new/modified code

1. **Add `wall` and `orientation` fields** to plumbing config types
2. **Update `plumbing-resolver.ts`** with wall-relative resolution
3. **Update `multi-room.yaml`** plumbing section
4. **Add fixture orientation** to plumbing renderer
5. **Visual verification**

### Phase 3: Dimension Improvements

**Estimated scope:** ~100-150 lines of new/modified code

1. **Smart offset calculation** in dimension resolver
2. **Deduplication** for shared wall dimensions
3. **Manual dimension support** (parse + resolve)
4. **Visual verification**

### Phase 4: Composite Rectangular Rooms

**Estimated scope:** ~300-400 lines of new/modified code

1. **Add `shape` config** to room schema
2. **Update room resolution** to handle composite shapes
3. **Internal wall removal** between sub-rectangles
4. **Wall graph integration** for composite rooms
5. **Label positioning** for non-rectangular rooms (centroid calculation)
6. **Tests and visual verification**

### Phase 5: Validation & Polish

**Estimated scope:** ~200 lines of new code

1. **Implement `validation.ts`** with all checks
2. **Improve cased opening rendering**
3. **Add missing door styles** (sliding, pocket, bifold)
4. **Add text collision warnings**

---

## 6. YAML Config Format Changes

### Current (broken)

```yaml
rooms:
  - id: living
    position: [0, 0]
    width: 15ft
    height: 12ft
    walls:
      east: { type: interior }  # Living room's east wall

  - id: kitchen
    adjacent_to:
      room: living
      wall: east
    width: 12ft
    height: 10ft
    walls:
      west: { type: interior }  # Kitchen's west wall — DUPLICATE
```

### Proposed (with shared walls)

```yaml
rooms:
  - id: living
    position: [0, 0]
    width: 15ft
    height: 12ft
    walls:
      east: { type: interior }

  - id: kitchen
    adjacent_to:
      room: living
      wall: east
    width: 12ft
    height: 10ft
    walls:
      west: { type: interior }

# Explicit shared wall config (optional — auto-detected when omitted)
shared_walls:
  - rooms: [living, kitchen]
    wall: east/west
    thickness: 4.5in
    openings:
      - type: cased-opening
        position: 1ft
        width: 6ft
```

When `shared_walls` is omitted, the system auto-detects adjacency and merges walls using the "thicker wins" rule. The individual room wall configs (`living.east`, `kitchen.west`) are still used for wall type and default thickness, but only one physical wall is generated.

### Proposed Plumbing (room-relative)

```yaml
plumbing:
  fixtures:
    - id: bath-toilet
      type: toilet
      wall: bathroom.south
      position: 2ft
      offset: 0in
      orientation: facing-north

    - id: bath-sink
      type: bath-sink
      wall: bathroom.west
      position: 3ft
      offset: 0in
      orientation: facing-east

  supply_runs:
    - type: cold
      from: bath-sink
      to: { wall: bathroom.north, position: 5ft }
      size: "1/2in"
```

### Proposed Composite Room Shape

```yaml
rooms:
  - id: living
    label: "Living Room"
    position: [0, 0]
    shape:
      - { width: 20ft, height: 15ft }
      - { x: 20ft, y: 0, width: 8ft, height: 10ft }
    walls:
      exterior: [north, west, south]  # simplified wall type assignment
```

---

## 7. Risk Assessment

### High Risk

| Change | Risk | Mitigation |
|--------|------|------------|
| Wall graph refactor | Breaks all existing wall rendering and tests | Maintain backwards compat: keep `room.walls` populated from WallGraph lookups |
| Door swing logic changes | Subtle geometry bugs across 16 swing combinations | Create exhaustive visual test matrix for all wall/swing combos |
| Coordinate system changes for plumbing | Existing YAML files break | Keep absolute positioning as fallback; only use wall-relative when `wall:` is specified |

### Medium Risk

| Change | Risk | Mitigation |
|--------|------|------------|
| Dimension deduplication | Over-aggressive dedup removes needed dimensions | Only dedup when rooms share exact wall edges |
| Composite rooms | Complex internal wall removal logic | Limit Phase 1 to simple L/T shapes; full polygon is Phase 2 |

### Low Risk

| Change | Risk | Mitigation |
|--------|------|------------|
| Cased opening rendering | Purely visual change | Visual verification |
| Validation warnings | New code, doesn't modify existing paths | Add as optional resolver pass |
| Manual dimension support | Additive feature | No impact on auto-generation when not specified |

---

## Appendix: File Inventory

### Files that need modification

| File | Changes | Priority |
|------|---------|----------|
| `packages/core/src/types/geometry.ts` | Add PlanWall, WallGraph | Phase 1 |
| `packages/core/src/types/config.ts` | Add SharedWallConfig, plumbing wall refs | Phase 1-2 |
| `packages/core/src/resolver/wall-resolver.ts` | Major refactor → buildWallGraph | Phase 1 |
| `packages/core/src/resolver/layout-resolver.ts` | Integrate WallGraph | Phase 1 |
| `packages/core/src/resolver/opening-resolver.ts` | Accept PlanWall, track owningRoom | Phase 1 |
| `packages/core/src/resolver/segment-resolver.ts` | No changes (works with any Rect-based wall) | — |
| `packages/core/src/resolver/plumbing-resolver.ts` | Add wall-relative resolution | Phase 2 |
| `packages/core/src/resolver/dimension-resolver.ts` | Smart placement + dedup | Phase 3 |
| `packages/render-svg/src/render-svg.ts` | Render from WallGraph | Phase 1 |
| `packages/render-svg/src/renderers/wall-renderer.ts` | Accept PlanWall | Phase 1 |
| `packages/render-svg/src/renderers/door-renderer.ts` | Fix swing + improve cased opening | Phase 1 |
| `packages/render-svg/src/renderers/plumbing-renderer.ts` | Fixture orientation | Phase 2 |
| `examples/multi-room.yaml` | Update with shared_walls + plumbing fixes | Phase 1-2 |

### New files

| File | Purpose | Priority |
|------|---------|----------|
| `packages/core/src/resolver/validation.ts` | Geometric validation checks | Phase 5 |

### Test files that need updates

| File | Changes | Priority |
|------|---------|----------|
| `packages/core/__tests__/layout-resolver.test.ts` | Shared wall tests, wall graph validation | Phase 1 |
| `packages/core/__tests__/wall-resolver.test.ts` | New: wall graph construction tests | Phase 1 |
| `packages/render-svg/__tests__/integration.test.ts` | Updated SVG output expectations | Phase 1 |
| `packages/render-svg/__tests__/door-renderer.test.ts` | New: all 16 swing combinations | Phase 1 |
