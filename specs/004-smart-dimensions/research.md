# Research: Smart Dimension Placement

**Feature**: 004-smart-dimensions
**Date**: 2026-02-15

## R1: Leveraging WallGraph Perimeter for Building Edges

**Decision**: Use `wallGraph.perimeter` (from 003-unified-wall-graph) as the primary data source for identifying building edges, rather than reconstructing edges from room bounds.

**Rationale**:
- `computePerimeter()` already produces CCW-wound `PerimeterEdge[]` with direction metadata
- Perimeter edges correctly exclude enclosure walls and shared (interior) walls
- Perimeter edges include extension walls (e.g., bay windows) in the building outline
- Corner connectors and collinear simplification are already handled
- The perimeter resolver handles L-shaped and composite building outlines

**Alternatives considered**:
- **Room bounds scan** (current approach): Iterates rooms, infers exterior edges from bounds. Doesn't handle extensions/enclosures correctly. Cannot detect building outline topology.
- **Wall-by-wall scan**: Filter `wallGraph.walls` for `shared === false && source !== "enclosure"`. Same data as perimeter but without ordering/chaining. More work, less structure.

---

## R2: Chain Dimension Merging Algorithm

**Decision**: Group perimeter edges by direction, cluster collinear edges (same perpendicular coordinate within epsilon), sort by axis position, and merge into chains using a sweep-line approach with gap tolerance.

**Rationale**:
- Perimeter edges are already direction-tagged (`CardinalDirection`)
- Collinear edges along the same building face share the same perpendicular coordinate (Y for north/south, X for east/west)
- Gap tolerance (wall thickness, typically 0.29-0.5ft) allows merging edges separated by wall junctions
- Sweep-line sorting ensures correct left-to-right or bottom-to-top ordering

**Algorithm outline**:
1. Group perimeter edges by `direction`
2. Within each direction group, cluster by perpendicular coordinate (within epsilon ~0.5ft to account for wall thickness variations)
3. Sort clusters by axis coordinate (X for horizontal edges, Y for vertical edges)
4. For each cluster, sort edges by start position along the axis
5. Map each edge back to its room (via `wallId` → `wall.roomId`) to create labeled segments
6. Consecutive segments separated by ≤ MAX_GAP form a chain

**Alternatives considered**:
- **Room-bounds approach**: Scan room bounds for shared Y/X coordinates. Simpler but misses extensions and doesn't know about the building outline.
- **Full 2D computational geometry**: Build convex hull or visibility graph. Overkill for rectilinear floor plans.

---

## R3: Multi-Lane Offset Strategy

**Decision**: Use a fixed two-lane system: lane 0 (room-edge chain, closer to building) and lane 1 (overall building dimension, further out). Offset calculated as `baseOffset + laneIndex * laneSpacing`.

**Rationale**:
- Two lanes are sufficient for residential floor plans (AIA convention)
- `LANE_SPACING_FT = 1.5` and `LANE_SPACING_M = 0.45` already declared in `dimension-resolver.ts`
- `DIMENSION_OFFSET_FT = 2` / `DIMENSION_OFFSET_M = 0.6` serve as the base offset
- Lane 0 at 2ft offset, Lane 1 at 3.5ft offset — clear visual separation

**Offset direction**:
- North edge: offset upward (+Y in plan space)
- South edge: offset downward (-Y)
- East edge: offset rightward (+X)
- West edge: offset leftward (-X)

**Alternatives considered**:
- **Dynamic lane count**: Allow 3+ lanes for very complex plans. Unnecessary for residential scope. Can be added later if needed.
- **Proportional spacing**: Space lanes proportional to building size. Creates inconsistency between plans.

---

## R4: Text Width Estimation

**Decision**: Use character-count heuristic: `textWidth = label.length * FONT_SIZE * CHAR_WIDTH_RATIO` where `CHAR_WIDTH_RATIO = 0.6`.

