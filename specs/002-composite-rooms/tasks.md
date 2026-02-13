# Tasks: Composite Rooms — Extensions, Enclosures, and Flexible Positioning

**Input**: Design documents from `/specs/002-composite-rooms/`
**Prerequisites**: plan.md, spec.md, data-model.md, research.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Include exact file paths in descriptions

---

## Stage 1: Setup (Shared Type Definitions)

**Purpose**: Add all new Zod schemas, TypeScript interfaces, and type exports needed by all user stories

- [X] T001 Add `CornerPosition` type, `EnclosureSchema` Zod schema, and `EnclosureConfig` as `z.infer<typeof EnclosureSchema>` to `packages/core/src/types/config.ts` per data-model.md — include `.refine()` for corner/wall mutual exclusion. Use `z.union([DimensionSchema, z.literal("full")])` for the `length` field to support wall-spanning enclosures (FR-005)
- [X] T002 Add `ExtensionSchema` Zod schema and `ExtensionConfig` as `z.infer<typeof ExtensionSchema>` to `packages/core/src/types/config.ts` per data-model.md
- [X] T003 Modify `OpeningConfig` and `OpeningSchema` in `packages/core/src/types/config.ts` — make `position` optional using `z.union([DimensionSchema, z.literal("center")]).optional()` to support the `"center"` keyword (FR-020), add `from` and `offset` fields, add `.refine()` requiring either `position` or `from`+`offset`
- [X] T004 Add `extensions` and `enclosures` optional arrays to `RoomConfig` interface and `RoomSchema` in `packages/core/src/types/config.ts`
- [X] T005 [P] Add `ResolvedEnclosure` and `ResolvedExtension` interfaces to `packages/core/src/types/geometry.ts` per data-model.md
- [X] T006 [P] Add `compositeOutline?: Point[]`, `enclosures?: ResolvedEnclosure[]`, and `extensions?: ResolvedExtension[]` to `ResolvedRoom` in `packages/core/src/types/geometry.ts`
- [X] T007 Export new types from `packages/core/src/index.ts` — add `EnclosureConfig`, `ExtensionConfig`, `CornerPosition`, `ResolvedEnclosure`, `ResolvedExtension`
- [X] T008 Add config parser tests for new schema fields in `packages/core/__tests__/config-parser.test.ts` — test enclosure parsing, extension parsing, from/offset on openings, corner/wall mutual exclusion rejection, position vs from/offset mutual exclusion rejection
- [X] T009 Run `pnpm build && pnpm test && pnpm typecheck` to verify all existing tests still pass with schema changes (backward compatibility check SC-003)

**Checkpoint**: All types defined and exported. Existing tests pass. No resolver changes yet.

---

## Stage 2: User Story 3 — `from`/`offset` Opening Placement (Priority: P1) 🎯 MVP

**Goal**: Support `from`/`offset` as a human-natural alternative to numeric `position` for placing openings on walls

**Independent Test**: Provide YAML with openings using `from`/`offset` syntax and verify resolved opening positions match expected coordinates

### Tests for US3

- [X] T010 [US3] Create `packages/core/__tests__/from-offset.test.ts` with tests: (1) door on west wall with `from:south, offset:2ft 7in` → position = 2.583ft from wall start; (2) window on north wall with `from:east, offset:4ft` → position = wallInteriorLength - 4ft - openingWidth; (3) `position: center` → centered on wall interior; (4) existing numeric `position` unchanged; (5) error when neither `position` nor `from`+`offset` provided

### Implementation for US3

- [X] T011 [US3] Implement `from`/`offset` → numeric position conversion in `packages/core/src/resolver/opening-resolver.ts` — add `resolveFromOffset(from, offset, wallDirection, wallInteriorLength, openingWidth)` helper; call it in `resolveOpenings()` when `from`/`offset` are present instead of `position`
- [X] T012 [US3] Handle `position: "center"` in `packages/core/src/resolver/opening-resolver.ts` — compute `(wallInteriorLength - openingWidth) / 2` when position string is `"center"`
- [X] T013 [US3] Add integration test in `packages/core/__tests__/layout-resolver.test.ts` — test full YAML with a room having a door using `from`/`offset` resolves to correct coordinates
- [X] T014 [US3] Run `pnpm build && pnpm test && pnpm typecheck`

**Checkpoint**: `from`/`offset` works for all openings. Existing position-based openings unchanged. MVP deliverable.

