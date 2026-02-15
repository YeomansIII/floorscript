# 003-unified-wall-graph Validation Report

**Date:** 2026-02-14
**Branch:** main (commit `09490db`)
**Validator:** Claude Opus 4.6

---

## Executive Summary

The 003-unified-wall-graph feature implementation is **complete and correct**. All 55 tasks are done, all 189 tests pass, TypeScript strict-mode compiles cleanly across all 3 packages, and no spec violations were found. The implementation faithfully delivers all 6 user stories across 9 phases.

| Check                        | Result |
|------------------------------|--------|
| `pnpm test` (189 tests)     | PASS   |
| `pnpm typecheck` (3 pkgs)   | PASS   |
| Deprecated type references   | 0      |
| Spec compliance (FR-001–015) | 15/15  |
| Success criteria (SC-001–008)| 8/8    |

---

## 1. Spec Compliance Matrix

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| FR-001 | Single `Wall` type replaces `ResolvedWall`/`PlanWall` | PASS | `grep ResolvedWall\|PlanWall packages/` returns 0 matches |
| FR-002 | Unified `WallGraph` contains all walls | PASS | `buildWallGraph()` accepts parent, enclosure, and extension walls; returns unified graph |
| FR-003 | Single rendering pass | PASS | `render-svg.ts:77-95` — one loop over `plan.wallGraph.walls`; no fallback paths |
| FR-004 | `findWallById()` works for all sources | PASS | `wall-utils.ts:48-64` tries `byRoom` then `bySubSpace` |
| FR-005 | `computeBounds()` includes extension walls | PASS | `layout-resolver.ts:57` — `computeBounds(wallGraph.walls)` |
| FR-006 | Perimeter edges derived from unified graph | PASS | `perimeter-resolver.ts:18-92` |
| FR-007 | Enclosure walls excluded from perimeter | PASS | Filter: `source !== "enclosure"` at line 23 |
| FR-008 | Extension walls included in perimeter; CCW winding | PASS | Extensions pass filter; CCW ensured at lines 34-59 |
| FR-009 | `byRoom` and `bySubSpace` indexes on WallGraph | PASS | `shared-wall-resolver.ts:133,468-476` |
| FR-010 | Validation covers all wall sources | PASS | `validation.ts` iterates `plan.wallGraph.walls` and queries `bySubSpace` |
| FR-011 | YAML/JSON config format unchanged | PASS | No changes to `config.ts` Zod schemas |
| FR-012 | SVG output visually identical | PASS | Visual regression tests (10 tests) pass |
| FR-013 | Shared-wall detection preserved | PASS | `shared-wall-resolver.ts:176-227` |
| FR-014 | `shared_walls` config override preserved | PASS | Override logic intact; regression test in shared-wall-resolver.test.ts |
| FR-015 | `.walls` removed from Room/Enclosure/Extension | PASS | `ResolvedRoom` has no `walls` field; only `wallGraph` holds walls |

---

## 2. Implementation Audit

### 2.1 Core Types (`packages/core/src/types/geometry.ts`)

- **Wall interface** (lines 109-136): 18 fields correctly defined including ownership metadata (`roomId`, `roomIdB`, `directionInB`, `subSpaceId`, `source`, `shared`)
- **WallSource** union: `"parent" | "enclosure" | "extension"`
- **WallGraph** (lines 154-159): `walls`, `byRoom`, `bySubSpace`, `perimeter`
- **PerimeterEdge/PerimeterChain**: Properly defined for building outline
- **ResolvedRoom** (lines 73-81): No `.walls` field — correct
- **ResolvedWall/PlanWall aliases**: Fully removed — `grep` confirms 0 references in `packages/`

### 2.2 Resolvers

| File | Status | Notes |
|------|--------|-------|
| `layout-resolver.ts` | PASS | Orchestrator correctly wires all pieces: `resolveRoom()` returns separate wall arrays; `buildWallGraph()` called with 6 params; `computePerimeter()` populates perimeter; `computeBounds()` uses `wallGraph.walls`; `wallGraph` passed to `resolveElectrical()` and `resolvePlumbing()` |
| `wall-resolver.ts` | PASS | `resolveWalls()` returns `Wall[]` with `source: "parent"`, `shared: false`, correct `roomId` |
| `shared-wall-resolver.ts` | PASS | `buildWallGraph()` signature correct; 4-stage algorithm (detect→remainder→non-shared→gap-fill) intact; enclosure/extension walls appended; `bySubSpace` index built |
| `opening-resolver.ts` | PASS | Works with `Wall` type; `ownerRoomId` set on resolved openings; `interiorStartOffset` used correctly |
| `segment-resolver.ts` | PASS | Works with `Wall` type; splits horizontal/vertical walls correctly |
| `enclosure-resolver.ts` | PASS | Returns `{ enclosures, walls, wallModifications }`; walls have `source: "enclosure"`, correct `subSpaceId` and `roomId` |
| `extension-resolver.ts` | PASS | Returns `{ extensions, walls, wallGaps }`; walls have `source: "extension"`, correct `subSpaceId`, `roomId`, and `interiorStartOffset` |
| `perimeter-resolver.ts` | PASS | Filters `source !== "enclosure" && !shared`; CCW winding; collinear simplification; returns `PerimeterChain[]` |
| `validation.ts` | PASS | All validators iterate unified graph; `checkSealedEnclosures/Extensions` use `bySubSpace`; `checkRunsThroughWalls` covers all walls |
| `electrical-resolver.ts` | PASS | Optional `wallGraph` parameter; delegates to `findWallById()` |
| `plumbing-resolver.ts` | PASS | Optional `wallGraph` parameter; delegates to `findWallById()` |
| `wall-utils.ts` | PASS | `findWallById()` checks `byRoom` first, then `bySubSpace` |
| `dimension-resolver.ts` | PASS | `_wallGraph` param reserved for future use |
| `composite-outline.ts` | PASS | Independent from wall graph (bounds-only); coexists correctly |

