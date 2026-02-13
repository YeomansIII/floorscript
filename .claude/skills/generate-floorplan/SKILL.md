---
name: generate-floorplan
description: Generate a FloorScript YAML floor plan from a natural-language description of a building layout. Use when the user describes rooms, dimensions, doors, windows, or asks for a floor plan.
user-invocable: true
argument-hint: <description of the floor plan>
allowed-tools: Read, Write, Bash, Glob, Grep
---

# Generate FloorScript YAML

You are a floor plan architect assistant. Your job is to turn a natural-language description of a building layout into a valid FloorScript YAML configuration file.

## Required Context

Before generating YAML, read these files to understand the schema and conventions:

1. **JSON Schema** (authoritative field reference): `packages/core/floorscript.schema.json`
2. **Spec** (full format documentation): `SPEC.md` — sections 3.1 through 3.10

If the user provides a description as `$ARGUMENTS`, use that. Otherwise, ask what they want to build.

## Generation Rules

### Coordinate System and Units

- Default to `units: imperial` unless the user specifies metric.
- Origin is at the bottom-left. Y increases upward.
- Imperial dimensions use the format `12ft`, `12ft 6in`, `3ft 3in`. Always include the unit suffix.
- The first room should have `position: [0, 0]`.
- Subsequent rooms should use `adjacent_to` instead of manual coordinates when they share a wall with another room. This avoids coordinate math errors.

### Room Layout Strategy

1. Pick the largest or most central room as the anchor at `position: [0, 0]`.
2. Attach other rooms using `adjacent_to` with the correct `wall` and `alignment`:
   - `wall: east` means "place this room to the right of the target room"
   - `wall: south` means "place this room below the target room"
   - `alignment: start` aligns to the left/bottom edge, `center` centers, `end` aligns to the right/top edge
3. Every room needs a unique `id` (lowercase, no spaces) and a human-readable `label`.

### Walls

- Outer perimeter walls should be `type: exterior`.
- Walls between rooms should be `type: interior`.
- Only specify `thickness` or `stud` if the user mentions specific construction details; otherwise omit and let defaults apply.
- Only define walls that need openings or non-default types. The renderer fills in missing walls automatically.

### Openings (Doors and Windows)

- Place openings on the wall they belong to using one of these positioning methods:
  - `position: 3ft` — numeric offset from the wall's start (left for horizontal walls, bottom for vertical walls)
  - `position: center` — automatically centers the opening on the wall
  - `from`/`offset` pair — human-natural positioning: `from: south, offset: 2ft 7in` means "2ft 7in from the south end of the wall"
- Every opening needs `type`, `width`, and one of the positioning methods above.
- Prefer `from`/`offset` when the user describes placement relative to a landmark (e.g., "door 2 feet from the left wall").
- Use `position: center` for centered windows.
- Doors: add `swing` (e.g. `inward-right`) for standard doors. Use `style: cased-opening` for open pass-throughs, `style: sliding` for sliders.
- Windows: typically on exterior walls. Omit `swing` and `style`.
- Ensure the opening fits within the wall: `position + width < wall length`.

### Enclosures and Extensions

- **Enclosure** = a sub-space carved from within a room (closets, pantries, storage). Use when the space is interior to the room.
- **Extension** = a sub-space projecting outward from a room wall (window nooks, bay windows, bump-outs). Use when the space extends beyond the room rectangle.

**Decision rules**: closet/pantry/storage → enclosure. Window nook/bay window/bump-out → extension.

**Corner enclosure** (most common for closets):
```yaml
enclosures:
  - id: closet
    label: "Walk-in Closet"
    corner: northwest
    facing: east           # which direction the closet opens toward
    length: 6ft            # along the wall (perpendicular to facing)
    depth: 4ft             # into the room (parallel to facing)
    walls:
      east:
        type: interior
        openings:
          - type: door
            position: 1ft
            width: 2ft 6in
```

**Wall-based enclosure** (for mid-wall closets): use `wall: north` + `from`/`offset` instead of `corner`.

**Extension** (bump-outs):
```yaml
extensions:
  - id: window-nook
    label: "Window Nook"
    wall: north
    from: east
    offset: 2ft
    width: 5ft
    depth: 3ft
    walls:
      north:
        type: exterior
        openings:
          - type: window
            position: center
            width: 4ft
```

### Electrical (only if requested)

- Place the `panel` first with an [x, y] position inside a room.
- `outlets` and `switches` reference walls as `roomid.direction` (e.g. `kitchen.south`).
- `fixtures` use absolute [x, y] coordinates within the room coordinate space.
- Assign `circuit` numbers consistently.

### Plumbing (only if requested)

- Plumbing `fixtures` can use wall-relative placement: `wall: roomid.direction` with `position` as offset along the wall.
- `supply_runs` need a `type` of `hot` or `cold`.
- `drain_runs` connect fixtures to waste lines.

### Layers

Always include a layers section:

```yaml
layers:
  structural:
    visible: true
  dimensions:
    visible: true
```

Add `electrical: { visible: true }` and `plumbing: { visible: true }` only if those systems are defined.

### Renovation Plans (only if the user describes before/after changes)

Use two separate plans (`existing` and `proposed`) with a `diffs` section:

```yaml
diffs:
  - before: existing
    after: proposed
    title: "Renovation Plan"
    outputs: [demolition, construction, combined, summary]
```

## Output Process

1. **Clarify** if the description is ambiguous: ask about room count, rough sizes, door/window placement, or which systems to include.
2. **Generate** the complete YAML file. Write it to a file (suggest `examples/<name>.yaml` or let the user choose).
3. **Build and render** to verify:
   ```bash
   pnpm build
   node packages/cli/dist/index.js render <yaml-file> -o <output.svg>
   ```
4. **Convert to PNG** for visual inspection:
   ```bash
   npx sharp-cli -i <output.svg> -o <output.png>
   ```
5. **Show the PNG** to the user and ask if adjustments are needed.

## Common Patterns

### Simple single-room (studio, garage, shed)

```yaml
version: "0.1"
project:
  title: "Garage"
units: imperial
plans:
  - id: main
    title: "Floor Plan"
    rooms:
      - id: garage
        label: "Garage"
        position: [0, 0]
        width: 20ft
        height: 22ft
        walls:
          north: { type: exterior }
          south:
            type: exterior
            openings:
              - type: door
                position: 8ft
                width: 3ft
                swing: inward-right
          east: { type: exterior }
          west: { type: exterior }
    layers:
      structural: { visible: true }
      dimensions: { visible: true }
```

### Multi-room with adjacency

```yaml
rooms:
  - id: living
    label: "Living Room"
    position: [0, 0]
    width: 15ft
    height: 12ft
    walls:
      north: { type: exterior }
      south: { type: exterior }
      east: { type: interior }
      west:
        type: exterior
        openings:
          - type: door
            position: 4ft
            width: 3ft
            swing: inward-right

  - id: kitchen
    label: "Kitchen"
    adjacent_to:
      room: living
      wall: east
      alignment: end
    width: 12ft
    height: 10ft
    walls:
      north: { type: exterior }
      east:
        type: exterior
        openings:
          - type: window
            position: 3ft
            width: 4ft
      west:
        type: interior
        openings:
          - type: door
            style: cased-opening
            position: 1ft
            width: 6ft
```

### Kitchen/bath renovation

Use two plans with `diffs` to show existing vs. proposed. See `examples/kitchen-reno.yaml` for a complete reference.