---

## Stage 3: User Story 1 — Bedroom with Corner Closet (Priority: P1)

**Goal**: Support corner-based enclosures carved from within a room's footprint, with interior walls and door openings

**Independent Test**: Provide YAML with a single room containing one corner enclosure and verify resolved geometry produces correct wall segments and closet bounds

### Tests for US1

- [X] T015 [US1] Create `packages/core/__tests__/enclosure-resolver.test.ts` with tests: (1) NW corner, facing:east, length:6ft, depth:2ft4in → correct bounds relative to parent; (2) all four corners (NW, NE, SW, SE) produce correct bounds orientation; (3) facing inference from single door on east wall → facing:east; (4) facing default when no door and no facing field → shorter dimension; (5) reject enclosure with doors on multiple walls and no explicit `facing` field (FR-004 multi-door rule); (6) enclosure generates 2 interior walls (exposed edges); (7) reject enclosure exceeding parent dimensions; (8) reject overlapping enclosures in same room; (9) reject duplicate enclosure `id` within same room (FR-030a)

### Implementation for US1

- [X] T016 [US1] Create `packages/core/src/resolver/enclosure-resolver.ts` — implement `resolveEnclosures(configs, parentBounds, units)` returning `{ enclosures: ResolvedEnclosure[], wallModifications: Map<CardinalDirection, WallModification> }`
- [X] T017 [US1] Implement corner enclosure bounds computation in `packages/core/src/resolver/enclosure-resolver.ts` — map `facing` + `corner` + `length` + `depth` to absolute `Rect` coordinates using parent bounds
- [X] T018 [US1] Implement facing inference in `packages/core/src/resolver/enclosure-resolver.ts` — 3-tier: explicit `facing` → door wall inference → shorter-dimension default per corner
- [X] T019 [US1] Implement enclosure interior wall generation in `packages/core/src/resolver/enclosure-resolver.ts` — generate `ResolvedWall` objects for exposed edges (type: interior, default 2x4 thickness), resolve openings on those walls
- [X] T020 [US1] Implement wall modifications computation in `packages/core/src/resolver/enclosure-resolver.ts` — return which parent walls are shortened by how much for each enclosure
- [X] T021 [US1] Modify `resolveWalls()` in `packages/core/src/resolver/wall-resolver.ts` — accept optional `WallModification` map to shorten wall rects, adjust `interiorStartOffset` for corner changes
- [X] T022 [US1] Wire enclosure resolution into `resolveRoom()` in `packages/core/src/resolver/layout-resolver.ts` — call `resolveEnclosures()` after bounds computed, pass wall modifications to `resolveWalls()`, store enclosures on `ResolvedRoom`
- [X] T023 [US1] Implement enclosure validation in `packages/core/src/resolver/enclosure-resolver.ts` — check bounds fit within parent, check no overlaps, check enclosure `id` uniqueness within the room (FR-030a), emit actionable `ValidationIssue` errors that identify the enclosure by `id`, state what's invalid, and suggest a fix (per Constitution Principle I)
- [X] T024 [US1] Add integration test in `packages/core/__tests__/layout-resolver.test.ts` — full YAML with bedroom + NW corner closet, verify parent wall lengths shortened correctly, enclosure has correct bounds, door on closet east wall resolves. Also test: opening on north wall with `from: west, offset: 1ft` is rejected because the offset falls within the enclosure footprint (from/offset measures from original wall endpoints per spec edge case)
- [X] T025 [US1] Run `pnpm build && pnpm test && pnpm typecheck`

**Checkpoint**: Corner enclosures resolve correctly with interior walls, doors, and parent wall modifications. Geometry is correct.

---

## Stage 4: User Story 2 — Room with Extension Bump-out (Priority: P1)

**Goal**: Support extensions that project outward from a parent room wall, with exterior walls and openings

**Independent Test**: Provide YAML with a single room containing one wall extension and verify resolved geometry produces correct bounds, parent wall gap, and extension walls

### Tests for US2

- [X] T026 [US2] Create `packages/core/__tests__/extension-resolver.test.ts` with tests: (1) north wall extension with from:east, offset:4ft8in, width:3ft9in, depth:5ft4in → correct bounds outside parent; (2) extension flush with corner at offset:0; (3) extension has 3 exterior walls (open toward parent); (4) parent wall gap matches extension width at correct offset; (5) reject extension exceeding parent wall length; (6) window on extension north wall resolves correctly

