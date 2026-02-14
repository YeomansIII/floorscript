# Data Model: Unified Wall Graph

## Type Changes

### Removed Types

- `ResolvedWall` — replaced by `Wall`
- `PlanWall` — replaced by `Wall`

### New Types

#### Wall

Unified wall type replacing both `ResolvedWall` and `PlanWall`. Carries all geometry, composition, and ownership fields.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `id` | `string` | Both | Wall identifier. Format: `"roomId.direction"` or `"roomA.dirA\|roomB.dirB"` for shared |
| `direction` | `CardinalDirection` | ResolvedWall | Primary direction (from roomA perspective for shared walls) |
| `type` | `WallType` | Both | `"exterior" \| "interior" \| "load-bearing"` |
| `thickness` | `number` | Both | Total wall thickness in canonical units |
| `lineWeight` | `number` | Both | SVG stroke weight (exterior=0.7, interior=0.5) |
| `outerEdge` | `LineSegment` | Both | Outside face line segment |
| `innerEdge` | `LineSegment` | Both | Room-facing edge line segment |
| `centerline` | `LineSegment` | PlanWall | Midpoint between outer/inner edges |
| `rect` | `Rect` | Both | Full wall bounding rectangle |
| `openings` | `ResolvedOpening[]` | Both | Openings in this wall |
| `segments` | `Rect[]` | Both | Solid wall rects (split around openings/gaps) |
| `interiorStartOffset` | `number` | ResolvedWall | Extension corner compensation (0 for non-extension walls) |
| `composition` | `WallComposition` | PlanWall | Stud/finish breakdown |
| `roomId` | `string` | **NEW** | Parent room ID (roomA for shared walls) |
| `roomIdB` | `string \| null` | PlanWall (was roomB) | Second room ID for shared walls, null otherwise |
| `directionInB` | `CardinalDirection \| null` | PlanWall | Direction from roomB perspective (shared walls only) |
| `subSpaceId` | `string \| null` | **NEW** | Enclosure/extension ID, null for parent walls |
| `source` | `WallSource` | **NEW** | `"parent" \| "enclosure" \| "extension"` |
| `shared` | `boolean` | PlanWall | Whether wall is shared between two rooms |

#### WallSource

```
"parent" | "enclosure" | "extension"
```

#### PerimeterEdge

| Field | Type | Description |
|-------|------|-------------|
| `start` | `Point` | Start point of edge segment (CCW winding) |
| `end` | `Point` | End point of edge segment |
| `wallId` | `string` | ID of the wall this edge belongs to |
| `direction` | `CardinalDirection` | Which cardinal direction this edge faces outward |

#### PerimeterChain

| Field | Type | Description |
|-------|------|-------------|
| `edges` | `PerimeterEdge[]` | Ordered edges forming a closed polygon (CCW) |
| `bounds` | `Rect` | Bounding box of the chain |

### Modified Types

#### WallGraph

| Field | Type | Change |
|-------|------|--------|
| `walls` | `Wall[]` | Was `PlanWall[]` |
| `byRoom` | `Map<string, Map<CardinalDirection, Wall>>` | Was `Map<..., PlanWall>` |
| `bySubSpace` | `Map<string, Map<CardinalDirection, Wall>>` | **NEW** — index for enclosure/extension walls |
| `perimeter` | `PerimeterChain[]` | **NEW** — derived building perimeter edges |

#### ResolvedRoom

| Field | Change |
|-------|--------|
| `walls` | **REMOVED** — wall geometry lives in WallGraph only |
| `bounds` | Unchanged |
| `labelPosition` | Unchanged |
| `compositeOutline` | Unchanged |
| `enclosures` | Retained but `walls` removed from each `ResolvedEnclosure` |
| `extensions` | Retained but `walls` removed from each `ResolvedExtension` |

#### ResolvedEnclosure

| Field | Change |
|-------|--------|
| `walls` | **REMOVED** — wall geometry lives in WallGraph only |
| `id` | Unchanged |
| `label` | Unchanged |
| `bounds` | Unchanged |

#### ResolvedExtension

| Field | Change |
|-------|--------|
| `walls` | **REMOVED** — wall geometry lives in WallGraph only |
| `id` | Unchanged |
| `label` | Unchanged |
| `bounds` | Unchanged |

#### ResolvedPlan

| Field | Change |
|-------|--------|
| `wallGraph` | **REQUIRED** (was optional `?`) — always populated |

### Resolver Output Changes

#### EnclosureResult

| Field | Type | Change |
|-------|------|--------|
| `enclosures` | `ResolvedEnclosure[]` | `walls` removed from each enclosure |
| `walls` | `Wall[]` | **NEW** — enclosure walls returned separately |
| `wallModifications` | Unchanged | |

#### ExtensionResult

| Field | Type | Change |
|-------|------|--------|
| `extensions` | `ResolvedExtension[]` | `walls` removed from each extension |
| `walls` | `Wall[]` | **NEW** — extension walls returned separately |
| `wallGaps` | Unchanged | |

## Relationships

```
ResolvedPlan
  └── wallGraph: WallGraph (REQUIRED)
        ├── walls: Wall[] (ALL walls: parent + enclosure + extension)
        ├── byRoom: Map<roomId, Map<direction, Wall>>
        ├── bySubSpace: Map<subSpaceId, Map<direction, Wall>>
        └── perimeter: PerimeterChain[] (derived, CCW winding)

  └── rooms: ResolvedRoom[]
        ├── bounds, labelPosition, compositeOutline
        ├── enclosures: ResolvedEnclosure[] (metadata only, no walls)
        └── extensions: ResolvedExtension[] (metadata only, no walls)
```

## Validation Rules

- Wall IDs must be unique within the graph
- Sub-space IDs must be globally unique within a plan (enforced by Zod config schema)
- `source` must match the wall's origin: `"parent"` for room cardinal walls, `"enclosure"` for enclosure interior walls, `"extension"` for extension exterior walls
- `shared` must be `true` only for parent walls with `roomIdB !== null`
- Enclosure/extension walls must have `shared: false` (never participate in shared-wall merging)
- Perimeter edges must form closed polygons (last edge endpoint equals first edge startpoint)
- Perimeter edges must wind CCW (consistent with compositeOutline convention)
