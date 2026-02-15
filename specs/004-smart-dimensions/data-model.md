# Data Model: Smart Dimension Placement

**Feature**: 004-smart-dimensions
**Date**: 2026-02-15

## New Types

### DimensionChain

A continuous series of dimension segments sharing a single baseline. Produced by merging collinear room-edge perimeter segments along a building edge.

```typescript
interface DimensionChain {
  /** Unique identifier for this chain (e.g., "chain-north-0") */
  id: string;
  /** Ordered segments from start to end along the baseline */
  segments: ChainSegment[];
  /** Orientation of the chain baseline */
  orientation: "horizontal" | "vertical";
  /** Building edge direction this chain annotates */
  direction: CardinalDirection;
  /** Lane index (0 = room-edge, 1 = overall building) */
  lane: number;
  /** Perpendicular offset from building edge to baseline (signed, plan units) */
  offset: number;
}
```

**Relationships**:
- Contains 1+ `ChainSegment`s
- Lane 0 chains reference individual room edges
- Lane 1 chains span the full building edge (single segment)
- Associated with a building edge direction

### ChainSegment

A single labeled segment within a chain dimension. Extension lines are shared with adjacent segments.

```typescript
interface ChainSegment {
  /** Start point on the dimension baseline (plan coordinates) */
  from: Point;
  /** End point on the dimension baseline (plan coordinates) */
  to: Point;
  /** Formatted dimension label (e.g., "12'-0\"") */
  label: string;
  /** Room ID that owns this segment */
  roomId: string;
  /** Whether text fits between extension lines */
  textFits: boolean;
}
```

**Relationships**:
- Belongs to exactly one `DimensionChain`
- References a room via `roomId`
- Adjacent segments share extension line endpoints (`segment[n].to === segment[n+1].from`)

### TextBoundingBox

Rectangular area occupied by rendered dimension text. Used for collision detection in P3.

```typescript
interface TextBoundingBox {
  /** Center point of text (plan coordinates) */
  center: Point;
  /** Width of text area */
  width: number;
  /** Height of text area */
  height: number;
  /** Rotation angle in degrees (0 for horizontal, -90 for vertical) */
  rotation: number;
}
```

**Relationships**:
- One per `ChainSegment`
- Used in collision detection phase (P3)

---

## Modified Types

### ResolvedPlan (changed field type)

Replace `dimensions: ResolvedDimension[]` with `dimensions: DimensionChain[]`:

```typescript
interface ResolvedPlan {
  // ... existing fields unchanged ...
  dimensions: DimensionChain[];            // All dimensions: multi-segment chains + single-segment individuals
  // ... rest unchanged ...
}
```

Every dimension is a `DimensionChain`. Multi-room building edges produce chains with multiple segments. Individual room edges (not part of a building-edge chain) produce single-segment chains. One type, one renderer path.

### ResolvedDimension (removed)

The old `ResolvedDimension` type is deleted. There are no external consumers of `ResolvedPlan` — the only API contract is YAML/JSON input → SVG output. All dimension data is now represented as `DimensionChain` with `ChainSegment`s.

---

## Existing Types Used (unchanged)

| Type | Package | Purpose in 004 |
|------|---------|----------------|
| `WallGraph` | core/geometry | Source of `perimeter` edges |
| `PerimeterChain` | core/geometry | Building outline for edge detection |
| `PerimeterEdge` | core/geometry | Individual edge with direction + wallId |
| `Wall` | core/geometry | Lookup via `wallId` for room attribution |
| `Point` | core/geometry | Coordinate pairs throughout |
| `CardinalDirection` | core/config | Edge direction classification |

---

## Data Flow

```
wallGraph.perimeter
    │
    ▼
groupEdgesByDirection()          → Map<CardinalDirection, PerimeterEdge[]>
    │
    ▼
clusterCollinearEdges()          → collinear groups per direction
    │
    ▼
buildChainSegments()             → ChainSegment[] per cluster (with room labels)
    │
    ▼
assignLanes()                    → DimensionChain[] (lane 0 + optional lane 1)
    │
    ▼
generateUncoveredDimensions()    → DimensionChain[] (single-segment chains for uncovered room edges)
    │
    ▼
ResolvedPlan { dimensions: DimensionChain[] }
```

---

## Constants

| Constant | Value (Imperial) | Value (Metric) | Purpose |
|----------|------------------|-----------------|---------|
| `DIMENSION_OFFSET_FT` | 2.0 | — | Base offset from building edge (existing) |
| `DIMENSION_OFFSET_M` | — | 0.6 | Base offset from building edge (existing) |
| `LANE_SPACING_FT` | 1.5 | — | Inter-lane spacing (existing, currently unused) |
| `LANE_SPACING_M` | — | 0.45 | Inter-lane spacing (existing, currently unused) |
| `EXTENSION_GAP` | 0.15 | 0.15 | Gap between wall edge and extension line start (new) |
| `EXTENSION_OVERSHOOT` | 0.15 | 0.15 | Extension line overshoot past baseline (new) |
| `CHAR_WIDTH_RATIO` | 0.6 | 0.6 | Character width as ratio of font size (new) |
| `COLLINEAR_EPSILON` | 0.5 | 0.15 | Max perpendicular coord difference for collinearity (new) |

---

## Validation Rules

1. Every `DimensionChain` must have at least 1 segment
2. Chain segments must be ordered: `segment[n].to` coordinates match `segment[n+1].from` within epsilon
3. All segments in a chain must share the same orientation and direction
4. Lane 1 chains (overall) must have exactly 1 segment
5. Lane 0 chains with 1 segment suppress lane 1 generation (no redundant overall)
6. No two chains may share the same `{direction, lane}` combination (one chain per edge per lane)
