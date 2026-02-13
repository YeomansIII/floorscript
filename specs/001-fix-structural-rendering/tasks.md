# Tasks: Fix Structural Rendering Foundations

**Input**: Design documents from `/specs/001-fix-structural-rendering/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/resolver-contracts.md

**Tests**: Included — plan.md explicitly specifies test files to create/modify.

**Organization**: Tasks grouped by user story. US1+US2 (P1) form the critical path. US3, US4, US5 can proceed in parallel after US1. US6 depends on US3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Type Foundations + Shared Utilities)

**Purpose**: Add new Zod schemas, types, and extract shared utility functions. No behavioral changes — existing tests continue to pass.

- [X] T001 Add StudSize enum, WallComposition Zod schema, SharedWallConfig Zod schema, and extend WallConfig with optional stud and finish fields in packages/core/src/types/config.ts
- [X] T002 [P] Add PlanWall, WallGraph, ValidationResult, ValidationIssue types, add ownerRoomId field to ResolvedOpening, and add wallGraph and validation fields to ResolvedPlan in packages/core/src/types/geometry.ts
- [X] T003 [P] Create packages/core/src/resolver/wall-utils.ts with findWallById() and computeWallPosition() extracted from electrical-resolver.ts per resolver-contracts.md
- [X] T004 Update packages/core/src/parser/config-parser.ts to parse stud, finish, and shared_walls config fields with Zod validation
- [X] T005 Update packages/core/src/resolver/electrical-resolver.ts to import findWallById and computeWallPosition from wall-utils.ts instead of local definitions

**Checkpoint**: All new types compile. Existing tests still pass. No behavioral changes yet.

---

## Phase 2: Foundational (Interior Dimensions Coordinate Model)

**Purpose**: Change the coordinate model so room width/height = interior clear space. Walls become additional material outside room bounds. This is a breaking change that ALL subsequent phases depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T006 Implement resolveWallComposition() in packages/core/src/resolver/shared-wall-resolver.ts (new file — composition logic only, not buildWallGraph yet) per resolver-contracts.md
- [X] T007 Modify resolveWalls() in packages/core/src/resolver/wall-resolver.ts to compute walls as additional material outside room interior bounds, using WallComposition for thickness derivation
- [X] T008 Update computePlanBounds() in packages/core/src/resolver/layout-resolver.ts to include exterior wall extents outside room bounds
- [X] T009 Update room positions and dimensions in examples/multi-room.yaml for the interior-dimensions coordinate model (walls no longer eat into room space)
- [X] T010 Update all wall geometry assertions in packages/core/__tests__/layout-resolver.test.ts and position assertions in packages/core/__tests__/electrical-resolver.test.ts for interior-dimensions model (wall rects now outside room bounds)
- [X] T011 [P] Add config-parser tests for stud, composition, and shared_walls Zod validation in packages/core/__tests__/config-parser.test.ts

**Checkpoint**: Foundation ready. Room dimensions = interior clear space. Walls extend outside room bounds. All tests pass with updated assertions. User story implementation can now begin.

---

## Phase 3: User Story 1 — Adjacent Rooms Render With a Single Shared Wall (Priority: P1) 🎯 MVP

**Goal**: Build plan-level WallGraph that detects shared boundaries, merges adjacent room walls into single PlanWalls, and renders from the wall graph. Eliminates double-wall artifacts.

**Independent Test**: Render `examples/multi-room.yaml` and visually confirm every adjacent room pair shares a single wall with correct thickness and no visible gap.

### Implementation for User Story 1

- [X] T012 [US1] Implement buildWallGraph() with shared boundary detection, thicker-wins rule, and opening merge in packages/core/src/resolver/shared-wall-resolver.ts per resolver-contracts.md
- [X] T013 [P] [US1] Add ownerRoomId population to resolveOpenings() in packages/core/src/resolver/opening-resolver.ts so each opening tracks which room defined it
- [X] T014 [US1] Integrate buildWallGraph() call into resolveLayout() pipeline after resolveRooms() and attach WallGraph to ResolvedPlan in packages/core/src/resolver/layout-resolver.ts
- [X] T015 [P] [US1] Update wall-renderer to accept PlanWall structure (segments, type, lineWeight) in packages/render-svg/src/renderers/wall-renderer.ts
- [X] T016 [US1] Update renderSvg() to iterate plan.wallGraph.walls for wall rendering instead of per-room walls in packages/render-svg/src/render-svg.ts
- [X] T017 [P] [US1] Create packages/core/__tests__/shared-wall-resolver.test.ts with tests for adjacency detection, partial overlap, thicker-wins rule, opening merge, and T-junction handling
- [X] T018 [US1] Update SVG content assertions in packages/render-svg/__tests__/integration.test.ts to verify wall graph rendering produces correct SVG output
- [X] T019 [US1] Visual verification: build all packages, render examples/multi-room.yaml to SVG/PNG, confirm single shared walls with no gaps between adjacent rooms

**Checkpoint**: US1 fully functional. Adjacent rooms share single walls. No double-wall artifacts. All tests pass.

---

## Phase 4: User Story 2 — Doors on Shared Walls Swing Correctly (Priority: P1)

**Goal**: Door swing direction on shared walls resolves relative to the owning room (the room whose config defined the opening), not the wall's geometric position alone.

**Independent Test**: Place doors on each cardinal wall with all four swing types and verify each arc direction visually.

### Implementation for User Story 2

- [X] T020 [US2] Update door swing direction logic in packages/render-svg/src/renderers/door-renderer.ts to resolve inward/outward relative to ownerRoomId on shared walls instead of cardinal direction alone
- [X] T021 [US2] Add door swing tests covering all 4 cardinal walls × 4 swing types verifying correct arc direction in packages/render-svg/__tests__/integration.test.ts
- [X] T022 [US2] Visual verification: render multi-room.yaml to SVG/PNG, confirm all door arcs open into the correct rooms with hinges on wall faces

**Checkpoint**: US1 + US2 both functional. Shared walls render correctly with proper door swings.

---

## Phase 5: User Story 3 — Plumbing Fixtures Position Against Walls (Priority: P2)

**Goal**: Add wall-relative positioning for plumbing fixtures using the same pattern as electrical elements. Fixtures render flush against the inner wall face. Legacy absolute positioning preserved.

**Independent Test**: Define plumbing fixtures using wall references (e.g., `wall: bathroom.south`), render the plan, and confirm fixtures are flush against the inner wall face.

### Implementation for User Story 3

- [X] T023 [US3] Add FacingDirection type and extend PlumbingFixtureConfig with wall, offset, and orientation fields in packages/core/src/types/config.ts
- [X] T024 [US3] Update config-parser to parse plumbing fixture wall, offset, and orientation fields in packages/core/src/parser/config-parser.ts
- [X] T025 [US3] Implement wall-relative fixture positioning in packages/core/src/resolver/plumbing-resolver.ts using findWallById() from wall-utils.ts, with fallback to legacy absolute positioning and descriptive error for invalid wall references (per edge case EC-5 and findWallById contract)
- [X] T026 [P] [US3] Add fixture orientation (rotation) rendering support in packages/render-svg/src/renderers/plumbing-renderer.ts based on FacingDirection
- [X] T027 [US3] Update plumbing section of examples/multi-room.yaml with wall references and orientation values
- [X] T028 [US3] Add wall-relative positioning and legacy fallback tests in packages/core/__tests__/plumbing-resolver.test.ts
- [X] T029 [US3] Visual verification: render multi-room.yaml to SVG/PNG, confirm fixtures flush against referenced walls with correct orientation

**Checkpoint**: US3 functional. Plumbing fixtures position against walls. Legacy absolute positioning still works.

---

## Phase 6: User Story 4 — Dimension Lines Do Not Overlap Other Elements (Priority: P2)

**Goal**: Auto-generated dimension lines avoid neighboring rooms, deduplicate shared-wall measurements, and stack in lanes when multiple dimensions compete for the same side.

**Independent Test**: Render `examples/multi-room.yaml` and confirm no dimension text overlaps any room label or other dimension text.

### Implementation for User Story 4

- [X] T030 [US4] Update generateDimensions() to accept WallGraph, implement neighbor-aware offset calculation, shared-wall dimension deduplication, and lane stacking in packages/core/src/resolver/dimension-resolver.ts per resolver-contracts.md
- [X] T031 [US4] Add multi-room dimension placement tests verifying no overlaps and deduplication in packages/core/__tests__/layout-resolver.test.ts
- [X] T032 [US4] Visual verification: render multi-room.yaml to SVG/PNG, confirm no dimension text overlaps room labels or other dimensions

**Checkpoint**: US4 functional. Dimensions avoid neighbors, deduplicate shared edges, stack in lanes.

---

## Phase 7: User Story 5 — Cased Openings Are Clearly Visible (Priority: P3)

**Goal**: Cased openings render with L-shaped casing marks proportional to wall thickness depth, clearly visible at standard zoom.

**Independent Test**: Render a 6ft cased opening between two rooms and confirm casing marks are clearly visible at normal zoom.

### Implementation for User Story 5

- [X] T033 [US5] Rewrite renderCasedOpening() in packages/render-svg/src/renderers/door-renderer.ts to draw L-shaped casing marks proportional to wall thickness depth instead of tick marks sized to wall thickness
- [X] T034 [US5] Visual verification: render multi-room.yaml to SVG/PNG, confirm L-shaped casing marks clearly visible on the 6ft cased opening between living room and kitchen

**Checkpoint**: US5 functional. Cased openings clearly distinguishable from intact wall segments.

---

## Phase 8: User Story 6 — Supply and Drain Lines Connect to Meaningful Endpoints (Priority: P3)

**Goal**: Supply/drain runs support fixture ID references as endpoints. Lines connect to resolved fixture positions instead of terminating in empty space or walls.

**Independent Test**: Define supply runs using fixture references (e.g., `from: bath-sink`) and confirm rendered lines connect to fixture positions.

### Implementation for User Story 6

- [X] T035 [US6] Extend SupplyRunConfig and DrainRunConfig with from and to fields (fixture ID string or wall reference object) in packages/core/src/types/config.ts
- [X] T036 [US6] Update config-parser to parse supply/drain from and to fields in packages/core/src/parser/config-parser.ts
- [X] T037 [US6] Implement fixture ID reference resolution for supply/drain run endpoints in packages/core/src/resolver/plumbing-resolver.ts using resolved fixture positions
- [X] T038 [US6] Update supply/drain sections of examples/multi-room.yaml with fixture ID references
- [X] T039 [US6] Add fixture reference resolution tests for supply/drain runs in packages/core/__tests__/plumbing-resolver.test.ts
- [X] T040 [US6] Visual verification: render multi-room.yaml to SVG/PNG, confirm supply lines originate at fixture positions and do not extend past room boundaries

**Checkpoint**: US6 functional. Supply/drain lines connect to fixtures. Paths stay within room bounds.

---

## Phase 9: Validation (Cross-Cutting — FR-016 through FR-021)

**Purpose**: Linter-style validation pass after layout resolution. Independent of rendering — invokable via CLI.

- [X] T041 Implement validatePlan() with all 5 checks (overlapping-openings, opening-exceeds-wall, sealed-room, fixture-out-of-bounds, run-through-wall) in packages/core/src/resolver/validation.ts (new file) per resolver-contracts.md
- [X] T042 Integrate validatePlan() call at end of resolveLayout() pipeline and attach ValidationResult to ResolvedPlan in packages/core/src/resolver/layout-resolver.ts
- [X] T043 [P] Create CLI validate command in packages/cli/src/commands/validate.ts and wire into CLI entry point
- [X] T044 [P] Create packages/core/__tests__/validation.test.ts with tests for all 5 error/warning conditions using deliberately invalid plans

**Checkpoint**: Validation pass catches all defined error/warning conditions. CLI `validate` command works independently.

---

## Phase 10: Polish & Visual Verification

**Purpose**: Final verification, snapshot regeneration, and end-to-end validation.

- [X] T045 Regenerate all visual regression snapshots in packages/render-svg/__tests__/visual-regression.test.ts
- [X] T046 Final visual verification: full render of examples/multi-room.yaml to SVG/PNG, check all items per CLAUDE.md visual verification checklist (electrical symbols, plumbing fixtures, layer visibility, wall-mounted elements, text overlaps, boundary clipping)
- [X] T047 Run quickstart.md validation workflow end-to-end (pnpm build → pnpm test → render → convert to PNG → validate command)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1 🎯 MVP)
                                                  │
                                    ┌─────────────┼─────────────┬──────────────┐
                                    ▼             ▼             ▼              ▼
                              Phase 4 (US2)  Phase 5 (US3)  Phase 6 (US4)  Phase 7 (US5)
                                              │
                                              ▼
                                        Phase 8 (US6)
                                              │
                          ┌───────────────────┘
                          ▼
                    Phase 9 (Validation) ← depends on all story phases
                          │
                          ▼
                    Phase 10 (Polish)
```

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — critical path to MVP
- **US2 (Phase 4)**: Depends on US1 (needs ownerRoomId on shared walls)
- **US3 (Phase 5)**: Depends on US1 (needs WallGraph for wall lookup)
- **US4 (Phase 6)**: Depends on US1 (needs WallGraph for neighbor detection)
- **US5 (Phase 7)**: Depends on US1 (needs shared wall rendering)
- **US6 (Phase 8)**: Depends on US3 (needs wall-relative fixture positions)
- **Validation (Phase 9)**: Depends on all story phases (validates full resolved plan)
- **Polish (Phase 10)**: Depends on all above

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational phase — no story dependencies
- **US2 (P1)**: Requires US1 complete (ownerRoomId and shared wall rendering)
- **US3 (P2)**: Requires US1 complete (WallGraph for wall-utils lookup)
- **US4 (P2)**: Requires US1 complete (WallGraph for neighbor detection)
- **US5 (P3)**: Requires US1 complete (shared wall rendering pipeline)
- **US6 (P3)**: Requires US3 complete (fixture reference resolution needs wall-relative fixtures)

