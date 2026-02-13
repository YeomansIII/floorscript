# Implementation Plan: Composite Rooms

**Branch**: `002-composite-rooms` | **Date**: 2026-02-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-composite-rooms/spec.md`

## Summary

Add support for non-rectangular rooms via **extensions** (outward bump-outs like window nooks), **enclosures** (inward carve-outs like closets), and **`from`/`offset` positioning** (human-natural opening placement). This extends the existing Parse → Resolve → Render pipeline with new Zod schemas for input validation, new resolver logic for composite geometry, and updated SVG rendering for composite room outlines.

## Technical Context

**Language/Version**: TypeScript 5.7.0, target ES2022, strict mode
**Primary Dependencies**: Zod (validation), yaml (parsing), tsup (bundler), Commander (CLI)
**Storage**: N/A (file-based I/O)
**Testing**: Vitest v3.0.0
**Target Platform**: Node.js (no DOM dependency)
**Project Type**: pnpm monorepo — 3 packages (`core` → `render-svg` → `cli`)
**Performance Goals**: N/A (batch file processing)
**Constraints**: Pure functions, no mutation. SVG generation without DOM/jsdom.
**Scale/Scope**: Extends existing `@floorscript/core` and `@floorscript/render-svg` packages. No new packages needed.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. LLM-First Design | **PASS** | Extensions/enclosures/from-offset syntax designed specifically for LLM generation from voice transcripts. Each feature works independently. Defaults produce reasonable output. Validation errors must be actionable per FR-027–FR-030 (field, reason, suggestion). |
| II. Text-Based and Diffable | **PASS** | Input remains YAML/JSON. Output remains SVG. Deterministic rendering preserved. |
| III. Architectural Correctness | **PASS** | Interior walls at enclosure boundaries use default 2x4 stud. Exterior walls on extensions use default 2x6 stud. Line weights follow existing conventions. |
| IV. Pure Pipeline Architecture | **PASS** | Changes follow Parse → Resolve → Render separation. New Zod schemas in Parse. New resolvers in Resolve. Updated renderers in Render. No stage crossing. |
| V. Visual Verification | **PASS** | Plan includes visual verification steps. Example YAML with composite rooms will be created and rendered for inspection. |
| VI. Strict Type Safety | **PASS** | New config types defined as Zod schemas with inferred TypeScript types via `z.infer<typeof Schema>`. No `any` types. No duplicate manual interfaces — types MUST be derived from schemas. |
| Monorepo Structure | **PASS** | No new packages. Extends `core` (types + resolvers) and `render-svg` (renderers). |
| Naming Conventions | **PASS** | New files: `enclosure-resolver.ts`, `extension-resolver.ts`, `composite-outline.ts` (kebab-case). New types: `EnclosureConfig`, `ExtensionConfig`, `CompositeOutline` (PascalCase). |

**All gates pass. No violations to justify.**

## Project Structure

### Documentation (this feature)

```text
specs/002-composite-rooms/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Phase 1 data model changes
├── quickstart.md        # Phase 1 developer quickstart
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
packages/core/src/
├── types/
│   ├── config.ts              # MODIFY: Add EnclosureConfig, ExtensionConfig, from/offset on OpeningConfig
│   └── geometry.ts            # MODIFY: Add CompositeOutline on ResolvedRoom, ResolvedEnclosure, ResolvedExtension
├── parser/
│   └── config-parser.ts       # NO CHANGE (uses FloorPlanConfigSchema which auto-includes new schemas)
├── resolver/
│   ├── layout-resolver.ts     # MODIFY: Call enclosure/extension resolvers during resolveRoom()
│   ├── wall-resolver.ts       # MODIFY: Handle shortened walls from enclosures, wall gaps from extensions
│   ├── opening-resolver.ts    # MODIFY: Add from/offset position resolution
│   ├── enclosure-resolver.ts  # NEW: Resolve enclosure bounds, interior walls, facing inference
│   ├── extension-resolver.ts  # NEW: Resolve extension bounds, exterior walls, parent wall gaps
│   ├── composite-outline.ts   # NEW: Compute rectilinear polygon union for composite room shape
│   ├── dimension-resolver.ts  # MODIFY: Trace composite outline edges instead of simple rectangle
│   ├── shared-wall-resolver.ts # MODIFY: Verify shared wall detection works with composite rooms (extensions/enclosures as standard ResolvedRoom objects); add integration tests
│   ├── validation.ts           # MODIFY: Add cross-cutting validation rules (opening-in-extension-gap, adjacent room wall conflicts, ID uniqueness)
│   └── segment-resolver.ts    # NO CHANGE
└── index.ts                   # MODIFY: Export new types

packages/render-svg/src/
├── render-svg.ts              # MODIFY: Pass composite outlines to wall renderer
├── renderers/
│   ├── wall-renderer.ts       # MODIFY: Render composite outlines as closed paths (enclosure interior walls)
│   ├── label-renderer.ts      # MINOR: labelPosition already pre-computed by resolver
│   ├── dimension-renderer.ts  # NO CHANGE (consumes pre-computed dimension data)
│   └── [other renderers]      # NO CHANGE
└── [other files]              # NO CHANGE

packages/core/__tests__/
├── config-parser.test.ts      # MODIFY: Add tests for new schema fields
├── layout-resolver.test.ts    # MODIFY: Add integration tests for rooms with extensions/enclosures
├── enclosure-resolver.test.ts # NEW: Unit tests for enclosure resolution
├── extension-resolver.test.ts # NEW: Unit tests for extension resolution
├── composite-outline.test.ts  # NEW: Unit tests for polygon union computation
└── from-offset.test.ts        # NEW: Unit tests for from/offset opening placement

packages/render-svg/__tests__/
├── integration.test.ts        # MODIFY: Add SVG rendering tests for composite rooms
└── visual-regression.test.ts  # MODIFY: Add snapshot tests for composite room examples

examples/
├── bedroom-closet.yaml        # NEW: Bedroom with corner closet (enclosure)
└── bedroom-nook.yaml          # NEW: Bedroom with window nook (extension) and closet (enclosure)
```

**Structure Decision**: All changes extend the existing monorepo packages. No new packages. New resolver files follow the established pattern in `packages/core/src/resolver/`. New test files follow the existing `packages/core/__tests__/` pattern.

## Complexity Tracking

No constitution violations. Table not applicable.