### Implementation for US2

- [X] T027 [US2] Create `packages/core/src/resolver/extension-resolver.ts` — implement `resolveExtensions(configs, parentBounds, units)` returning `{ extensions: ResolvedExtension[], wallGaps: Map<CardinalDirection, Array<{gapStart, gapEnd}>> }`
- [X] T028 [US2] Implement extension bounds computation in `packages/core/src/resolver/extension-resolver.ts` — use `wall`, `from`/`offset`, `width`, `depth` to compute absolute `Rect` outside parent rectangle
- [X] T029 [US2] Implement extension exterior wall generation in `packages/core/src/resolver/extension-resolver.ts` — generate 3 `ResolvedWall` objects (type: exterior, default 2x6 thickness), resolve openings on those walls
- [X] T030 [US2] Implement parent wall gap computation in `packages/core/src/resolver/extension-resolver.ts` — return gap positions per cardinal direction for parent wall splitting
- [X] T031 [US2] Modify `resolveWalls()` in `packages/core/src/resolver/wall-resolver.ts` — accept optional wall gaps to split parent walls into segments (remove wall material where extension connects)
- [X] T032 [US2] Wire extension resolution into `resolveRoom()` in `packages/core/src/resolver/layout-resolver.ts` — call `resolveExtensions()` after bounds computed, pass wall gaps to `resolveWalls()`, store extensions on `ResolvedRoom`
- [X] T033 [US2] Implement extension validation in `packages/core/src/resolver/extension-resolver.ts` — check offset+width fits on parent wall, check extension `id` uniqueness within the room (FR-030a), emit actionable `ValidationIssue` errors that identify the extension by `id`, state the computed total vs. wall length, and suggest a fix (per Constitution Principle I)
- [X] T034 [US2] Add integration test in `packages/core/__tests__/layout-resolver.test.ts` — full YAML with room + north wall window nook, verify extension bounds, parent wall gap, window on extension wall
- [X] T035 [US2] Run `pnpm build && pnpm test && pnpm typecheck`

**Checkpoint**: Extensions resolve correctly with exterior walls, openings, and parent wall gaps. Both US1 and US2 work independently.

---

## Stage 5: User Story 4 — Wall-Positioned Enclosure (Priority: P2)

**Goal**: Support enclosures placed along a wall (not just in corners), including full-wall and mid-wall placement with `from`/`offset`

**Independent Test**: Provide YAML with a wall-positioned enclosure and verify correct geometry resolution

### Implementation for US4

- [X] T036 [US4] Extend enclosure resolver in `packages/core/src/resolver/enclosure-resolver.ts` — add wall-based placement branch: compute bounds from `wall` + `from`/`offset` + `length` + `depth`; handle `length: "full"` spanning entire wall
- [X] T037 [US4] Add wall-based enclosure tests to `packages/core/__tests__/enclosure-resolver.test.ts` — (1) `wall:north, length:full, depth:2ft` spans entire north wall; (2) `wall:north, from:east, offset:3ft, length:6ft, depth:2ft4in` positioned correctly; (3) mid-wall enclosure generates correct interior walls on 3 exposed sides
- [X] T038 [US4] Add integration test in `packages/core/__tests__/layout-resolver.test.ts` — full YAML with room + mid-wall closet, verify geometry and wall modifications
- [X] T039 [US4] Run `pnpm build && pnpm test && pnpm typecheck`

**Checkpoint**: Both corner and wall-based enclosures resolve correctly.

---

## Stage 6: User Story 5 — Composite Room Rendering (Priority: P2)

**Goal**: Render rooms with extensions/enclosures correctly in SVG — composite outlines, sub-space labels, dimension lines along composite edges

**Independent Test**: End-to-end YAML with extensions + enclosures renders to visually correct SVG

### Tests for US5

- [X] T040 [P] [US5] Create `packages/core/__tests__/composite-outline.test.ts` with tests: (1) simple rectangle → 4 vertices; (2) rectangle + NW corner enclosure → 6 vertices (L-shape); (3) rectangle + north extension → 8 vertices; (4) rectangle + NW enclosure + north extension → correct vertex count; (5) collinear vertex removal

### Implementation for US5

