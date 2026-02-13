# Quickstart: Implementing Composite Rooms

**Branch**: `002-composite-rooms` | **Date**: 2026-02-13

## Prerequisites

```bash
git checkout 002-composite-rooms
pnpm install
pnpm build
pnpm test          # All existing tests must pass before starting
```

## Implementation Order

Work bottom-up through the pipeline. Each step is independently testable.

### Step 1: `from`/`offset` on OpeningConfig (config.ts + opening-resolver.ts)

**What**: Add `from`/`offset` fields to `OpeningConfig` and resolve them to numeric positions.

**Where**:
- `packages/core/src/types/config.ts` — modify `OpeningSchema` and `OpeningConfig`
- `packages/core/src/resolver/opening-resolver.ts` — add `from`/`offset` → position conversion

**Test first**:
```bash
# Create packages/core/__tests__/from-offset.test.ts
# Test: from:south + offset:2ft7in on west wall → position = 2.583ft from wall start
# Test: from:east + offset:4ft on north wall → position = wallLength - 4ft - openingWidth
# Test: position:"center" → centered on wall interior length
# Test: existing numeric position unchanged
pnpm test --filter @floorscript/core
```

**Key logic**: For a wall running along axis A, `from` names the perpendicular wall at one end. If `from` matches the wall's "start" end (south for west wall, west for north wall), position = offset. If `from` matches the "end" end, position = wallInteriorLength - offset - openingWidth.

### Step 2: Enclosure resolver (enclosure-resolver.ts)

**What**: Given parent room bounds + EnclosureConfig[], compute enclosure positions, interior walls, and parent wall modifications.

**Where**:
- `packages/core/src/types/config.ts` — add `EnclosureConfig`, `EnclosureSchema`, `CornerPosition`
- `packages/core/src/types/geometry.ts` — add `ResolvedEnclosure`
- `packages/core/src/resolver/enclosure-resolver.ts` — NEW file

**Test first**:
```bash
# Create packages/core/__tests__/enclosure-resolver.test.ts
# Test: NW corner, facing:east, length:6ft, depth:2ft4in → bounds at (0, height-6, 2.33, 6)
# Test: facing inference from door on east wall → facing:east
# Test: facing default for NW with no door → facing:east (shorter dim)
# Test: wall-based enclosure along north wall with from/offset
# Test: wall-based enclosure with length:"full"
# Test: reject enclosure exceeding parent dimensions
# Test: reject overlapping enclosures
pnpm test --filter @floorscript/core
```

**Key data flow**: `resolveEnclosures(configs, parentBounds, units)` returns:
- `enclosures: ResolvedEnclosure[]` — resolved bounds, walls, facing
- `wallModifications: Map<CardinalDirection, WallModification>` — how each parent wall is shortened

### Step 3: Extension resolver (extension-resolver.ts)

**What**: Given parent room bounds + ExtensionConfig[], compute extension positions, exterior walls, and parent wall gaps.

**Where**:
- `packages/core/src/types/config.ts` — add `ExtensionConfig`, `ExtensionSchema`
- `packages/core/src/types/geometry.ts` — add `ResolvedExtension`
- `packages/core/src/resolver/extension-resolver.ts` — NEW file

**Test first**:
```bash
# Create packages/core/__tests__/extension-resolver.test.ts
# Test: north wall extension, from:east, offset:4ft8in, width:3ft9in, depth:5ft4in
#       → bounds at (parentX + parentWidth - 4.67 - 3.75, parentY + parentHeight, 3.75, 5.33)
# Test: extension flush with corner (offset: 0)
# Test: reject extension exceeding parent wall length
# Test: extension has 3 exterior walls (open side toward parent)
pnpm test --filter @floorscript/core
```

### Step 4: Composite outline (composite-outline.ts)

**What**: Compute the rectilinear polygon representing parent + extensions - enclosures.

**Where**:
- `packages/core/src/resolver/composite-outline.ts` — NEW file

