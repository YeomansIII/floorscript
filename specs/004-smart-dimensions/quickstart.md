# Quickstart: Smart Dimension Placement

**Feature**: 004-smart-dimensions
**Branch**: `004-smart-dimensions`

## What This Feature Does

Replaces the simple per-room dimension placement with an intelligent multi-lane, chain-based dimension system that follows AIA architectural drafting conventions. The system groups collinear room edges into continuous chain dimensions, stacks them in ordered lanes, and handles narrow segments by placing text outside extension lines.

## Files Changed

### Core Package (`packages/core/`)

| File | Change Type | Description |
|------|-------------|-------------|
| `src/types/geometry.ts` | **Modified** | Replace `ResolvedDimension` with `DimensionChain`, `ChainSegment`; add `TextBoundingBox` |
| `src/resolver/dimension-resolver.ts` | **Major rewrite** | Replace room-bounds scanning with perimeter-based chain generation |
| `src/index.ts` | **Modified** | Export new types |

### Render SVG Package (`packages/render-svg/`)

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderers/dimension-renderer.ts` | **Rewritten** | Replace `renderDimension()` with `renderChainDimension()`, add extension lines |
| `src/render-svg.ts` | **Modified** | Render `DimensionChain[]` via `renderChainDimension()`; update margin |

### Tests

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/core/__tests__/dimension-resolver.test.ts` | **New** | Dedicated tests for chain generation, lane assignment, deduplication |
| `packages/core/__tests__/layout-resolver.test.ts` | **Modified** | Update existing dimension test for `DimensionChain[]` type |
| `packages/render-svg/__tests__/integration.test.ts` | **Modified** | Verify chain dimension SVG output |

## How to Verify

```bash
# Build and test
pnpm build && pnpm test

# Visual verification
node packages/cli/dist/index.js render examples/multi-room.yaml -o examples/multi-room.svg
node scripts/svg-to-png.mjs examples/multi-room.svg examples/multi-room.png
# Inspect PNG for:
#   - Distinct inner/outer dimension lanes (no overlapping)
#   - Chain dimensions along building edges (shared extension lines)
#   - Overall building dimension on edges with 2+ rooms
#   - No redundant interior dimensions for chain-covered edges
#   - Readable text on narrow segments (text outside extension lines)
```

## Implementation Priority Order

1. **P1: Multi-Lane Stacking** — Organize dimensions into lane 0 (room) and lane 1 (overall)
2. **P2: Chain Dimensions** — Merge collinear room edges into continuous chains
3. **P3: Collision-Aware Text** — Detect narrow segments, place text outside
4. **P4: Interior Deduplication** — Suppress redundant interior dimensions

Each priority can be implemented and tested independently.