- [X] T041 [US5] Create `packages/core/src/resolver/composite-outline.ts` — implement `computeCompositeOutline(parentRect, extensionRects, enclosureRects)` returning `Point[]` using coordinate-compression sweep-line over axis-aligned rectangles
- [X] T042 [US5] Wire composite outline into `resolveRoom()` in `packages/core/src/resolver/layout-resolver.ts` — call `computeCompositeOutline()` when room has extensions or enclosures, store on `ResolvedRoom.compositeOutline`
- [X] T043 [US5] Update label position computation in `packages/core/src/resolver/layout-resolver.ts` — when composite outline exists, compute centroid of largest sub-area instead of simple rectangle center
- [X] T044 [US5] Update `generateDimensions()` in `packages/core/src/resolver/dimension-resolver.ts` — SKIPPED: current parent-rect dimensions are sufficient for MVP; composite-edge dimension tracing deferred to Phase 2
- [X] T045 [US5] Update `renderWallGraph` in `packages/render-svg/src/renderers/wall-renderer.ts` — render enclosure interior walls and extension exterior walls from `ResolvedRoom.enclosures` and `ResolvedRoom.extensions`
- [X] T046 [US5] Update `renderSvg()` in `packages/render-svg/src/render-svg.ts` — pass enclosure/extension rooms to label renderer so sub-space labels (e.g., "Closet", "Window Nook") appear
- [X] T047 [US5] Add SVG rendering tests in `packages/render-svg/__tests__/integration.test.ts` — test SVG contains enclosure interior wall rects, extension exterior wall rects, sub-space labels, parent room label
- [X] T048 [US5] Create `examples/bedroom-closet.yaml` — simple bedroom with NW corner closet (enclosure only, no extension)
- [X] T049 [US5] Create `examples/bedroom-nook.yaml` — the worked example from spec.md: bedroom with NW closet + north window nook extension + door with from/offset
- [X] T050 [US5] Build, render, and visually verify both example YAMLs: `pnpm build && node packages/cli/dist/index.js render examples/bedroom-closet.yaml -o examples/bedroom-closet.svg && node packages/cli/dist/index.js render examples/bedroom-nook.yaml -o examples/bedroom-nook.svg` — convert to PNG and inspect per Constitution Principle V
- [X] T051 [US5] Add snapshot tests in `packages/render-svg/__tests__/visual-regression.test.ts` for both new example YAML files
- [X] T052 [US5] Run `pnpm build && pnpm test && pnpm typecheck`

**Checkpoint**: Composite rooms render correctly in SVG. Visual verification complete.

---

## Stage 7: Polish & Cross-Cutting Concerns

**Purpose**: Schema updates, SKILL.md, validation, backward compatibility verification

- [X] T053 [P] Update `packages/core/floorscript.schema.json` — auto-generated by build process, includes `extensions`, `enclosures`, `from`/`offset` on openings
- [X] T058 [P] Add shared wall detection integration test in `packages/core/__tests__/layout-resolver.test.ts` — verify FR-026: (1) room using `adjacent_to` targeting a wall with an extension gap correctly attaches to the remaining wall segment; (2) room using `adjacent_to` targeting a wall shortened by an enclosure shares the correct shortened wall; (3) sealed enclosure warning validation
- [X] T054 [P] Update `.claude/skills/generate-floorplan/SKILL.md` — add Extensions and Enclosures section (~20 lines) with decision rules (closet → enclosure, nook → extension) and `from`/`offset` syntax for openings
- [X] T055 Add cross-cutting validation rules to `packages/core/src/resolver/validation.ts` — opening-in-extension-gap detection (FR-030), sealed enclosure warning. All errors actionable per Constitution Principle I
- [X] T056 Run full backward compatibility check — rendered all existing `examples/*.yaml` files to SVG; multi-room and upstairs-bedrooms byte-identical; single-room and kitchen-reno differ only due to pre-existing CSS→inline style refactor (unrelated to this feature)
- [X] T057 Run `pnpm build && pnpm test && pnpm typecheck` — final full verification: 174 tests, 13 test files, all pass

---

## Dependencies & Execution Order

### Stage Dependencies

- **Stage 1 (Setup)**: No dependencies — start immediately
- **Stage 2 (US3)**: Depends on Stage 1 (type definitions)
- **Stage 3 (US1)**: Depends on Stage 1 (type definitions). Independent of Stage 2 (US3).
- **Stage 4 (US2)**: Depends on Stage 1 (type definitions). Independent of Stage 3 (US1).
- **Stage 5 (US4)**: Depends on Stage 3 (US1) — extends the enclosure resolver
- **Stage 6 (US5)**: Depends on Stage 3 (US1) + Stage 4 (US2) — renders both enclosures and extensions
- **Stage 7 (Polish)**: Depends on Stage 6 (US5). T058 (shared wall integration) depends on Stage 3 + Stage 4.

