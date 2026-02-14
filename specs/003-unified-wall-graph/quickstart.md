# Quickstart: Unified Wall Graph

## What Changed

The dual `ResolvedWall`/`PlanWall` type system is replaced with a single `Wall` type. All walls (parent room, enclosure, extension) now live in one `WallGraph` on `ResolvedPlan`.

## Before vs After

### Accessing walls

```typescript
// BEFORE: walls scattered across 3+ locations
const parentWalls = room.walls;                    // ResolvedWall[]
const enclosureWalls = room.enclosures[0].walls;   // ResolvedWall[]
const extensionWalls = room.extensions[0].walls;   // ResolvedWall[]
const sharedWalls = plan.wallGraph?.walls;          // PlanWall[] | undefined

// AFTER: all walls in one place
const allWalls = plan.wallGraph.walls;             // Wall[]
const kitchenNorth = plan.wallGraph.byRoom.get("kitchen")?.get("north");
const pantryWall = plan.wallGraph.bySubSpace.get("pantry")?.get("south");
```

### Wall lookups

```typescript
// BEFORE: only works for parent room walls
const { wall } = findWallById("kitchen.south", rooms, wallGraph);

// AFTER: works for any wall (parent, enclosure, extension)
const { wall } = findWallById("kitchen.south", rooms, wallGraph);  // same call
const { wall } = findWallById("pantry.south", rooms, wallGraph);   // now works!
const { wall } = findWallById("bay.north", rooms, wallGraph);      // now works!
```

### Rendering

```typescript
// BEFORE: 3 separate rendering passes
renderWallGraph(plan.wallGraph, ctx, dc);          // parent walls
renderEnclosureWalls(room.enclosures, ctx, dc);    // enclosure walls
renderExtensionWalls(room.extensions, ctx, dc);    // extension walls

// AFTER: 1 pass
renderWallGraph(plan.wallGraph, ctx, dc);          // ALL walls
```

### Wall type

```typescript
// BEFORE: two types with 11 duplicated fields
interface ResolvedWall { id, direction, type, thickness, ... }
interface PlanWall { id, roomA, roomB, shared, type, thickness, ... }

// AFTER: one type with ownership metadata
interface Wall {
  // Geometry (from both former types)
  id: string;
  direction: CardinalDirection;
  type: WallType;
  thickness: number;
  // ... all geometry fields

  // Ownership metadata (new)
  roomId: string;
  roomIdB: string | null;       // non-null for shared walls
  subSpaceId: string | null;    // non-null for enclosure/extension walls
  source: "parent" | "enclosure" | "extension";
  shared: boolean;
}
```

### Perimeter edges (new)

```typescript
// NEW: building outline from exterior wall edges
for (const chain of plan.wallGraph.perimeter) {
  for (const edge of chain.edges) {
    // edge.start, edge.end — CCW winding
    // edge.wallId — which wall this edge belongs to
    // edge.direction — outward-facing cardinal direction
  }
}
```

## Migration Guide

1. Replace `ResolvedWall` → `Wall` in all type annotations
2. Replace `PlanWall` → `Wall` in all type annotations
3. Replace `room.walls` access → `wallGraph.byRoom.get(room.id)`
4. Replace `enclosure.walls` access → `wallGraph.bySubSpace.get(enclosure.id)`
5. Replace `extension.walls` access → `wallGraph.bySubSpace.get(extension.id)`
6. Remove optional chaining on `plan.wallGraph` (now required)
7. Remove separate enclosure/extension wall rendering calls
