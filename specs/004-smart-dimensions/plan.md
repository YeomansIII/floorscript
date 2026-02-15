# Implementation Plan: Smart Dimension Placement

**Branch**: `004-smart-dimensions` | **Date**: 2026-02-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-smart-dimensions/spec.md`

## Summary

Replace the current per-room dimension placement (2 dimensions per room at fixed offset) with an intelligent multi-lane chain dimension system. Uses `wallGraph.perimeter` from 003-unified-wall-graph to identify building edges, merges collinear room edges into continuous chain dimensions, organizes them into ordered lanes (room segments inner, overall building outer), and handles narrow segments by placing text outside extension lines. Interior dimensions are deduplicated against exterior chain coverage.

## Technical Context

**Language/Version**: TypeScript 5.7.0, target ES2022, strict mode
**Primary Dependencies**: Zod (validation), tsup (bundler), yaml (parsing)
**Storage**: N/A (file-based I/O, SVG output)
**Testing**: Vitest v3.0.0 — 189 tests across 14 files
**Target Platform**: Node.js (pure, no DOM dependency)
**Project Type**: pnpm monorepo (3 packages: core → render-svg → cli)
**Performance Goals**: Deterministic SVG generation; dimension resolution adds negligible overhead
**Constraints**: No DOM dependency; pure functions; strict TypeScript; all input through Zod schemas
**Scale/Scope**: 7-room example plan (multi-room.yaml); residential floor plans with 1-15 rooms

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. LLM-First Design | **PASS** | No input schema changes. Auto-dimensions are fully automatic — LLM agents don't need to understand dimension placement. |
| II. Text-Based and Diffable | **PASS** | SVG output remains text-based and deterministic. Same input → same dimension placement. |
| III. Architectural Correctness | **PASS** | This feature explicitly implements AIA conventions: chain dimensions, multi-lane stacking, architectural ticks (not arrowheads), proper extension lines. |
| IV. Pure Pipeline Architecture | **PASS** | Changes are split cleanly: new types in geometry.ts (types), chain logic in dimension-resolver.ts (resolve), rendering in dimension-renderer.ts (render). No cross-layer coupling. |
| V. Visual Verification | **PASS** | Required for every change. Visual verification workflow documented in quickstart.md. |
| VI. Strict Type Safety | **PASS** | New types (`DimensionChain`, `ChainSegment`) are fully typed interfaces. `wallGraph` parameter changes from optional to required (stricter). |

**Post-Phase-1 re-check**: All principles remain satisfied. The data model replaces `ResolvedDimension[]` with `DimensionChain[]` — a cleaner unified type. No external API consumers exist; the only contract is YAML in → SVG out.

## Project Structure

### Documentation (this feature)

```text
specs/004-smart-dimensions/
├── plan.md              # This file
├── research.md          # Phase 0 output — design decisions
├── data-model.md        # Phase 1 output — type definitions
├── quickstart.md        # Phase 1 output — implementation guide
├── contracts/
│   ├── dimension-resolver-api.md   # Resolver function contracts
│   └── dimension-renderer-api.md   # Renderer function contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/
  core/
    src/
      types/
        geometry.ts                    # Modified: replace ResolvedDimension with DimensionChain/ChainSegment; add TextBoundingBox
      resolver/
        dimension-resolver.ts          # Major rewrite: perimeter-based chain generation
    __tests__/
      dimension-resolver.test.ts       # New: dedicated chain dimension tests
      layout-resolver.test.ts          # Modified: update existing dimension test

  render-svg/
    src/
      renderers/
        dimension-renderer.ts          # Major enhancement: add renderChainDimension()
      render-svg.ts                    # Modified: render chain dimensions, update margin
    __tests__/
      integration.test.ts             # Modified: verify chain dimension SVG output
