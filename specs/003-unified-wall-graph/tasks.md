# Tasks: Unified Wall Graph

**Input**: Design documents from `/specs/003-unified-wall-graph/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are included where they verify new behavior or regressions. Existing tests are updated in-place rather than written separately.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Define the unified Wall type and temporary migration aliases

- [X] T001 Define `Wall` type, `WallSource` literal, `PerimeterEdge`, and `PerimeterChain` types in `packages/core/src/types/geometry.ts` per data-model.md. Add `bySubSpace` and `perimeter` fields to `WallGraph`. Make `wallGraph` required (remove `?`) on `ResolvedPlan`.
- [X] T002 Add temporary type aliases `type ResolvedWall = Wall` and `type PlanWall = Wall` in `packages/core/src/types/geometry.ts` to keep existing imports compiling during migration. Export both aliases.
**Checkpoint**: Types compile with aliases. `Wall` type defined with all fields.

**NOTE**: Phases 1–3 form an atomic unit. The codebase will not compile or pass tests until Phase 3 is complete. Do not attempt intermediate `pnpm test` until T020.

---

## Phase 2: Foundational (Resolver Updates)

**Purpose**: Update resolvers to produce `Wall[]` with ownership metadata and return walls separately from sub-space metadata. MUST complete before user story rendering/graph work.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Update `resolveWalls()` in `packages/core/src/resolver/wall-resolver.ts` to return `Wall[]` with `roomId`, `source: "parent"`, `shared: false`, `subSpaceId: null`, `composition`, and `centerline` fields populated. Add `roomId` parameter to the function signature.
- [X] T005 [P] Update `resolveOpenings()` in `packages/core/src/resolver/opening-resolver.ts` to accept `Wall` parameter type instead of `ResolvedWall`.
- [X] T006 [P] Update `resolveWallSegments()` in `packages/core/src/resolver/segment-resolver.ts` to accept `Wall` parameter type instead of `ResolvedWall`.
- [X] T007 Update `resolveEnclosures()` in `packages/core/src/resolver/enclosure-resolver.ts` to return walls separately: add `walls: Wall[]` to `EnclosureResult` with `source: "enclosure"`, `roomId` set to parent room, `subSpaceId` set to enclosure id. Remove `walls` from each returned `ResolvedEnclosure` object.
- [X] T008 Update `resolveExtensions()` in `packages/core/src/resolver/extension-resolver.ts` to return walls separately: add `walls: Wall[]` to `ExtensionResult` with `source: "extension"`, `roomId` set to parent room, `subSpaceId` set to extension id. Remove `walls` from each returned `ResolvedExtension` object.

**Checkpoint**: All resolvers produce `Wall[]` with correct metadata. Code compiles with aliases.

---

## Phase 3: User Story 1 — Single Wall Rendering Path (Priority: P1)

**Goal**: All walls (parent, enclosure, extension) appear in a single `WallGraph` and render in one pass. SVG output is visually identical.

**Independent Test**: Render `multi-room.yaml` and composite room examples. SVG output must be pixel-identical to current output. Renderer uses only `wallGraph.walls`.

### Implementation for User Story 1

- [X] T003 [US1] Remove `walls: ResolvedWall[]` from `ResolvedRoom`, `ResolvedEnclosure`, and `ResolvedExtension` interfaces in `packages/core/src/types/geometry.ts`. These now live only in the wall graph. (Deferred from Phase 1 to allow intermediate compilation during Phase 2.)
- [X] T009 [US1] Update `buildWallGraph()` in `packages/core/src/resolver/shared-wall-resolver.ts` to accept additional `enclosureWalls: Wall[]` and `extensionWalls: Wall[]` parameters. After the existing 4-stage process (detect shared → remainder → non-shared → gap-fill), append enclosure and extension walls to the `walls` array. Populate `bySubSpace` index for sub-space walls.
- [X] T010 [US1] Update `resolveRoom()` in `packages/core/src/resolver/layout-resolver.ts` to collect walls from `resolveWalls()`, `resolveEnclosures().walls`, and `resolveExtensions().walls` separately. Remove `room.walls` assignment from the returned `ResolvedRoom`.
- [X] T011 [US1] Update `resolveLayout()` in `packages/core/src/resolver/layout-resolver.ts` to pass collected enclosure and extension walls to `buildWallGraph()`. Store result as required `wallGraph` (not optional) on `ResolvedPlan`.
- [X] T012 [US1] **ATOMIC with T013.** Consolidate wall rendering in `packages/render-svg/src/renderers/wall-renderer.ts`: remove `renderWalls()`, `renderEnclosureWalls()`, and `renderExtensionWalls()` functions. Keep only `renderWallGraph()` operating on `Wall[]`. Rename internal `renderPlanWall()` to `renderWall()`.
- [X] T013 [US1] **ATOMIC with T012.** Update `packages/render-svg/src/render-svg.ts` to remove the per-room `renderWalls()` fallback path and the separate `renderEnclosureWalls()`/`renderExtensionWalls()` rendering passes. All walls and their openings render from `plan.wallGraph.walls` in a single loop.
- [X] T014 [US1] Update sub-space label rendering in `packages/render-svg/src/render-svg.ts`: enclosure and extension labels still render from `room.enclosures` and `room.extensions` metadata (bounds + label), but no longer access `.walls` on those objects.
- [X] T015 [US1] Update `packages/core/__tests__/layout-resolver.test.ts`: change wall assertions from `room.walls.find(...)` to querying `plan.wallGraph.byRoom.get(roomId)?.get(direction)`. Verify wall count in `plan.wallGraph.walls` includes all sources.
- [X] T016 [US1] Update `packages/core/__tests__/enclosure-resolver.test.ts`: verify enclosure walls appear in graph with `source: "enclosure"` and correct `subSpaceId`. Remove assertions on `enclosure.walls`.
- [X] T017 [US1] Update `packages/core/__tests__/extension-resolver.test.ts`: verify extension walls appear in graph with `source: "extension"` and correct `subSpaceId`. Remove assertions on `extension.walls`.
- [X] T018 [US1] Update `packages/core/__tests__/shared-wall-resolver.test.ts`: verify enclosure/extension walls are present in graph output alongside parent walls. Verify `bySubSpace` index.
- [X] T019 [US1] Update `packages/render-svg/__tests__/integration.test.ts`: verify SVG output unchanged. Remove any assertions that reference separate enclosure/extension wall rendering.
- [X] T020 [US1] Run `pnpm test` — all 174 tests must pass. Run `pnpm build && node packages/cli/dist/index.js render examples/multi-room.yaml -o examples/multi-room.svg` and visually verify output is identical.

**Checkpoint**: Unified graph contains all walls. Single rendering path produces identical SVG. All tests pass.

---

## Phase 4: User Story 2 — Unified Wall Type Cleanup (Priority: P2)

**Goal**: Remove `ResolvedWall` and `PlanWall` type aliases. Only `Wall` exists in the codebase.

**Independent Test**: `grep -r "ResolvedWall\|PlanWall" packages/` returns zero matches (excluding comments/docs).

### Implementation for User Story 2

- [X] T021 [US2] Remove `ResolvedWall` and `PlanWall` type aliases from `packages/core/src/types/geometry.ts`. Remove their re-exports from `packages/core/src/index.ts` if present.
- [X] T022 [P] [US2] Update all imports and type annotations in `packages/core/src/resolver/shared-wall-resolver.ts` from `PlanWall` to `Wall`.
- [X] T023 [P] [US2] Update all imports and type annotations in `packages/core/src/resolver/wall-utils.ts` from `ResolvedWall`/`PlanWall` to `Wall`. Simplify `findWallById` return type to `{ room, wall: Wall, direction }` (remove dual `wall`/`planWall` fields).
- [X] T024 [P] [US2] Update all imports and type annotations in `packages/core/src/resolver/validation.ts` from `PlanWall`/`ResolvedWall` to `Wall`.
- [X] T025 [P] [US2] Update all imports and type annotations in `packages/core/src/resolver/electrical-resolver.ts` and `packages/core/src/resolver/plumbing-resolver.ts` from `ResolvedWall` to `Wall`.
- [X] T026 [P] [US2] Update all imports and type annotations in `packages/render-svg/src/renderers/wall-renderer.ts` and `packages/render-svg/src/render-svg.ts` from `PlanWall` to `Wall`.
- [X] T027 [P] [US2] Update all test files that reference `ResolvedWall` or `PlanWall`: `packages/core/__tests__/layout-resolver.test.ts`, `shared-wall-resolver.test.ts`, `validation.test.ts`, `from-offset.test.ts`, `electrical-resolver.test.ts`, `plumbing-resolver.test.ts`.
- [X] T028 [US2] Run `pnpm test` and `pnpm typecheck` — all tests pass, no type errors, no remaining references to old type names.

**Checkpoint**: `ResolvedWall` and `PlanWall` do not exist in the codebase. Single `Wall` type used everywhere.

---

## Phase 5: User Story 3 — Complete Wall Lookups (Priority: P3)

**Goal**: `findWallById` resolves walls for enclosures and extensions, not just parent rooms.

**Independent Test**: Call `findWallById("pantry.south", ...)` for an enclosure wall and verify it returns the correct `Wall`.

### Implementation for User Story 3

- [X] T029 [US3] Extend `findWallById()` in `packages/core/src/resolver/wall-utils.ts` to check `wallGraph.bySubSpace` after `wallGraph.byRoom`. Split the input ID into `{prefix}.{direction}`, try room lookup first, then sub-space lookup.
- [X] T030 [US3] Add tests in `packages/core/__tests__/layout-resolver.test.ts` (or a new `wall-utils.test.ts`): verify `findWallById("enclosureId.direction")` returns the correct enclosure wall, and `findWallById("extensionId.direction")` returns the correct extension wall.
- [X] T031 [US3] Add a test in `packages/core/__tests__/electrical-resolver.test.ts` that places an outlet on an enclosure wall (e.g., `wall: "pantry.south"`) and verifies it resolves to the correct absolute position.
- [X] T032 [US3] Add a test in `packages/core/__tests__/plumbing-resolver.test.ts` that places a fixture referencing an extension wall and verifies correct positioning.
- [X] T033 [US3] Run `pnpm test` — all tests pass including new sub-space wall lookup tests.

**Checkpoint**: Wall-relative positioning works for enclosure and extension walls.

---

## Phase 6: User Story 4 — Building Perimeter Edges (Priority: P4)

**Goal**: Derive ordered perimeter edges (CCW closed polygons) from exterior wall outer-edges in the unified graph.

**Independent Test**: Resolve a multi-room plan with extensions. Verify perimeter edges form a closed polygon matching the building outline.

### Implementation for User Story 4

- [X] T034 [US4] Create `packages/core/src/resolver/perimeter-resolver.ts` with `computePerimeter(wallGraph: WallGraph): PerimeterChain[]`. Collect outer-edges from non-shared, non-enclosure walls (`source !== "enclosure"` and `shared === false`). Chain edges into CCW-wound closed polygons. Simplify collinear vertices by removing intermediate points where three consecutive vertices share the same direction (zero cross-product within floating-point epsilon). Compute bounds per chain.
- [X] T035 [US4] Wire `computePerimeter()` into `resolveLayout()` in `packages/core/src/resolver/layout-resolver.ts` — call after `buildWallGraph()` and store result on `wallGraph.perimeter`.
- [X] T036 [US4] Export `computePerimeter` from `packages/core/src/index.ts`.
- [X] T037 [US4] Add tests in `packages/core/__tests__/perimeter-resolver.test.ts`: single room (4-edge rectangle), multi-room with shared walls (shared walls excluded), room with extension (perimeter follows bump-out), room with corner enclosure (enclosure walls excluded from perimeter).
- [X] T038 [US4] Run `pnpm test` — all tests pass including perimeter edge tests.

**Checkpoint**: `plan.wallGraph.perimeter` contains correct building outline polygons.

---

## Phase 7: User Story 5 — Correct Bounds Computation (Priority: P5)

**Goal**: Plan bounds include extension wall geometry. No SVG clipping.

**Independent Test**: Resolve a plan with a north extension. Verify `plan.bounds` extends to include the extension's north wall.

### Implementation for User Story 5

- [X] T039 [US5] Update `computeBounds()` in `packages/core/src/resolver/layout-resolver.ts` to iterate `wallGraph.walls` instead of per-room wall iteration. All rooms produce walls in the graph, so the wall graph iteration covers all geometry.
- [X] T040 [US5] Add a test in `packages/core/__tests__/layout-resolver.test.ts` that resolves a room with a north extension and verifies `plan.bounds.y + plan.bounds.height` includes the extension's north wall outer edge.
- [X] T041 [US5] Run `pnpm test` — all tests pass.

**Checkpoint**: Extension walls no longer clipped from plan bounds.

---

## Phase 8: User Story 6 — Complete Validation Coverage (Priority: P6)

**Goal**: Validation checks apply to enclosure and extension walls, not just parent room walls.

**Independent Test**: Create a config with overlapping openings on an enclosure wall. Verify validator reports an error.

### Implementation for User Story 6

- [X] T042 [US6] Update `checkOverlappingOpenings()` in `packages/core/src/resolver/validation.ts` to iterate `wallGraph.walls` (it already does, but verify it now covers enclosure/extension walls).
- [X] T043 [P] [US6] Update `checkOpeningExceedsWall()` in `packages/core/src/resolver/validation.ts` — same verification.
- [X] T044 [P] [US6] Update `checkSealedRooms()` in `packages/core/src/resolver/validation.ts` to use `wallGraph.byRoom` and `wallGraph.bySubSpace` for complete coverage. Add a new `checkSealedExtensions()` function that emits a `"sealed-extension"` warning (distinct from `"sealed-room"`) for extensions with no openings on any of their walls.
- [X] T045 [P] [US6] Update `checkRunsThroughWalls()` in `packages/core/src/resolver/validation.ts` — verify supply/drain runs are checked against all walls including enclosure/extension walls.
- [X] T046 [US6] Update `checkSealedEnclosures()` in `packages/core/src/resolver/validation.ts` to query enclosure walls from `wallGraph.bySubSpace` instead of `enc.walls`.
- [X] T047 [US6] Add tests in `packages/core/__tests__/validation.test.ts`: overlapping openings on an enclosure wall, sealed extension (no openings), supply run crossing enclosure wall.
- [X] T048 [US6] Run `pnpm test` — all tests pass including new validation tests.

**Checkpoint**: Validation covers all wall sources. Enclosure/extension walls get full validation.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, documentation, and cleanup

- [X] T049a [P] Add regression test in `packages/core/__tests__/shared-wall-resolver.test.ts` verifying that the `shared_walls` config override mechanism still works correctly for rooms that also have enclosures/extensions (FR-014).
- [X] T049b [P] Add edge case tests from spec.md: (1) enclosure wall collinear with parent wall remains a separate graph entry, (2) two extensions on the same parent wall produce independent walls, (3) full-length wall-based enclosure (`length: "full"`) produces correct facing wall, (4) `shared_walls` override with enclosures/extensions present does not affect sub-space walls. Add to appropriate test files (`shared-wall-resolver.test.ts`, `extension-resolver.test.ts`, `enclosure-resolver.test.ts`).
- [X] T049 Run full test suite: `pnpm test` — verify all tests pass (original 174 + new tests).
- [X] T050 Run `pnpm build && pnpm typecheck` — verify clean compilation across all packages.
- [X] T051 Visual verification: render all example YAMLs to SVG and PNG, visually inspect for identical output. Check `examples/multi-room.yaml`, `examples/composite-room.yaml` (if exists), and any other examples with extensions/enclosures.
- [X] T052 Update `packages/core/floorscript.schema.json` if it references resolved types (likely no changes needed — schema describes input config).
- [X] T053 [P] Update `.claude/skills/generate-floorplan/SKILL.md` to mention that enclosure and extension walls can be referenced for electrical/plumbing placement (e.g., `wall: "pantry.south"`).
- [X] T054 [P] Update `ARCHITECTURE.md` to reflect unified wall graph (remove references to dual types and three rendering paths).
- [X] T055 Verify no references to `ResolvedWall` or `PlanWall` remain in source code: `grep -r "ResolvedWall\|PlanWall" packages/` returns zero matches.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist)
- **US1 (Phase 3)**: Depends on Phase 2 (resolvers must produce Wall[])
- **US2 (Phase 4)**: Depends on Phase 3 (graph must be unified before alias removal)
- **US3 (Phase 5)**: Depends on Phase 3 (graph must contain sub-space walls)
- **US4 (Phase 6)**: Depends on Phase 3 (graph must contain all walls)
- **US5 (Phase 7)**: Depends on Phase 3 (graph must contain all walls)
- **US6 (Phase 8)**: Depends on Phase 3 (graph must contain all walls)
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2)
                                   ↘ Phase 5 (US3)  ↘
                                   ↘ Phase 6 (US4)  → Phase 9 (Polish)
                                   ↘ Phase 7 (US5)  ↗
                                   ↘ Phase 8 (US6)  ↗
```

