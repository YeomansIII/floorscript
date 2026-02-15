# Tasks: Smart Dimension Placement

**Input**: Design documents from `/specs/004-smart-dimensions/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — the spec requires verifiable acceptance scenarios and SC-005 mandates existing tests continue to pass.

**Organization**: Tasks are grouped by user story (P1–P4) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Type Definitions & Infrastructure)

**Purpose**: Add new types, remove old types, update exports — the type-level foundation that all user stories depend on.

- [X] T001 Add `DimensionChain`, `ChainSegment`, and `TextBoundingBox` interfaces to `packages/core/src/types/geometry.ts` per data-model.md definitions
- [X] T002 Replace `dimensions: ResolvedDimension[]` with `dimensions: DimensionChain[]` on `ResolvedPlan` in `packages/core/src/types/geometry.ts`
- [X] T003 Remove the `ResolvedDimension` interface from `packages/core/src/types/geometry.ts`
- [X] T004 Update `packages/core/src/index.ts` to export `DimensionChain`, `ChainSegment`, and `TextBoundingBox` (they're already covered by `export * from "./types/geometry.js"` — verify no named imports of `ResolvedDimension` exist)
- [X] T005 Change `generateDimensions()` signature in `packages/core/src/resolver/dimension-resolver.ts`: make `wallGraph` required (`wallGraph: WallGraph`), change return type to `DimensionChain[]`
- [X] T006 Update the `generateDimensions()` call site in `packages/core/src/resolver/layout-resolver.ts` (line ~58) to pass `wallGraph` as the third argument
- [X] T007 Add `estimateTextWidth()` utility function to `packages/core/src/resolver/dimension-resolver.ts` per resolver contract (`label.length * fontSize * CHAR_WIDTH_RATIO`)
- [X] T008 Add new constants to `packages/core/src/resolver/dimension-resolver.ts`: `EXTENSION_GAP = 0.15`, `EXTENSION_OVERSHOOT = 0.15`, `CHAR_WIDTH_RATIO = 0.6`, `COLLINEAR_EPSILON` (0.5 imperial / 0.15 metric)

**Checkpoint**: Project compiles with new types. `generateDimensions()` returns `DimensionChain[]` (can return empty array as stub). Existing tests will need updates in Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Stub the resolver to return valid `DimensionChain[]` so existing tests pass, and update the renderer + render pipeline to consume the new type. ALL user stories depend on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T009 Implement a temporary bridge in `generateDimensions()` in `packages/core/src/resolver/dimension-resolver.ts`: convert existing per-room dimension logic to return `DimensionChain[]` (single-segment chains with lane 0, one per room edge) so output is functionally equivalent to the old behavior
- [X] T010 [P] Replace `renderDimension()` with `renderChainDimension()` in `packages/render-svg/src/renderers/dimension-renderer.ts` — render a `DimensionChain` with baseline, tick marks, and per-segment text labels (initially handles single-segment chains matching old behavior)
- [X] T011 Update `packages/render-svg/src/render-svg.ts`: change import from `renderDimension` to `renderChainDimension`, update the dimension rendering loop to call `renderChainDimension(chain, ctx, dc)` for each `DimensionChain`
- [X] T012 Update `packages/core/__tests__/layout-resolver.test.ts`: change dimension assertions from `ResolvedDimension` shape to `DimensionChain[]` shape (segments, orientation, lane, direction fields)
- [X] T013 [P] Update `packages/render-svg/__tests__/integration.test.ts`: verify SVG output contains chain-dimension group elements (`class="chain-dimension"`) instead of old dimension elements
- [X] T014 Run `pnpm build && pnpm test` — all 189 existing tests must pass with the new types

**Checkpoint**: Foundation ready — `DimensionChain[]` flows through the full pipeline (resolve → render → SVG). Output is functionally equivalent to pre-004. User story implementation can begin.

---

## Phase 3: User Story 1 — Multi-Lane Exterior Dimensions (Priority: P1) 🎯 MVP

**Goal**: Organize exterior auto-dimensions into ordered lanes: room-edge chain dimensions in lane 0 (inner), overall building dimensions in lane 1 (outer), with consistent inter-lane spacing.

**Independent Test**: Render `examples/multi-room.yaml` and verify exterior dimension lines are placed in distinct, non-overlapping lanes with consistent offset spacing.

### Implementation for User Story 1

- [X] T015 [US1] Implement `extractBuildingEdges()` internal function in `packages/core/src/resolver/dimension-resolver.ts`: group `wallGraph.perimeter` edges by `CardinalDirection`, cluster collinear edges by perpendicular coordinate within `COLLINEAR_EPSILON`, return `Map<CardinalDirection, BuildingEdgeGroup[]>` per resolver contract
- [X] T016 [US1] Implement `BuildingEdgeGroup` internal interface in `packages/core/src/resolver/dimension-resolver.ts`: `{ direction, perpendicularCoord, segments: { start, end, wallId, roomId }[] }`
- [X] T017 [US1] Implement lane 0 chain generation in `buildChainDimensions()` in `packages/core/src/resolver/dimension-resolver.ts`: for each `BuildingEdgeGroup`, create a `DimensionChain` with `lane: 0`, compute offset as `baseOffset + 0 * laneSpacing`, create `ChainSegment[]` with formatted labels and `from`/`to` points on the dimension baseline
- [X] T018 [US1] Implement lane 1 (overall building) generation in `buildChainDimensions()`: for edges with 2+ room segments, create a single-segment `DimensionChain` with `lane: 1`, offset at `baseOffset + 1 * laneSpacing`; suppress when only 1 room occupies the edge (FR-003)
- [X] T019 [US1] Wire `extractBuildingEdges()` and `buildChainDimensions()` into the main `generateDimensions()` function, replacing the temporary bridge from T009
- [X] T020 [US1] Update `DEFAULT_MARGIN` from `3` to `5` in `packages/render-svg/src/render-svg.ts` (line 33) to accommodate outer-lane dimensions without clipping
- [X] T021 [US1] Add extension line rendering to `renderChainDimension()` in `packages/render-svg/src/renderers/dimension-renderer.ts`: draw perpendicular lines from wall edge (+ `EXTENSION_GAP`) to dimension baseline (+ `EXTENSION_OVERSHOOT`) at each segment boundary
- [X] T022 [P] [US1] Create `packages/core/__tests__/dimension-resolver.test.ts`: test `extractBuildingEdges()` with a 3-room north-edge layout, verify correct grouping and segment ordering
- [X] T023 [P] [US1] Add test in `packages/core/__tests__/dimension-resolver.test.ts`: verify lane 0 and lane 1 chains are generated for a multi-room edge, and lane 1 is suppressed for single-room edges
- [X] T024 [US1] Run `pnpm build && pnpm test` — all tests pass including new dimension-resolver tests

**Checkpoint**: Multi-room plans show two-lane exterior dimensions. Single-room edges get only one lane. Extension lines connect walls to dimension baselines. This is the MVP.

---

## Phase 4: User Story 2 — Chain Dimensions (Priority: P2)

**Goal**: Merge collinear room-edge dimensions along the same building edge into continuous chain dimensions with shared extension lines and per-segment labels.

**Independent Test**: Render `multi-room.yaml` and verify the north building edge shows a single chained dimension line with 3 segments (12' + 6' + 10') sharing extension lines at junctions, rather than 3 separate dimension lines.

### Implementation for User Story 2

- [X] T025 [US2] Ensure `buildChainDimensions()` in `packages/core/src/resolver/dimension-resolver.ts` produces multi-segment `ChainSegment[]` for edge groups with 2+ rooms: adjacent segments share endpoint coordinates (`segment[n].to === segment[n+1].from`)
- [X] T026 [US2] Implement `textFits` calculation in `buildChainDimensions()`: for each segment, compute `segmentLength` vs `estimateTextWidth(label, FONT_SIZE_FT) + 2 * FONT_SIZE_FT * 0.3`, set `textFits = segmentLength >= threshold`
- [X] T027 [US2] Update `renderChainDimension()` in `packages/render-svg/src/renderers/dimension-renderer.ts` to handle multi-segment chains: render continuous baseline from first segment start to last segment end, shared extension lines at junctions (render each unique x/y position once), tick marks at every segment boundary, per-segment text labels
- [X] T028 [US2] Implement narrow-segment text placement in `renderChainDimension()`: when `segment.textFits === false`, shift text outside extension lines along the baseline past segment end, extend dimension line to meet text
- [X] T029 [P] [US2] Add test in `packages/core/__tests__/dimension-resolver.test.ts`: verify 3-room north edge produces a single `DimensionChain` with 3 `ChainSegment`s, adjacent segments share endpoint coordinates
- [X] T030 [P] [US2] Add test in `packages/core/__tests__/dimension-resolver.test.ts`: verify narrow segment (< text width) gets `textFits: false`
- [X] T031 [US2] Add test in `packages/render-svg/__tests__/integration.test.ts`: verify chain dimension SVG output contains shared extension lines and per-segment text elements
- [X] T032 [US2] Run `pnpm build && pnpm test` — all tests pass

**Checkpoint**: Building edges with multiple rooms show continuous chain dimensions with shared extension lines. Narrow segments display text outside. Visually matches AIA convention.

---

## Phase 5: User Story 3 — Collision-Aware Text Placement (Priority: P3) *(Deferred — architecture prepared)*

**Goal**: Detect and resolve text-to-text and text-to-element collisions. Per plan.md Phase 5, this is "architected for but deferred to a follow-up."

**Independent Test**: Create a floor plan with overlapping dimension text and verify repositioning.

**Note**: The `TextBoundingBox` type was added in Phase 1 (T001) to prepare for this. Full implementation is out of scope for the initial 004 delivery per plan.md.

- [X] T033 [US3] Stub `detectTextCollisions()` function signature in `packages/core/src/resolver/dimension-resolver.ts` that accepts `DimensionChain[]` and returns `DimensionChain[]` unchanged (passthrough for now)
- [X] T034 [P] [US3] Add TODO comment and test placeholder in `packages/core/__tests__/dimension-resolver.test.ts` documenting the collision detection contract for future implementation

**Checkpoint**: Collision detection is architecturally prepared. `TextBoundingBox` type exists. Implementation deferred.

---

## Phase 6: User Story 4 — Suppression of Interior Duplicate Dimensions (Priority: P4)

**Goal**: Suppress auto-generated interior dimensions when the same measurement is already covered by an exterior chain dimension segment.

**Independent Test**: Render `multi-room.yaml` and count total dimension lines — no duplicate measurements for chain-covered edges.

### Implementation for User Story 4

- [X] T035 [US4] Implement `generateUncoveredDimensions()` in `packages/core/src/resolver/dimension-resolver.ts` per resolver contract: build a coverage set of `{orientation, start, end, perpendicular}` tuples from existing chain segments, then generate single-segment `DimensionChain`s only for room edges NOT in the coverage set
- [X] T036 [US4] Wire `generateUncoveredDimensions()` into `generateDimensions()` pipeline: call after `buildChainDimensions()`, append results to the chain list
- [X] T037 [US4] Remove the temporary bridge logic from T009 (per-room dimension generation) — all dimensions now flow through chain + uncovered pipeline
- [X] T038 [P] [US4] Add test in `packages/core/__tests__/dimension-resolver.test.ts`: verify room width covered by north-edge chain does NOT generate a duplicate single-segment chain
- [X] T039 [P] [US4] Add test in `packages/core/__tests__/dimension-resolver.test.ts`: verify room edge NOT on the perimeter (e.g., hallway depth) DOES generate a single-segment chain
- [X] T040 [US4] Run `pnpm build && pnpm test` — all tests pass

**Checkpoint**: No redundant interior dimensions for chain-covered edges. Uncovered room edges (e.g., hallway depth) still get dimensions.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Visual verification, edge case testing, and final validation across all stories.

- [X] T041 Build and render `multi-room.yaml` to SVG/PNG: `pnpm build && node packages/cli/dist/index.js render examples/multi-room.yaml -o examples/multi-room.svg && node scripts/svg-to-png.mjs examples/multi-room.svg examples/multi-room.png`
- [X] T042 Visual verification: inspect PNG for distinct inner/outer dimension lanes, chain dimensions with shared extension lines, no overlapping text, no clipped elements
- [X] T043 [P] Add edge-case test in `packages/core/__tests__/dimension-resolver.test.ts`: single-room plan produces clean single-lane dimensions (no lane 1, no chains)
- [X] T044 [P] Add edge-case test in `packages/core/__tests__/dimension-resolver.test.ts`: L-shaped building outline (non-collinear edges) produces separate dimension chains per collinear segment
- [X] T045 [P] Add edge-case test in `packages/core/__tests__/dimension-resolver.test.ts`: plan with extensions/enclosures correctly includes bump-outs in overall dimension span
- [X] T046 Verify simple single-room plans produce visually unchanged output (SC-006) — render a single-room YAML and compare
- [X] T047 Run full test suite: `pnpm build && pnpm test` — all tests pass
- [X] T048 Run quickstart.md validation workflow end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 completion
- **US2 (Phase 4)**: Depends on Phase 3 (US1) — builds on chain generation infrastructure
- **US3 (Phase 5)**: Can start after Phase 1 (type prep only) — deferred implementation
- **US4 (Phase 6)**: Depends on Phase 4 (US2) — needs chain coverage data for deduplication
- **Polish (Phase 7)**: Depends on Phases 3, 4, and 6

### User Story Dependencies

- **US1 (Multi-Lane)**: Foundation → US1 *(no other story dependencies)*
- **US2 (Chain Dimensions)**: Foundation → US1 → US2 *(builds on lane/edge infrastructure from US1)*
- **US3 (Collision Detection)**: Deferred — type scaffolding only
- **US4 (Deduplication)**: Foundation → US1 → US2 → US4 *(needs chain coverage data)*

### Within Each User Story

- Infrastructure/resolver before renderer
- Resolver before tests (tests validate resolver output)
- Tests before integration verification
- Build + test gate at end of each phase

### Parallel Opportunities

- T010 + T013 (renderer rewrite and integration test update — different packages)
- T012 + T013 (layout-resolver test and integration test — different files)
- T022 + T023 (independent dimension-resolver tests)
- T029 + T030 (independent dimension-resolver tests)
- T033 + T034 (stub + placeholder — different files)
- T038 + T039 (independent dimension-resolver tests)
- T043 + T044 + T045 (independent edge-case tests)

---

## Parallel Example: User Story 1

```bash
# After T019 (resolver wired up), launch parallel test creation:
Task: T022 "Test extractBuildingEdges() grouping" — packages/core/__tests__/dimension-resolver.test.ts
Task: T023 "Test lane generation and suppression" — packages/core/__tests__/dimension-resolver.test.ts

