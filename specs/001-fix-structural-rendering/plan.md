# Implementation Plan: Fix Structural Rendering Foundations

**Branch**: `001-fix-structural-rendering` | **Date**: 2026-02-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-fix-structural-rendering/spec.md`

## Summary

Fix the most critical structural and rendering defects in FloorScript's
multi-room floor plan pipeline. The core change is introducing interior
dimensions (room sizes = usable space, walls are additional material)
and a plan-level wall graph that replaces per-room wall ownership.
Adjacent rooms share a single wall instead of generating duplicate
walls with a visible gap. Secondary fixes include correct door swing
direction on shared walls, wall-relative plumbing positioning,
collision-aware dimension placement, improved cased opening rendering,
and a linter-style validation pass.

## Technical Context

**Language/Version**: TypeScript 5.7.0, target ES2022, strict mode
**Primary Dependencies**: Zod (validation), yaml (parsing), tsup (bundler), Commander (CLI)
**Storage**: N/A (file-based I/O)
**Testing**: Vitest 3.0.0 — unit tests in `packages/*/__tests__/`, visual regression snapshots
**Target Platform**: Node.js (no DOM dependency)
**Project Type**: pnpm monorepo (3 packages: core → render-svg → cli)
**Performance Goals**: N/A (CLI tool processing single files)
**Constraints**: No runtime DOM dependency; pure Node.js SVG generation
**Scale/Scope**: ~50 existing tests, ~30 source files across 3 packages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. LLM-First Design | PASS | Interior dimensions model is more intuitive for LLM agents. `stud` field is optional with sensible defaults. Error messages from validator are actionable. |
| II. Text-Based and Diffable | PASS | All input remains YAML/JSON. SVG output remains text-based. Deterministic: identical input → identical output (no randomness in wall graph). |
| III. Architectural Correctness by Default | PASS | Interior dimensions match residential floor plan convention. Shared walls match real construction. Default stud sizes match standard framing. Dimension style preserved. |
| IV. Pure Pipeline Architecture | PASS | Parse → Resolve → Validate → Render. New `buildWallGraph()` and `validatePlan()` are pure functions in the resolve stage. No mutation. Each stage independently testable. Validation is a separate pure pass. |
| V. Visual Verification Required | PASS | Plan includes visual verification at each phase. Multi-room.yaml is the primary visual test case. PNG inspection required before merge. |
| VI. Strict Type Safety | PASS | Input types (WallComposition, SharedWallConfig) defined with Zod schemas. Output types (PlanWall, WallGraph, ValidationResult) defined as TypeScript interfaces. TypeScript strict mode. `.js` import extensions. |

**No violations. Gate passes.**

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-structural-rendering/
├── plan.md              # This file
├── research.md          # Phase 0: decisions and rationale
├── data-model.md        # Phase 1: entity definitions
├── quickstart.md        # Phase 1: verification guide
├── contracts/
│   └── resolver-contracts.md  # Phase 1: function contracts
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
packages/
  core/
    src/
      types/
        config.ts             # MODIFY: add WallComposition, SharedWallConfig,
        │                     #   stud field, plumbing wall refs
        geometry.ts           # MODIFY: add PlanWall, WallGraph,
        │                     #   ValidationResult, extend ResolvedPlan
      resolver/
        layout-resolver.ts    # MODIFY: orchestrate wall graph + validation
        wall-resolver.ts      # MODIFY: interior-dimensions wall geometry
        shared-wall-resolver.ts  # NEW: build wall graph, detect shared walls
        wall-utils.ts         # NEW: extracted findWallById, computeWallPosition
        opening-resolver.ts   # MODIFY: add ownerRoomId to openings
        dimension-resolver.ts # MODIFY: neighbor-aware placement, dedup
        plumbing-resolver.ts  # MODIFY: wall-relative fixture positioning
        electrical-resolver.ts # MODIFY: use shared wall-utils
        validation.ts         # NEW: linter-style plan validation
        segment-resolver.ts   # UNCHANGED
      parser/
        config-parser.ts      # MODIFY: parse new config fields
        dimension.ts          # UNCHANGED
    __tests__/
      layout-resolver.test.ts      # MODIFY: update wall geometry assertions
      config-parser.test.ts        # MODIFY: add stud/composition tests
      shared-wall-resolver.test.ts # NEW: wall graph construction tests
      validation.test.ts           # NEW: validator tests
      electrical-resolver.test.ts  # MODIFY: update position assertions
      plumbing-resolver.test.ts    # MODIFY: add wall-relative tests

  render-svg/
    src/
      render-svg.ts               # MODIFY: render from WallGraph
      renderers/
        wall-renderer.ts          # MODIFY: accept PlanWall
        door-renderer.ts          # MODIFY: room-aware swing, improved cased opening
        dimension-renderer.ts     # UNCHANGED
        label-renderer.ts         # UNCHANGED
        plumbing-renderer.ts      # MODIFY: fixture orientation support
    __tests__/
      integration.test.ts         # MODIFY: update SVG assertions
      visual-regression.test.ts   # MODIFY: regenerate snapshots

  cli/
    src/
      commands/
        render.ts                 # UNCHANGED
        validate.ts               # NEW: CLI validate command

examples/
  multi-room.yaml                 # MODIFY: update for new coordinate model
```

**Structure Decision**: Existing monorepo structure preserved. No new
packages — all changes fit within `@floorscript/core` (types, resolvers,
validation) and `@floorscript/render-svg` (renderers). Two new resolver
files (`shared-wall-resolver.ts`, `wall-utils.ts`, `validation.ts`) and
one new CLI command (`validate.ts`).

## Complexity Tracking

No constitution violations to justify.

## Implementation Phases

### Phase A: Interior Dimensions + Wall Composition (Foundation)

**Goal**: Change the coordinate model so room dimensions mean interior
clear space. Add wall composition (stud width) to config and types.
This is the most fundamental change and must come first.

**Files**:
- `config.ts`: Add StudSize, WallComposition to Zod schemas
- `geometry.ts`: Add WallComposition to ResolvedWall, update Rect semantics
- `wall-resolver.ts`: Change wall placement to be outside room bounds
- `config-parser.ts`: Parse new stud/composition fields
- `layout-resolver.ts`: Update bounds computation for exterior walls
- `multi-room.yaml`: Update positions for new coordinate model

**Tests**: Update all layout-resolver tests. Add config-parser tests
for stud field.

**Visual verification**: Render multi-room.yaml, confirm rooms have
correct interior dimensions, walls extend outside room bounds.

### Phase B: Wall Graph + Shared Walls (Critical Fix)

**Goal**: Build plan-level wall graph. Detect shared walls between
adjacent rooms. Merge into single PlanWall.

**Files**:
- `geometry.ts`: Add PlanWall, WallGraph interfaces
- `shared-wall-resolver.ts`: NEW — buildWallGraph(), detectSharedWalls()
- `wall-utils.ts`: NEW — extract findWallById(), computeWallPosition()
- `layout-resolver.ts`: Call buildWallGraph() after room resolution
- `opening-resolver.ts`: Add ownerRoomId to ResolvedOpening

**Tests**: New shared-wall-resolver.test.ts with adjacency detection,
partial overlap, thicker-wins rule, opening merge.

**Visual verification**: Render multi-room.yaml, confirm single walls
at all room boundaries. No gaps.

### Phase C: Rendering from WallGraph (Critical Fix)

**Goal**: Update SVG renderer to use WallGraph instead of per-room
walls. Fix door swing for shared walls. Improve cased openings.

**Files**:
- `render-svg.ts`: Render walls from plan.wallGraph.walls
- `wall-renderer.ts`: Accept PlanWall (structurally similar to
  ResolvedWall — segments + type + lineWeight)
- `door-renderer.ts`: Use ownerRoomId for swing direction. Improve
  cased opening with L-shaped marks.
- `electrical-resolver.ts`: Use shared wall-utils (moved to Setup
  phase in tasks.md for earlier extraction)

**Tests**: Update integration tests. Regenerate visual regression
snapshots.

**Visual verification**: Full visual check — walls, doors, cased
openings, electrical symbols all render correctly.

### Phase D: Plumbing Wall-Relative Positioning (P2)

**Goal**: Add wall reference support to plumbing fixtures. Extract
fixture reference resolution for supply/drain runs.

**Files**:
- `config.ts`: Add wall, offset, orientation to PlumbingFixtureConfig.
  Add from/to fixture refs to run configs.
- `plumbing-resolver.ts`: Use wall-utils for wall-relative resolution.
  Resolve fixture ID references in runs.
- `plumbing-renderer.ts`: Support fixture orientation (rotation).
- `multi-room.yaml`: Update plumbing section with wall references.

**Tests**: Add wall-relative plumbing tests. Update plumbing-resolver
tests.

**Visual verification**: Confirm fixtures flush against walls, supply
lines connect to fixtures.

### Phase E: Smart Dimension Placement (P2)

**Goal**: Neighbor-aware dimension offset, deduplication for shared
walls, interior measurement display.

**Files**:
- `dimension-resolver.ts`: Accept WallGraph. Check for neighbor rooms
  in offset direction. Deduplicate shared-edge dimensions. Stack
  dimensions in lanes when needed.

**Tests**: Update dimension-related layout-resolver tests. Add
multi-room dimension placement tests.

**Visual verification**: Confirm no dimension-label overlaps in
multi-room example.

### Phase F: Validation Pass (P2)

**Goal**: Implement linter-style validator. Add CLI validate command.

**Files**:
- `geometry.ts`: Add ValidationResult, ValidationIssue interfaces
- `validation.ts`: NEW — validatePlan() with all checks
- `layout-resolver.ts`: Call validatePlan() at end of pipeline
- `cli/commands/validate.ts`: NEW — CLI command
- `cli/index.ts` or `cli.ts`: Wire validate command

**Tests**: New validation.test.ts with deliberately invalid plans for
each error/warning condition.

### Phase G: Polish + Visual Verification (P3)

**Goal**: Final visual verification, snapshot regeneration, update
examples, verify all acceptance scenarios.

**Files**:
- All visual regression snapshots regenerated
- `multi-room.yaml`: Final adjustments
- Examples re-rendered to SVG/PNG

**Verification**: Complete visual verification workflow per CLAUDE.md.
Check all items: electrical symbols, plumbing fixtures, layer
visibility, wall-mounted elements, text overlaps, boundary clipping.

## Phase Dependencies

```
Phase A (Interior Dims) ──→ Phase B (Wall Graph) ──→ Phase C (Rendering)
                                                         │
                              Phase D (Plumbing) ←───────┤
                              Phase E (Dimensions) ←─────┤
                              Phase F (Validation) ←─────┘
                                        │
                              Phase G (Polish) ←─── all above
```

- **A → B → C** is the critical path (P1 user stories)
- **D, E, F** can proceed in parallel after C (P2 user stories)
- **G** depends on all others (final verification)
