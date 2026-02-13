# Quickstart: Fix Structural Rendering Foundations

## What Changed

This feature introduces three foundational changes to FloorScript:

1. **Interior dimensions model**: Room `width`/`height` now represent
   interior clear space (sheetrock to sheetrock). Walls are additional
   material placed around and between rooms.

2. **Shared wall system**: Adjacent rooms share a single wall instead
   of generating two independent walls with a gap. A plan-level
   `WallGraph` replaces per-room wall ownership.

3. **Validation pass**: A linter-style validator runs after layout
   resolution, catching geometry errors and warnings before rendering.

## Verify It Works

```bash
# Build all packages
pnpm build

# Run all tests
pnpm test

# Render the multi-room example
node packages/cli/dist/index.js render examples/multi-room.yaml \
  -o examples/multi-room.svg

# Convert to PNG for visual inspection
node scripts/svg-to-png.mjs examples/multi-room.svg \
  examples/multi-room.png

# Validate a plan (new command)
node packages/cli/dist/index.js validate examples/multi-room.yaml
```

## What to Check Visually

1. **No double walls**: Adjacent rooms share a single wall. No visible
   gaps between rooms.
2. **Door swings correct**: All doors open into the correct room. Arc
   is fully inside the room, not in a wall gap.
3. **Dimensions readable**: No dimension text overlaps room labels or
   other dimensions.
4. **Cased openings visible**: The 6ft opening between living room and
   kitchen shows clear L-shaped casing marks.
5. **Plumbing fixtures against walls**: Toilet and sink are flush
   against their wall faces when using wall-relative positioning.

## YAML Changes for Users

### Wall Configuration (new `stud` field)

```yaml
walls:
  north:
    type: exterior
    stud: 2x6            # NEW: derives 6.5" total thickness
  south:
    type: interior
    stud: 2x4            # NEW: derives 4.5" total thickness
  east:
    type: interior
    thickness: 6in       # STILL WORKS: explicit override
```

### Plumbing Wall-Relative Positioning (new)

```yaml
plumbing:
  fixtures:
    - id: bath-toilet
      type: toilet
      wall: bathroom.south       # NEW: wall reference
      position: 2ft              # distance along wall
      offset: 0in                # distance from wall face
      orientation: facing-north  # NEW: which way it faces
```

### Supply/Drain Fixture References (new)

```yaml
supply_runs:
  - type: cold
    from: bath-sink              # NEW: fixture ID reference
    to:
      wall: bathroom.north       # NEW: wall exit point
      position: 5ft
    size: "1/2in"
```

### Shared Walls (new, optional)

```yaml
shared_walls:
  - rooms: [living, kitchen]
    wall: east/west
    thickness: 4.5in
    openings:
      - type: cased-opening
        position: 1ft
        width: 6ft
```

## Breaking Changes

- **Room dimensions now mean interior space**: A room with
  `width: 12ft` has 12ft of interior space. Previously, walls were
  inside this measurement. Existing YAML files may need dimension
  adjustments if they were compensating for wall thickness.

- **Wall geometry in resolved output changed**: `ResolvedWall.rect`
  coordinates changed because walls are now placed outside room
  bounds. Code that reads resolved geometry directly will need updates.

- **New `wallGraph` field on `ResolvedPlan`**: Renderers should use
  `plan.wallGraph.walls` instead of iterating `room.walls` for wall
  rendering.