- **US1** is the critical path — all other stories depend on the unified graph.
- **US2** (type cleanup) depends on US1 to avoid removing aliases too early.
- **US3, US4, US5, US6** can proceed in parallel after US1 completes.

### Parallel Opportunities

After US1 completes:
- US3 (wall lookups), US4 (perimeter), US5 (bounds), US6 (validation) are fully independent
- Within US2: T022–T027 are all [P] (different files)
- Within US6: T042–T045 are [P] (different validation functions)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T002)
2. Complete Phase 2: Foundational (T004–T008)
3. Complete Phase 3: User Story 1 (T003, T009–T020)
4. **STOP and VALIDATE**: All 174 tests pass, SVG output identical, single rendering path
5. This alone delivers the core architectural improvement

### Incremental Delivery

1. Setup + Foundational + US1 → Unified graph works, visual parity confirmed
2. Add US2 → Clean types, no aliases, codebase fully migrated
3. Add US3 → Enclosure/extension wall lookups for electrical/plumbing
4. Add US4 → Perimeter edges ready for 004-smart-dimensions
5. Add US5 → Bounds bug fixed
6. Add US6 → Full validation coverage
7. Polish → Documentation, final visual verification

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable after US1
- Run `pnpm test` after each phase checkpoint
- Visual verification (Constitution Principle V) required after US1 and in Polish phase
- Type aliases (T002) are a migration safety net — remove in US2 (T021)