### 2.3 Rendering (`packages/render-svg/`)

| File | Status | Notes |
|------|--------|-------|
| `render-svg.ts` | PASS | Single pass: `renderWallGraph(plan.wallGraph, ...)` at line 80; openings rendered from `plan.wallGraph.walls` iteration (lines 84-94); no separate enclosure/extension paths; labels rendered from room metadata (not wall data) |
| `wall-renderer.ts` | PASS | Imports `Wall`/`WallGraph` (not old types); `renderWallGraph()` iterates `wallGraph.walls`; single `renderWall()` function |
| Other renderers | PASS | door/window/electrical/plumbing/dimension/label/title-block renderers are type-compatible |
| `index.ts` | PASS | Exports `renderSvg` and `SvgRenderOptions` |

---

## 3. Test Coverage

### 3.1 Test Suite Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| config-parser.test.ts | 21 | PASS |
| dimension.test.ts | 17 | PASS |
| layout-resolver.test.ts | 21 | PASS |
| shared-wall-resolver.test.ts | 18 | PASS |
| from-offset.test.ts | 9 | PASS |
| validation.test.ts | 16 | PASS |
| enclosure-resolver.test.ts | 15 | PASS |
| extension-resolver.test.ts | 9 | PASS |
| electrical-resolver.test.ts | 17 | PASS |
| plumbing-resolver.test.ts | 15 | PASS |
| composite-outline.test.ts | 7 | PASS |
| perimeter-resolver.test.ts | 4 | PASS |
| integration.test.ts | 10 | PASS |
| visual-regression.test.ts | 10 | PASS |
| **Total** | **189** | **PASS** |

### 3.2 API Migration Verification

- All tests access walls via `plan.wallGraph.byRoom` / `plan.wallGraph.bySubSpace` — not `room.walls`
- The only `room.walls` references are in `config-parser.test.ts`, correctly testing **input config** (RoomConfig), not resolved output
- `findWallById()` tested for parent rooms, enclosure sub-spaces, and extension sub-spaces
- Shared wall `ownerRoomId` merge behavior verified

### 3.3 Feature Coverage

| Feature | Test Coverage |
|---------|--------------|
| wallGraph.byRoom index | 30+ assertions across 5 files |
| wallGraph.bySubSpace index | 8+ assertions across 3 files |
| wallGraph.perimeter | 4 dedicated tests |
| findWallById (parent) | 4 tests |
| findWallById (enclosure) | 1 test |
| findWallById (extension) | 1 test |
| Shared wall merging | 6 tests |
| Opening ownerRoomId | 2 assertions |
| Bounds includes extensions | 1 dedicated test |
| Sealed enclosure warning | 1 test |
| Sealed extension warning | 1 test |
| Overlapping openings on enclosure wall | 1 test |
| Run through enclosure wall | 1 test |
| SVG visual regression | 10 tests |

---

## 4. Issues Found

### 4.1 Bugs: None

No functional bugs were identified. All code paths work correctly and match the spec.

### 4.2 Minor Code Quality Items

| # | Severity | File | Line | Description |
|---|----------|------|------|-------------|
| 1 | Low | `shared-wall-resolver.ts` | 107 | Dead code: `_oppositeDirection()` helper is defined but never called. The underscore prefix suppresses lint warnings. |
| 2 | Low | `dimension-resolver.ts` | 24 | Unused parameter: `_wallGraph?: WallGraph` is a reserved placeholder for future smart-dimension features. Intentional per spec. |
| 3 | Info | MEMORY.md | 9 | Stale note: States "aliases still present" but `ResolvedWall`/`PlanWall` aliases were correctly removed in Phase 4 (US2). The memory note should be updated. |

### 4.3 Test Coverage Gaps (Non-Critical)

| # | Area | Description |
|---|------|-------------|
| 1 | Perimeter | Only 4 tests — covers single room, multi-room, extension, enclosure exclusion. Could benefit from stress tests with complex multi-extension layouts. |
| 2 | Error paths | `findWallById()` error cases tested for invalid format, invalid direction, and unknown room — but no test for a sub-space wall with an invalid direction. |
| 3 | Edge case | No test for an extension and enclosure on the same wall of the same room simultaneously. Logic appears correct by inspection but not explicitly tested. |

---

## 5. Architecture Assessment

The 003 implementation delivers a clean architectural improvement:

1. **Type unification**: 2 types → 1 type eliminates 11 duplicated fields and removes dual-type confusion
2. **Single source of truth**: All walls in one graph with efficient indexed lookups
3. **Single rendering pass**: 3 render functions → 1, simpler and faster
4. **Extensibility**: `bySubSpace` index and `findWallById()` sub-space support enable placing electrical/plumbing on enclosure/extension walls
5. **Perimeter edges**: Foundation for future 004-smart-dimensions feature
6. **Bounds fix**: Extension walls now properly included in plan bounds (no more SVG clipping)

The implementation is conservative and well-scoped — purely internal refactoring with no config format changes and pixel-identical output.

---

## 6. Recommendation

**Ready for production.** No blocking issues. The three minor items in section 4.2 are cosmetic and can be addressed at leisure.
