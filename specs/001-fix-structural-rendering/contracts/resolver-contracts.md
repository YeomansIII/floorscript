# Resolver Contracts

FloorScript is a library, not an API service. These contracts define
the function signatures and input/output shapes for the resolver layer.

## buildWallGraph()

**Location**: `packages/core/src/resolver/shared-wall-resolver.ts` (new)

```
Input:
  rooms: ResolvedRoom[]       — rooms with per-room walls resolved
  sharedWalls?: SharedWallConfig[]  — explicit overrides from config
  units: UnitSystem

Output:
  WallGraph {
    walls: PlanWall[]
    byRoom: Map<roomId, Map<direction, PlanWall>>
  }

Behavior:
  1. Collect all per-room walls into a flat list
  2. For each pair of rooms, detect shared boundary edges:
     - Room A's east edge == Room B's west edge (within epsilon)
     - Compute Y overlap range
  3. For shared edges:
     - Create single PlanWall with both room references
     - Apply "thicker wins" rule (or explicit shared_walls override)
     - Merge openings from both rooms; validate no overlaps
     - Recompute segments around merged openings
  4. For non-shared edges:
     - Create PlanWall with single room reference
  5. Build byRoom index for O(1) lookup

Error conditions:
  - Overlapping openings → recorded in ValidationResult
  - Opening exceeds wall segment → recorded in ValidationResult
```

## resolveWallComposition()

**Location**: `packages/core/src/resolver/shared-wall-resolver.ts` (new)

```
Input:
  wallConfig: WallConfig      — per-direction wall config
  wallType: WallType          — exterior/interior/load-bearing
  units: UnitSystem

Output:
  WallComposition {
    stud: StudSize | null
    studWidthFt: number
    finishA: number
    finishB: number
    totalThickness: number
  }

Behavior:
  1. If wallConfig.thickness specified → use directly, stud = null
  2. If wallConfig.stud specified → derive thickness from stud + finish
  3. If neither → use defaults based on wallType:
     - exterior: 2x6 (5.5") + 0.5" each side = 6.5" → 0.5417ft
     - interior: 2x4 (3.5") + 0.5" each side = 4.5" → 0.375ft
     - load-bearing: 2x6 (5.5") + 0.5" each side = 6.5" → 0.5417ft
```

## validatePlan()

**Location**: `packages/core/src/resolver/validation.ts` (new)

```
Input:
  plan: ResolvedPlan          — fully resolved plan with wall graph

Output:
  ValidationResult {
    errors: ValidationIssue[]
    warnings: ValidationIssue[]
  }

Checks (in order):
  1. overlapping-openings: For each PlanWall, check all opening pairs
     for position overlap along wall length
  2. opening-exceeds-wall: For each opening, check width <= wall
     segment length
  3. sealed-room: For each room, check it has at least one opening
     across all its walls in the WallGraph
  4. fixture-out-of-bounds: For each plumbing fixture with a wall
     reference, check its resolved position is inside the room bounds
  5. run-through-wall: For each supply/drain run path segment, check
     it does not cross a wall rect without an opening at that point
```

## resolveLayout() (modified)

**Location**: `packages/core/src/resolver/layout-resolver.ts` (existing)

```
Current flow:
  1. resolveRooms()           — per-room walls generated
  2. computePlanBounds()
  3. generateDimensions()
  4. resolveElectrical()
  5. resolvePlumbing()

New flow:
  1. resolveRooms()           — per-room walls generated (unchanged)
  2. buildWallGraph()         — NEW: detect shared walls, merge
  3. computePlanBounds()      — updated to use WallGraph extents
  4. generateDimensions()     — updated: neighbor-aware, deduplicated
  5. resolveElectrical()      — updated: use WallGraph for wall lookup
  6. resolvePlumbing()        — updated: support wall-relative fixtures
  7. validatePlan()           — NEW: linter pass
  8. Return ResolvedPlan with wallGraph + validation
```

## generateDimensions() (modified)

**Location**: `packages/core/src/resolver/dimension-resolver.ts`

```
Input (new):
  rooms: ResolvedRoom[]
  wallGraph: WallGraph        — NEW: for neighbor detection
  units: UnitSystem

Output:
  ResolvedDimension[]

New behavior:
  1. For each room, generate width + height dimensions
  2. Check offset direction for neighbor rooms:
     - If room exists south of current → place width dim on north side
     - If room exists west of current → place height dim on east side
     - If multiple neighbors → increase offset distance (lane stacking)
  3. Deduplicate shared-wall dimensions:
     - If room A south dim and room B north dim measure same edge
       → keep only one
  4. Dimensions measure interior clear space (sheetrock to sheetrock)
```

## findWallById() (extracted to shared utility)

**Location**: `packages/core/src/resolver/wall-utils.ts` (new)

```
Input:
  wallRef: string             — "roomId.direction" format
  wallGraph: WallGraph        — plan-level wall lookup

Output:
  { planWall: PlanWall, room: ResolvedRoom, direction: CardinalDirection }

Behavior:
  1. Parse "roomId.direction" from wallRef
  2. Look up in wallGraph.byRoom
  3. Return PlanWall + room context
  4. Throw descriptive error if not found

Note: Replaces current findWallById in electrical-resolver.ts.
Both electrical and plumbing resolvers use this shared utility.
```
