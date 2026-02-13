# Data Model: Composite Rooms

**Date**: 2026-02-13 | **Branch**: `002-composite-rooms`

## Config Types (Input — `config.ts`)

### New Types

```typescript
// Corner identifiers for enclosure placement
type CornerPosition = "northwest" | "northeast" | "southwest" | "southeast";

// Enclosure: a sub-space carved from within the parent room
interface EnclosureConfig {
  id: string;
  label: string;

  // Placement: corner-based OR wall-based (exactly one must be specified)
  corner?: CornerPosition;       // e.g., "northwest"
  wall?: CardinalDirection;      // e.g., "north" (for wall-based placement)

  // Orientation (corner enclosures only)
  facing?: CardinalDirection;    // direction the enclosure opens toward
                                 // inferred from door wall or shorter dimension if omitted

  // Dimensions
  length: Dimension;             // perpendicular to facing direction (corner) or along wall (wall-based)
                                 // accepts "full" for wall-based to span entire wall
  depth: Dimension;              // in the facing direction (corner) or into the room (wall-based)

  // Position along wall (wall-based only, uses same from/offset as openings)
  from?: CardinalDirection;      // reference wall to measure from
  offset?: Dimension;            // distance from reference wall to near edge

  // Sub-space walls and openings
  walls?: WallsConfig;           // wall overrides and openings for the enclosure's own walls
}

// Extension: a sub-space projecting outward beyond the parent room
interface ExtensionConfig {
  id: string;
  label: string;

  // Placement: which parent wall to extend from
  wall: CardinalDirection;       // e.g., "north"

  // Position along parent wall (uses from/offset)
  from: CardinalDirection;       // reference wall to measure from
  offset: Dimension;             // distance from reference wall to near edge

  // Dimensions
  width: Dimension;              // parallel to parent wall
  depth: Dimension;              // perpendicular, extending outward

  // Sub-space walls and openings
  walls?: WallsConfig;           // wall overrides and openings for the extension's own walls
}
```

### Modified Types

```typescript
// RoomConfig — add extensions and enclosures arrays
interface RoomConfig {
  id: string;
  label: string;
  position?: DimensionTuple;
  adjacent_to?: AdjacencyConfig;
  width: Dimension;
  height: Dimension;
  walls?: WallsConfig;
  extensions?: ExtensionConfig[];   // NEW
  enclosures?: EnclosureConfig[];   // NEW
}

// OpeningConfig — add from/offset alternative positioning
interface OpeningConfig {
  type: OpeningType;
  position?: Dimension;            // CHANGED: now optional (was required)
  from?: CardinalDirection;        // NEW: reference wall to measure from
  offset?: Dimension;              // NEW: distance from reference wall to near edge
  width: Dimension;
  style?: DoorStyle;
  swing?: SwingDirection;
  sill_height?: Dimension;
  status?: ElementStatus;
}
// Validation: either `position` is present, or both `from` + `offset`, or position is "center"
```

### Zod Schema Additions

```typescript
const CornerPositionSchema = z.enum(["northwest", "northeast", "southwest", "southeast"]);

const EnclosureSchema = z.object({
  id: z.string(),
  label: z.string(),
  corner: CornerPositionSchema.optional(),
  wall: z.enum(["north", "south", "east", "west"]).optional(),
  facing: z.enum(["north", "south", "east", "west"]).optional(),
  length: DimensionSchema,       // also accepts "full" string for wall-based
  depth: DimensionSchema,
  from: z.enum(["north", "south", "east", "west"]).optional(),
  offset: DimensionSchema.optional(),
  walls: WallsSchema.optional(),
}).refine(
  (d) => (d.corner != null) !== (d.wall != null),
  { message: "Enclosure must specify either 'corner' or 'wall', not both" }
);

const ExtensionSchema = z.object({
  id: z.string(),
  label: z.string(),
  wall: z.enum(["north", "south", "east", "west"]),
  from: z.enum(["north", "south", "east", "west"]),
  offset: DimensionSchema,
  width: DimensionSchema,
  depth: DimensionSchema,
  walls: WallsSchema.optional(),
});

// OpeningSchema modification: position becomes optional, add from/offset
const OpeningSchema = z.object({
  type: z.enum(["door", "window"]),
  position: DimensionSchema.optional(),       // was required
  from: z.enum(["north", "south", "east", "west"]).optional(),
  offset: DimensionSchema.optional(),
  width: DimensionSchema,
  style: DoorStyleSchema.optional(),
  swing: SwingDirectionSchema.optional(),
  sill_height: DimensionSchema.optional(),
  status: ElementStatusSchema.optional(),
}).refine(
  (d) => d.position != null || (d.from != null && d.offset != null),
  { message: "Opening must specify either 'position' or both 'from' and 'offset'" }
);

// RoomSchema modification: add extensions and enclosures
// Add to existing RoomSchema:
//   extensions: z.array(ExtensionSchema).optional(),
//   enclosures: z.array(EnclosureSchema).optional(),
```