**Test first**:
```bash
# Create packages/core/__tests__/composite-outline.test.ts
# Test: simple rectangle (no extensions/enclosures) → 4 vertices
# Test: rectangle + NW corner enclosure → 6 vertices (L-shape)
# Test: rectangle + north extension → 8 vertices (T-shape-ish)
# Test: rectangle + NW enclosure + north extension → 10 vertices
# Test: collinear vertex removal (straight segments don't add extra vertices)
pnpm test --filter @floorscript/core
```

### Step 5: Wire into layout resolver (layout-resolver.ts)

**What**: Call enclosure/extension resolvers during `resolveRoom()`, modify wall generation, compute composite outline.

**Where**:
- `packages/core/src/resolver/layout-resolver.ts` — modify `resolveRoom()`
- `packages/core/src/resolver/wall-resolver.ts` — accept wall modifications

**Test first**:
```bash
# Add to packages/core/__tests__/layout-resolver.test.ts
# Test: full YAML with bedroom + closet enclosure → resolves correctly
# Test: full YAML with room + window nook extension → resolves correctly
# Test: full YAML with both → composite outline has correct vertices
# Test: existing minimal YAML unchanged (backward compatibility)
pnpm test --filter @floorscript/core
```

### Step 6: Update dimension resolver (dimension-resolver.ts)

**What**: Generate dimension lines that trace composite outline edges instead of simple rectangle edges.

**Where**:
- `packages/core/src/resolver/dimension-resolver.ts` — modify `generateDimensions()`

**Key logic**: When a room has `compositeOutline`, iterate its edges and generate dimension lines for each axis-aligned segment. Skip internal edges between parent and enclosure.

### Step 7: SVG rendering (render-svg package)

**What**: Render composite room outlines, enclosure interior walls, extension exterior walls.

**Where**:
- `packages/render-svg/src/renderers/wall-renderer.ts` — handle enclosure/extension walls
- `packages/render-svg/src/render-svg.ts` — pass sub-space rooms to renderers

**Test first**:
```bash
# Add to packages/render-svg/__tests__/integration.test.ts
# Test: SVG contains enclosure interior wall rectangles
# Test: SVG contains extension exterior wall rectangles
# Test: SVG contains correct room labels for parent, enclosure, and extension
pnpm test --filter @floorscript/render-svg
```

### Step 8: Example YAML + visual verification

```bash
# Create examples/bedroom-nook.yaml (the worked example from the spec)
pnpm build
node packages/cli/dist/index.js render examples/bedroom-nook.yaml -o examples/bedroom-nook.svg
npx sharp-cli -i examples/bedroom-nook.svg -o examples/bedroom-nook.png
# Inspect the PNG for correct layout
```

### Step 9: Update JSON schema + SKILL.md

- `packages/core/floorscript.schema.json` — add extensions, enclosures, from/offset
- `.claude/skills/generate-floorplan/SKILL.md` — add ~20 lines of instruction

## Build & Verify Loop

After each step:
```bash
pnpm build && pnpm test && pnpm typecheck
```

After Steps 7-8, add visual verification per Constitution Principle V.

## Key Constants

```typescript
const INT_THICK = 4.5 / 12;   // 2x4 interior wall (enclosure boundaries)
const EXT_THICK = 6.5 / 12;   // 2x6 exterior wall (extension walls)
```

## Gotchas

1. **Room bounds = interior clear space.** Enclosures reduce usable interior area but the parent `bounds.width`/`bounds.height` represent the OUTER rectangle (including enclosure area). Only the walls change.
2. **Horizontal walls extend through corners.** When enclosures shorten walls, the corner convention must be maintained — shortened horizontal walls still own the corner squares at their remaining extent.
3. **`interiorStartOffset` changes** when the west wall is shortened (by a SW or NW enclosure). The opening resolver uses this offset, so it must be recomputed.
4. **`from`/`offset` measures to near edge.** Not center. "2'7" from south wall" means the door's closest edge is at 2'7", not its center.
5. **Wall graph participation.** Enclosures/extensions that produce standard `ResolvedRoom` objects will automatically participate in shared wall detection via `buildWallGraph()`. Ensure enclosure rooms and extension rooms have proper wall geometry.