### Within Each User Story

- Types/schemas before implementation
- Core resolver logic before rendering changes
- Implementation before tests (test files verify implementation)
- Tests before visual verification
- Visual verification as final gate

### Parallel Opportunities

- **Phase 1**: T001, T002, T003 can run in parallel (different files)
- **Phase 2**: T011 (config-parser tests) can run in parallel with T007–T010
- **Phase 3**: T012+T013 in parallel (different files); T015 in parallel with T012–T014; T017 in parallel with T016
- **Phases 4, 5, 6, 7**: US2, US3, US4, US5 can all proceed in parallel after US1 completes
- **Phase 5**: T026 (plumbing-renderer) in parallel with T025 (plumbing-resolver)

---

## Parallel Example: After US1 Completes

```bash
# These four phases can execute in parallel (different files, independent stories):
# Developer A: Phase 4 (US2) — door-renderer.ts
# Developer B: Phase 5 (US3) — plumbing-resolver.ts, plumbing-renderer.ts
# Developer C: Phase 6 (US4) — dimension-resolver.ts
# Developer D: Phase 7 (US5) — door-renderer.ts (cased opening only)

# Note: US2 and US5 both touch door-renderer.ts — if single developer,
# do them sequentially. Different functions, but same file.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (type foundations)
2. Complete Phase 2: Foundational (interior dimensions model)
3. Complete Phase 3: User Story 1 (shared walls + wall graph rendering)
4. **STOP and VALIDATE**: Render multi-room.yaml — shared walls correct, no gaps
5. This alone fixes the most visually broken aspect of the system

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Shared walls work → **MVP!**
3. Add US2 → Door swings correct → **P1 complete**
4. Add US3 + US4 (parallel) → Plumbing + dimensions improved → **P2 complete**
5. Add US5 + US6 → Cased openings + supply lines → **P3 complete**
6. Add Validation → Linter catches errors → **Feature complete**
7. Polish → Snapshots + final verification → **Ready to merge**

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after its phase completes
- Visual verification tasks require: `pnpm build && node packages/cli/dist/index.js render examples/multi-room.yaml -o examples/multi-room.svg && node scripts/svg-to-png.mjs examples/multi-room.svg examples/multi-room.png`
- All phases build on the interior-dimensions coordinate model (Phase 2) — this is the breaking change
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
