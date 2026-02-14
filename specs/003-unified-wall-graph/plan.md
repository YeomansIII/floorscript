# Implementation Plan: Unified Wall Graph

**Branch**: `003-unified-wall-graph` | **Date**: 2026-02-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-unified-wall-graph/spec.md`

## Summary

Refactor the wall resolution and rendering system to replace the dual `ResolvedWall`/`PlanWall` type split and three separate wall storage locations with a single `Wall` type in a unified `WallGraph`. Add derived perimeter edges for building outline queries. No YAML config changes — purely internal refactor with visually identical output.

## Technical Context

**Language/Version**: TypeScript 5.7.0, target ES2022, strict mode
**Primary Dependencies**: Zod (validation), yaml (parsing), tsup (bundler), Commander (CLI)
**Storage**: N/A (file-based I/O)
**Testing**: Vitest 3.0.0 — 174 tests across 13 test files
**Target Platform**: Node.js (pure, no DOM dependency)
**Project Type**: pnpm monorepo — 3 packages (`core` → `render-svg` → `cli`)
**Performance Goals**: Resolution and rendering performance parity with current implementation
**Constraints**: All 174 existing tests must pass. SVG output must be visually identical. No YAML config format changes.
**Scale/Scope**: ~20 source files + ~13 test files impacted. Net type reduction (2 types → 1).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. LLM-First Design | PASS | No config changes. YAML format unchanged. |
| II. Text-Based and Diffable | PASS | SVG output deterministic and identical. |
| III. Architectural Correctness by Default | PASS | Wall geometry, line weights, symbols unchanged. |
| IV. Pure Pipeline Architecture | PASS | Parse → Resolve → Render preserved. Resolver produces unified graph (still pure functions). Renderer consumes graph (no layout decisions). |
| V. Visual Verification Required | PASS | Plan includes visual verification of all examples after refactor. |
| VI. Strict Type Safety | PASS | Unified `Wall` type with Zod-inferred metadata fields. No `any` types. `.js` import extensions. |
| Technology Constraints | PASS | TypeScript strict, pnpm workspace, tsup dual output, Vitest, Zod. No new packages. |
| Development Workflow | PASS | Tests before commit, build after core/render-svg changes, visual verification for rendered output. |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-unified-wall-graph/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/
  core/
    src/
      types/
        geometry.ts              # Wall type unification (remove ResolvedWall, PlanWall → Wall)
      resolver/
        layout-resolver.ts       # Orchestrator: feed all walls to graph, update bounds
        wall-resolver.ts         # Return Wall[] with metadata
        shared-wall-resolver.ts  # Accept + index enclosure/extension walls
        enclosure-resolver.ts    # Return Wall[] separately from enclosure metadata
        extension-resolver.ts    # Return Wall[] separately from extension metadata
        opening-resolver.ts      # Update parameter type to Wall
        segment-resolver.ts      # Update parameter type to Wall
        wall-utils.ts            # Extend findWallById for sub-space walls
        validation.ts            # Simplify to use unified graph only
        electrical-resolver.ts   # Use Wall from findWallById
        plumbing-resolver.ts     # Use Wall from findWallById
        perimeter-resolver.ts    # NEW: derive perimeter edges from wall graph
    __tests__/
      layout-resolver.test.ts    # Query walls from graph instead of room.walls
      shared-wall-resolver.test.ts
      enclosure-resolver.test.ts
      extension-resolver.test.ts
      validation.test.ts
      electrical-resolver.test.ts
      plumbing-resolver.test.ts
      from-offset.test.ts
  render-svg/
    src/
      render-svg.ts              # Single rendering pass from wall graph
      renderers/
        wall-renderer.ts         # Remove 3 functions → 1 renderWallGraph
    __tests__/
      integration.test.ts
```

**Structure Decision**: Existing monorepo structure preserved. No new packages. One new file (`perimeter-resolver.ts`) in `packages/core/src/resolver/`. All other changes are modifications to existing files.