```

**Structure Decision**: All changes fit within existing packages. No new packages needed. Resolver changes in `@floorscript/core`, renderer changes in `@floorscript/render-svg`. Follows established patterns for resolvers and renderers.

## Design Decisions

### D1: Replace `ResolvedDimension[]` with `DimensionChain[]`

`ResolvedPlan.dimensions` changes type from `ResolvedDimension[]` to `DimensionChain[]`. Every dimension is a chain — multi-segment for building edges with multiple rooms, single-segment for individual room edges. One type, one renderer path, no dual-list management.

`ResolvedDimension` is removed. There are no external consumers of the intermediate `ResolvedPlan` type — the only API contract is YAML/JSON input → SVG output.

### D2: Perimeter-first approach

Building edges are derived from `wallGraph.perimeter` (computed by 003's `computePerimeter()`), not from room bounds scanning. This correctly handles extensions, enclosures, and composite building outlines.

### D3: Two fixed lanes

Lane 0: room-edge chain dimensions (inner, closer to building)
Lane 1: overall building dimension (outer, one segment spanning full edge)

Lane 1 is suppressed when only 1 room occupies an edge (FR-003).

### D4: wallGraph parameter becomes required

`generateDimensions()` changes from `_wallGraph?: WallGraph` to `wallGraph: WallGraph`. The parameter was already reserved in 003 for this purpose. Since `wallGraph` is required on `ResolvedPlan`, this is always available at the call site.

### D5: Margin increase for outer lane

`DEFAULT_MARGIN` in `render-svg.ts` increases from 3 to 5 plan units to accommodate the outer lane dimension without clipping. This affects viewBox calculation for all plans.

### D6: Extension lines are new SVG elements

Current dimensions render only tick marks and text (no extension lines from wall to dimension baseline). Chain dimensions add proper extension lines per AIA convention.

## Implementation Phases

### Phase 1: Types and Infrastructure (P1 foundation)

1. Add `DimensionChain`, `ChainSegment`, `TextBoundingBox` to `geometry.ts`; remove `ResolvedDimension`
2. Change `ResolvedPlan.dimensions` type from `ResolvedDimension[]` to `DimensionChain[]`
3. Update exports in `core/index.ts`
4. Add `estimateTextWidth()` utility function
5. Update `generateDimensions()` signature: `wallGraph` required, returns `DimensionChain[]`
6. Update call site in `layout-resolver.ts` to pass `wallGraph`
7. Update existing tests and renderer imports for the type change

### Phase 2: Chain Generation (P1 + P2)

1. Implement `extractBuildingEdges()`: group perimeter edges by direction, cluster collinear
2. Implement `buildChainDimensions()`: create lane 0 chains from edge groups
3. Implement lane 1 (overall) generation with suppression logic
4. Generate single-segment chains for uncovered room edges (e.g., hallway height)
5. Wire into `generateDimensions()` pipeline
6. Add dedicated tests (`dimension-resolver.test.ts`)

### Phase 3: Rendering (P2)

1. Replace `renderDimension()` with `renderChainDimension()` in `dimension-renderer.ts`
2. Add extension line rendering (gap + overshoot)
3. Handle narrow segment text placement (`textFits` flag)
4. Update `render-svg.ts` to iterate `DimensionChain[]`
5. Update `DEFAULT_MARGIN` for outer lane
6. Update integration tests for chain SVG output

### Phase 4: Deduplication and Polish (P4)

1. Interior dimension suppression for chain-covered edges
2. Visual verification against `multi-room.yaml`
3. Edge case testing: single-room plans, L-shaped buildings, extensions
4. Verify simple single-room plans produce clean output

### Phase 5 (Future / P3): Collision Detection

Collision-aware text placement (P3 from spec) is architected for but deferred to a follow-up. The `TextBoundingBox` type is added in Phase 1 to prepare for it.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Perimeter edges don't map cleanly to room dimensions | Low | High | 003's perimeter resolver already produces direction-tagged edges with wallId for room lookup |
| Text width estimation inaccurate for proportional fonts | Medium | Low | Conservative padding (30%) absorbs estimation error. Only affects narrow segment detection. |
| Margin increase clips existing plans | Low | Medium | Margin increase is uniform. Visual verification catches any clipping issues. |
| Chain segments have floating-point gaps | Medium | Low | Epsilon tolerance (0.01) in edge matching, same approach used throughout codebase |