# T020 (margin) and T021 (extension lines) can run in parallel (different packages):
Task: T020 "Update DEFAULT_MARGIN" — packages/render-svg/src/render-svg.ts
Task: T021 "Add extension line rendering" — packages/render-svg/src/renderers/dimension-renderer.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T008)
2. Complete Phase 2: Foundational (T009–T014)
3. Complete Phase 3: User Story 1 (T015–T024)
4. **STOP and VALIDATE**: Visual verification with `multi-room.yaml`
5. Multi-lane exterior dimensions are working — immediate improvement visible

### Incremental Delivery

1. Setup + Foundational → Type system migrated, pipeline functional
2. Add US1 (Multi-Lane) → Two-lane exterior dimensions → **MVP!**
3. Add US2 (Chain Dimensions) → Continuous chains with shared extension lines
4. Add US4 (Deduplication) → No redundant interior dimensions
5. US3 (Collision Detection) → Deferred to follow-up feature
6. Polish → Visual verification, edge cases, final validation

### Key Files Modified

| File | Phases | Change Scope |
|------|--------|-------------|
| `packages/core/src/types/geometry.ts` | 1 | Add 3 interfaces, remove 1, change 1 field type |
| `packages/core/src/resolver/dimension-resolver.ts` | 1, 2, 3, 4, 5, 6 | Major rewrite — new functions, new algorithm |
| `packages/core/src/resolver/layout-resolver.ts` | 1 | 1-line change (pass wallGraph) |
| `packages/core/src/index.ts` | 1 | Verify exports |
| `packages/render-svg/src/renderers/dimension-renderer.ts` | 2, 3, 4 | Replace function, add extension lines, multi-segment |
| `packages/render-svg/src/render-svg.ts` | 2, 3 | Change import, update margin |
| `packages/core/__tests__/dimension-resolver.test.ts` | 3, 4, 5, 6, 7 | New file — all chain dimension tests |
| `packages/core/__tests__/layout-resolver.test.ts` | 2 | Update dimension assertions |
| `packages/render-svg/__tests__/integration.test.ts` | 2, 4 | Update dimension SVG assertions |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US3 is deliberately deferred per plan.md Phase 5 — only type scaffolding in this iteration
- US2 depends on US1 infrastructure (edge extraction, lane system) — not independently parallelizable
- US4 depends on US2 (needs chain coverage set) — sequential after chains
- Commit after each phase checkpoint
- Visual verification (T041–T042) is critical — per CLAUDE.md and spec SC-001