**Rationale**:
- Architectural dimension labels are short, predictable format (`12'-6"`, `3.50m`)
- `FONT_SIZE_FT = 0.35` is defined in `dimension-renderer.ts`
- Monospaced approximation is sufficient — we don't need sub-pixel accuracy
- `CHAR_WIDTH_RATIO = 0.6` validated against Helvetica/Arial at typical architectural sizes:
  - `12'-0"` = 6 chars × 0.35 × 0.6 = 1.26ft (fits in segments > ~1.5ft with clearance)
  - `6'-0"` = 5 chars × 0.35 × 0.6 = 1.05ft
  - `3.50m` = 5 chars × 0.35 × 0.6 = 1.05ft
- Actual SVG text rendering uses Helvetica, which is proportional but close enough for collision detection

**Alternatives considered**:
- **Canvas-based text measurement**: Accurate but requires browser/Canvas API (violates no-DOM constraint).
- **Font metrics table**: Load per-glyph widths from a metrics file. Accurate but complex and brittle.
- **Fixed minimum segment width**: Skip collision detection, just use 4ft as minimum text-fit threshold. Too coarse.

---

## R5: Extension Line Rendering Convention

**Decision**: Extension lines extend from the measured wall edge to the dimension baseline, with a small gap (0.15ft) between the wall edge and the start of the extension line, and a small overshoot (0.15ft) past the dimension baseline.

**Rationale**:
- Matches AIA/ANSI architectural drafting convention
- Gap prevents visual confusion between wall edge and extension line
- Overshoot provides visual anchor at the dimension baseline
- Shared extension lines at chain segment junctions render once (not twice)

**Constants**:
- `EXTENSION_GAP = 0.15` (plan units) — gap between wall and extension line start
- `EXTENSION_OVERSHOOT = 0.15` (plan units) — overshoot past dimension baseline

---

## R6: Overall Dimension Suppression Logic

**Decision**: Generate an overall building dimension (lane 1) only when a building edge has 2+ room segments in the chain. A single room on an edge gets only one dimension line (lane 0).

**Rationale**:
- Spec FR-003: "System MUST produce an overall building dimension only when there are two or more room segments along that edge"
- A single room's width IS the overall dimension — showing it twice is redundant
- Also suppress overall dimension when all segments belong to the same room (enclosure/extension edge case)

---

## R7: Interior Dimension Deduplication

**Decision**: After generating exterior chain dimensions, track all edges covered. Generate single-segment chains only for room edges not already represented in a multi-segment chain.

**Rationale**:
- Spec FR-006: "System MUST suppress auto-generated interior dimensions when the same measurement is already covered by an exterior chain dimension segment"
- An edge is "covered" when its start/end coordinates and measurement match a chain segment (within epsilon)
- Uncovered room edges (e.g., hallway height) get single-segment chains

**Edge coverage tracking**:
- Build a set of `{orientation, start, end, perpendicular}` tuples from chain segments
- Before generating a single-segment chain for a room edge, check if a matching edge exists in the covered set
- Match uses epsilon tolerance (0.01) on all coordinates

---

## R8: Narrow Segment Text Placement

**Decision**: When segment width < estimated text width + padding, place text outside the extension lines (shifted along the baseline beyond the segment end) with the dimension line extending to meet it.

**Rationale**:
- Spec FR-004: "System MUST detect when dimension text does not fit between extension lines and place text outside"
- No leader lines needed — shifting text along the baseline with an extended dimension line is the standard architectural convention for narrow dimensions
- Threshold: `segmentLength < textWidth + 2 * FONT_SIZE * 0.3` (30% padding on each side)

**Placement strategy**:
1. Text shifted to the right (horizontal) or below (vertical) past the segment end
2. Dimension line extends from the segment endpoint to the text midpoint
3. Tick marks remain at the original segment endpoints

**Alternatives considered**:
- **Leader lines**: Angled lines from segment to offset text. More complex to render, less common in residential plans.
- **Text rotation**: Rotate text parallel to narrow dimension. Hurts readability.
- **Abbreviated labels**: Use `6'` instead of `6'-0"`. Changes formatting convention.
