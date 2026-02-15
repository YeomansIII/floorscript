# Contract: Dimension Resolver API

**Feature**: 004-smart-dimensions
**Package**: `@floorscript/core`
**File**: `packages/core/src/resolver/dimension-resolver.ts`

## Public Functions

### generateDimensions (rewritten)

Generates all dimension data for a resolved plan. Returns a flat list of `DimensionChain[]` — multi-segment chains for building edges with multiple rooms, single-segment chains for individual room edges.

```typescript
export function generateDimensions(
  rooms: ResolvedRoom[],
  units: UnitSystem,
  wallGraph: WallGraph,        // Required (was optional/unused)
): DimensionChain[];
```

**Input**:
- `rooms`: Resolved room geometries with bounds
- `units`: Unit system for formatting labels
- `wallGraph`: Unified wall graph with perimeter data

**Output**: `DimensionChain[]` — all dimensions for the plan

**Behavior**:
1. Extract building edges from `wallGraph.perimeter`
2. Group edges by direction, cluster collinear edges
3. Build chain dimensions (lane 0 = room segments, lane 1 = overall)
4. Generate single-segment chains for uncovered room edges
5. Return unified `DimensionChain[]`

---

### estimateTextWidth (new)

Estimates the rendered width of a dimension label using character-count heuristic.

```typescript
export function estimateTextWidth(
  label: string,
  fontSize: number,
): number;
```

**Input**:
- `label`: Formatted dimension text (e.g., `"12'-0\""`)
- `fontSize`: Font size in plan units

**Output**: Estimated text width in plan units

**Formula**: `label.length * fontSize * CHAR_WIDTH_RATIO`

---

## Internal Functions

### extractBuildingEdges

Groups perimeter edges by direction and clusters collinear edges.

```typescript
function extractBuildingEdges(
  perimeter: PerimeterChain[],
  wallGraph: WallGraph,
): Map<CardinalDirection, BuildingEdgeGroup[]>;
```

**BuildingEdgeGroup**:
```typescript
interface BuildingEdgeGroup {
  direction: CardinalDirection;
  perpendicularCoord: number;
  segments: {
    start: number;
    end: number;
    wallId: string;
    roomId: string;
  }[];
}
```

### buildChainDimensions

Converts building edge groups into lane-assigned chain dimensions.

```typescript
function buildChainDimensions(
  edgeGroups: Map<CardinalDirection, BuildingEdgeGroup[]>,
  units: UnitSystem,
): DimensionChain[];
```

### generateUncoveredDimensions

Generates single-segment `DimensionChain`s for room edges not covered by any multi-segment chain.

```typescript
function generateUncoveredDimensions(
  rooms: ResolvedRoom[],
  units: UnitSystem,
  chains: DimensionChain[],
): DimensionChain[];
```