## Geometry Types (Output — `geometry.ts`)

### New Types

```typescript
// Resolved enclosure with computed bounds and walls
interface ResolvedEnclosure {
  id: string;                      // e.g., "closet"
  label: string;
  parentRoomId: string;            // e.g., "bedroom1"
  bounds: Rect;                    // absolute position and dimensions
  facing: CardinalDirection;       // resolved facing direction
  walls: ResolvedWall[];           // interior walls facing parent room
}

// Resolved extension with computed bounds and walls
interface ResolvedExtension {
  id: string;                      // e.g., "window-nook"
  label: string;
  parentRoomId: string;            // e.g., "bedroom1"
  bounds: Rect;                    // absolute position and dimensions
  parentWall: CardinalDirection;   // which parent wall it extends from
  walls: ResolvedWall[];           // 3 exterior walls (open side toward parent)
}
```

### Modified Types

```typescript
// ResolvedRoom — add composite outline and sub-space references
interface ResolvedRoom {
  id: string;
  label: string;
  bounds: Rect;                    // parent room outer bounding rectangle (unchanged)
  labelPosition: Point;
  walls: ResolvedWall[];
  compositeOutline?: Point[];      // NEW: ordered vertices of composite shape
                                   // absent = simple rectangle (backward compatible)
  enclosures?: ResolvedEnclosure[];  // NEW
  extensions?: ResolvedExtension[];  // NEW
}

// ResolvedPlan — enclosures/extensions also added to rooms array as ResolvedRoom entries
// No structural change needed — the rooms array naturally contains them
```

## Entity Relationships

```
RoomConfig
  ├── extensions: ExtensionConfig[]
  │     └── walls: WallsConfig (openings on extension walls)
  └── enclosures: EnclosureConfig[]
        └── walls: WallsConfig (openings on enclosure walls)

ResolvedRoom (parent)
  ├── compositeOutline: Point[]     (auto-computed polygon)
  ├── extensions: ResolvedExtension[]
  │     ├── bounds: Rect            (positioned outside parent)
  │     └── walls: ResolvedWall[]   (3 exterior walls)
  └── enclosures: ResolvedEnclosure[]
        ├── bounds: Rect            (positioned inside parent)
        └── walls: ResolvedWall[]   (interior walls at boundary)
```

## Validation Rules

| Rule | Entity | Condition |
|------|--------|-----------|
| Enclosure fits in parent | EnclosureConfig | `depth < parent.width` (or height, depending on corner/wall) and `length < parent.height` (or width) |
| Enclosures don't overlap | EnclosureConfig[] | No two enclosure `Rect` bounds intersect |
| Extension fits on parent wall | ExtensionConfig | `from_offset + width <= parent_wall_length` |
| Opening not in extension gap | OpeningConfig | Opening position range doesn't overlap with extension gap on same wall |
| Corner + wall mutual exclusion | EnclosureConfig | Exactly one of `corner` or `wall` must be specified |
| Position vs from/offset exclusion | OpeningConfig | Either `position` or `from`+`offset` (not both) |
| Enclosure ID unique in room | EnclosureConfig | No duplicate `id` within same room's enclosures |
| Extension ID unique in room | ExtensionConfig | No duplicate `id` within same room's extensions |

## State Transitions

Not applicable — file-based I/O with no persistent state. The pipeline is pure: Config → Resolved → SVG.
