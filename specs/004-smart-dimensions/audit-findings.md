# Visual Audit Findings: `examples/multi-room.png`

**Date**: 2026-02-15
**Branch**: `004-smart-dimensions`
**Audited by**: Two independent auditors + team lead validation against SVG source
**Test count at time of audit**: 208 passing across 15 test files

---

## 004-Dimension Bugs

### BUG 1: Duplicate/Overlapping Dimension Chains (MAJOR)

**Description**: Multiple edge groups at slightly different perpendicular coordinates produce separate lane-0 chains that render at nearly identical baseline positions, causing doubled dimension text. This is the most visible issue — "10'-0\"" appears twice at nearly the same position on both the south and west building edges.

**Locations affected**:
- South building edge (Kitchen/Living Room area)
- West building edge (all rooms)

**SVG evidence — "10'-0\"" duplicated on south side**:
```
Line 200: <text x="830.31" y="794.88">10'-0"</text>
Line 222: <text x="827.66" y="794.88">10'-0"</text>   ← 2.65px apart, same Y
Line 249: <text x="827.66" y="908.27">10'-0"</text>
Line 265: <text x="830.31" y="908.27">10'-0"</text>   ← 2.65px apart, same Y
```

**SVG evidence — "10'-0\"" duplicated on west side**:
```
Line 289: <text x="217.32" y="309.45" transform="rotate(-90, ...)">10'-0"</text>
Line 308: <text x="217.32" y="312.11" transform="rotate(-90, ...)">10'-0"</text>  ← 2.66px apart
Line 338: <text x="103.94" y="312.11" transform="rotate(-90, ...)">10'-0"</text>
Line 362: <text x="103.94" y="309.45" transform="rotate(-90, ...)">10'-0"</text>  ← 2.66px apart
```

**Total chain-dimension groups in SVG**: 21 — too many for a 7-room plan.

**Root cause**: `extractBuildingEdges()` in `packages/core/src/resolver/dimension-resolver.ts` groups walls by direction and clusters by perpendicular coordinate within `COLLINEAR_EPSILON`. When the south exterior walls of Living Room and Kitchen sit at a slightly different perpendicular Y than the south-facing walls of Bedroom 1/Hall/Bedroom 2 (due to wall thickness differences between exterior and interior walls), they form **separate edge groups**. Both groups receive `lane: 0` at `sign * baseOffset`, producing overlapping chains at the same visual position.

**Suggested fix**: Either:
1. Increase `COLLINEAR_EPSILON` to merge wall groups that differ only by wall thickness (~0.29–0.5ft), or
2. De-conflict lane offsets when multiple edge groups for the same direction would overlap visually, or
3. After generating chains, merge chains that share the same `{direction, lane}` and have overlapping baseline coordinates.

---

### BUG 2: Redundant Uncovered Dimensions (MODERATE)

**Description**: The south side shows both a multi-segment chain (from one edge group) AND separate single-segment chains (from `generateUncoveredDimensions()`) for rooms already dimensioned by a different edge group's chain.

**Specific overlap**:
- Multi-segment chain: "12'-0\"" + "6'-0\"" + "10'-0\"" (Bedroom 1 + Hallway + Bedroom 2)
- Single-segment chains: "18'-0\"" (Living Room) and "10'-0\"" (Kitchen)

These come from different edge groups (different perpendicular Y coordinates) and all render at the same lane-0 offset. The coverage tracking in `generateUncoveredDimensions()` uses `roomId:orientation` keys but doesn't account for a room being dimensioned by one edge group while appearing uncovered from the perspective of a different edge group.

**Root cause**: `generateUncoveredDimensions()` in `packages/core/src/resolver/dimension-resolver.ts` — the coverage set is built from chain segments by `roomId:orientation`, but when a room's width is covered by an edge group at one perpendicular coordinate, a different edge group at another perpendicular coordinate may still generate a chain for the same room's same dimension.

**Suggested fix**: Build the coverage set from ALL chain segments across all edge groups, keyed by room bounds coordinates (not just `roomId:orientation`), to catch rooms dimensioned by any edge group.

---

### BUG 3: Cramped "3'-0\"" Hallway Dimension (MINOR)

**Description**: The hallway is only 3ft tall. The "3'-0\"" vertical dimension text is placed in a tight space between the hallway and the bedroom/bath row. The text is readable but cramped.

**Location**: Left of hallway, SVG coordinates around (444, 408).