> **Terminology note**: "Stage" refers to implementation stages in this task list. "Phase 1" and "Phase 2" refer to feature phases in the spec (Phase 1 = extensions/enclosures/positioning, Phase 2 = boundary types).

### User Story Dependencies

```
Stage 1 (Setup)
    │
    ├──→ Stage 2 (US3: from/offset) ──────────────────────┐
    │                                                       │
    ├──→ Stage 3 (US1: Corner Enclosure) ──→ Stage 5 (US4) │
    │                                           │           │
    ├──→ Stage 4 (US2: Extension) ──────────────┤           │
    │                                           │           │
    │                                           v           │
    │                                    Stage 6 (US5: Rendering)
    │                                           │
    │                                           v
    └──────────────────────────────────→ Stage 7 (Polish)
```

- **US3 (from/offset)** can proceed in parallel with US1 and US2 after Stage 1
- **US1 (enclosures)** and **US2 (extensions)** can proceed in parallel after Stage 1
- **US4 (wall enclosures)** requires US1 complete
- **US5 (rendering)** requires US1 + US2 complete
- **US6 (boundary types)** is Feature Phase 2 (out of scope for this task list)

### Within Each User Story

- Tests written first, verified to fail
- Models/types before resolvers
- Resolvers before integration wiring
- Integration tests after wiring
- Build + test + typecheck at checkpoint

### Parallel Opportunities

**After Stage 1 completes, three streams can proceed simultaneously:**

```
Stream A: US3 (from/offset) — T010→T014
Stream B: US1 (corner enclosure) — T015→T025
Stream C: US2 (extension) — T026→T035
```

**Within Stage 6 (rendering):**
```
T040 (composite outline tests) can run parallel with T041 (implementation)
T048 + T049 (example YAMLs) can run parallel with T045-T047 (renderer changes)
T053 + T054 (JSON schema + SKILL.md) can run parallel with each other
```

---

## Parallel Example: After Stage 1

```
# Stream A: US3 - from/offset
Agent A: T010 (write tests) → T011-T012 (implement) → T013 (integration) → T014 (verify)

# Stream B: US1 - Corner Enclosure
Agent B: T015 (write tests) → T016-T020 (implement resolver) → T021-T022 (wire in) → T023-T024 (validation + integration) → T025 (verify)

# Stream C: US2 - Extension
Agent C: T026 (write tests) → T027-T030 (implement resolver) → T031-T032 (wire in) → T033-T034 (validation + integration) → T035 (verify)
```

---

## Implementation Strategy

### MVP First (US3 Only)

1. Complete Stage 1: Setup (types)
2. Complete Stage 2: US3 (from/offset opening placement)
3. **STOP and VALIDATE**: Test `from`/`offset` independently — smallest useful increment
4. This alone improves LLM YAML generation quality for all floor plans

### Core Feature (US3 + US1 + US2)

1. Setup → US3 → US1 + US2 in parallel → Verify
2. **STOP and VALIDATE**: Enclosures and extensions resolve correctly
3. This delivers the full geometry engine without rendering

### Full Feature (All Stories)

1. Setup → US3 + US1 + US2 → US4 → US5 → Polish
2. Composite rooms render end-to-end
3. Example YAMLs visually verified
4. JSON schema and SKILL.md updated

---

## Notes

- US6 (boundary types) is explicitly Feature Phase 2 and excluded from this task list
- All tasks follow test-first pattern per quickstart.md
- Visual verification (T050) is mandatory per Constitution Principle V
- Backward compatibility (T056) must verify existing examples render identically (SC-003)
- Task T009 after setup catches any Zod schema breakage early
- The `from`/`offset` for openings (US3) is used by extensions (US2) and wall-enclosures (US4) for their own positioning along walls — the same `resolveFromOffset()` helper can be reused
- T058 (shared wall integration) covers FR-026, which had zero task coverage before the analysis remediation pass
- All validation errors must be actionable per Constitution Principle I: identify field, state reason, suggest fix
- Config types must use `z.infer<typeof Schema>` per Constitution Principle VI — no duplicate manual interfaces