**Root cause**: `generateUncoveredDimensions()` in `packages/core/src/resolver/dimension-resolver.ts` places the chain at `x - baseOffset` (2ft left of the hallway's left edge), which falls near the living/bedroom boundary. The 3ft room simply doesn't have much space for the text.

**Suggested fix**: This would be addressed by US3 (collision-aware text placement), which is currently deferred. The `TextBoundingBox` type is already in place for future implementation.

---

## Pre-existing Bugs (not caused by 004)

### BUG 4: Duplicate Door/Window Renderings (MAJOR)

**Description**: Three doors and one window are rendered twice at identical SVG coordinates, producing doubled/bolder lines. This is visible as thicker-than-intended door arcs and window lines.

**Duplicated elements**:
| Element | Location | SVG Lines |
|---------|----------|-----------|
| Bedroom 1 east door | shared wall bedroom1.east / hallway.west | 118 + 130 |
| Bedroom 2 west door | shared wall bedroom2.west / hallway.east | 126 + 134 |
| Living room south door | shared wall living.south / halfbath.north | 104-107 + 136-139 |
| Living room south window | shared wall living.south / halfbath.north | 108-111 + 140-143 |

**SVG evidence — Bedroom 1 east door arc rendered twice**:
```xml
<!-- First rendering (line 118) -->
<path d="M 426.38,451.18 A 70.87,70.87 0 0,1 497.24,380.31"/>
<!-- Duplicate rendering (line 130) -->
<path d="M 426.38,451.18 A 70.87,70.87 0 0,1 497.24,380.31"/>
```

**Root cause**: In `packages/core/src/resolver/shared-wall-resolver.ts`, `buildWallGraph()` creates both **shared walls** (with merged openings from both rooms, lines ~208-227) and **remainder walls** (with filtered openings from the original room wall, lines ~765-796). When a wall boundary between two rooms is fully or partially shared, openings from the parent wall get copied into both the shared wall and the remainder wall. Then in `packages/render-svg/src/render-svg.ts` lines 83-94, the renderer iterates ALL `wallGraph.walls` and renders every opening on every wall, producing duplicates.

**Suggested fix**: Either:
1. Filter openings from remainder walls when they fall within the shared wall's range, or
2. Track which openings have been rendered and skip duplicates in the renderer.

---

### BUG 5: Bathtub Renders as Invisible Line (MAJOR)

**Description**: The Full Bath bathtub rectangle has `height="0"`, making it completely invisible. Only a degenerate flat arc appears at the wall line.

**SVG evidence (line 516)**:
```xml
<rect x="451.18" y="157.09" width="141.73" height="0" stroke="#000" stroke-width="0.3mm" fill="none"/>
```

The arc also degenerates to a flat line, and the side connecting lines have identical start and end Y coordinates:
```xml
<line x1="451.18" y1="157.09" x2="451.18" y2="157.09" stroke="#000" stroke-width="0.3mm" fill="none"/>
<line x1="592.91" y1="157.09" x2="592.91" y2="157.09" stroke="#000" stroke-width="0.3mm" fill="none"/>
```

**YAML input**: `width: 5ft, depth: 30in` (standard bathtub dimensions)

**Root cause**: In `packages/render-svg/src/renderers/plumbing-renderer.ts` line ~142:
```typescript
dc.rect(pos.x - w / 2, pos.y - d / 2, w, d - arcR, FIXTURE_STYLE);
```
where `arcR = w / 2`. The bathtub is 5ft wide (w=141.73px) and 2.5ft deep (d=70.87px). Since `arcR = w/2 = 70.87` and `d - arcR = 70.87 - 70.87 = 0`, the rectangle height collapses to zero. The drawing logic assumes `depth > width/2`, but a 5ft wide x 2.5ft deep tub violates this assumption.

**Suggested fix**: Cap the arc radius: `arcR = Math.min(w / 2, d / 2)` or `arcR = Math.min(w / 2, d * 0.4)`.

---

### BUG 6: Full Bath East Wall Plumbing Fixtures Inset into Wall (MODERATE)

**Description**: The toilet and sink on the Full Bath east wall appear to extend into or overlap with the wall rather than sitting flush against the interior face. Both fixtures have `offset: 0in` in the YAML, meaning they should be flush with the wall interior.

**YAML input**:
```yaml
- id: bath-toilet
  type: toilet
  wall: bath.east
  position: 1ft
  offset: 0in
  width: 18in
  depth: 28in
- id: bath-sink
  type: bath-sink
  wall: bath.east
  position: 4ft
  offset: 0in
  width: 20in
  depth: 16in
```

**SVG positions**:
- Toilet: center (655.51, 327.17) with `transform="rotate(90, ...)"` — rect from x=638.5
- Sink: center (669.69, 242.13) with `transform="rotate(90, ...)"` — ellipse rx=23.62

**Root cause**: Likely in `packages/core/src/resolver/plumbing-resolver.ts` — the fixture positioning logic may place the fixture center at the wall centerline or outer edge rather than offset from the interior face. With `offset: 0in`, the fixture center should be at `interior_wall_face + depth/2`, but it may be calculated from a different reference point.

**Suggested fix**: Investigate how `plumbing-resolver.ts` calculates fixture position relative to the wall. The offset should be measured from the interior face of the wall, not the wall centerline or outer edge.

---

### BUG 7: Smoke Detector Overlaps Light Fixture in Bedroom 1 (MINOR — YAML input)

**Description**: The S/CO smoke detector and the ceiling light fixture in Bedroom 1 render at the exact same center point, making both symbols unreadable.

**SVG evidence**:
```
Light fixture center: (337.8, 320.08)  — line 469
Smoke detector center: (337.8, 320.08) — line 494
```

**YAML input**: Both `bed1-light-1` and the first smoke detector are defined at `[6ft, 19ft]` — identical coordinates.

**Root cause**: This is a YAML input data issue, not a code bug. The renderer has no collision detection for overlapping symbols.

**Suggested fix**: Update `examples/multi-room.yaml` to offset the smoke detector from the light fixture (e.g., move to `[6ft, 17ft]`). Optionally, add a validation warning when symbols overlap.
