<!--
Sync Impact Report
===================
Version change: N/A → 1.0.0 (initial ratification)
Modified principles: N/A (initial)
Added sections:
  - Core Principles (6 principles)
  - Technology Constraints
  - Development Workflow
  - Governance
Removed sections: N/A
Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ aligned (Constitution Check
    section references constitution file generically)
  - .specify/templates/spec-template.md — ✅ aligned (requirements and
    success criteria sections are technology-agnostic)
  - .specify/templates/tasks-template.md — ✅ aligned (phase structure
    supports visual verification and test-then-implement workflow)
  - .specify/templates/checklist-template.md — ✅ aligned (generic template)
  - .specify/templates/agent-file-template.md — ✅ aligned (no
    agent-specific references)
Follow-up TODOs: None
-->

# FloorScript Constitution

## Core Principles

### I. LLM-First Design

Every API surface, configuration schema, and default value MUST
prioritize consumption by LLM AI agents. Concretely:

- Input schemas MUST be simple enough that a general-purpose LLM can
  generate valid configuration without specialized training.
- Defaults MUST produce architecturally reasonable output — users
  correct details, not build from scratch.
- Error messages MUST be actionable: identify the invalid field, state
  why it is invalid, and suggest a fix.
- New configuration options MUST NOT require understanding prior
  options to use. Each feature works independently.

**Rationale:** FloorScript exists because no "floor plan as code" DSL
serves AI agents today. If agents cannot easily produce valid input,
the project fails its primary mission.

### II. Text-Based and Diffable

All input and output artifacts MUST be text-based and suitable for
version control:

- Input MUST be JSON or YAML — no binary formats, no GUI-only
  configuration.
- Primary output MUST be SVG (text-based vector graphics).
- Configuration changes MUST produce meaningful, reviewable diffs.
- Rendered output MUST be deterministic: identical input MUST produce
  identical output.

**Rationale:** Floor plans live in version control alongside code.
Text formats enable diffing, code review, and automated pipelines.

### III. Architectural Correctness by Default

FloorScript MUST encode standard US residential architectural drawing
conventions (line weights, symbol standards, dimension styles) so
users receive permit-quality output without manual configuration:

- Line weights MUST follow ANSI/architectural standards (exterior
  walls heavier than interior, fixtures lighter than structural).
- Symbols MUST follow ANSI/NECA conventions for electrical and
  plumbing elements.
- Dimension style MUST use architectural ticks (not arrowheads),
  feet-and-inches format with dash separator (`12'-6"`).
- Renovation plans MUST use standard demolition notation (dashed
  lines, lighter weight) and new-construction notation (filled poche).

**Rationale:** Architectural conventions are non-negotiable for permit
drawings. Building them in eliminates an entire class of user errors.

### IV. Pure Pipeline Architecture

The processing pipeline MUST follow Parse → Resolve → Render with
strict separation:

- **Parse** (`@floorscript/core`): Validate input via Zod schemas,
  produce typed configuration objects. No geometry computation.
- **Resolve** (`@floorscript/core`): Transform configuration into
  absolute geometry (walls, openings, dimension lines). Pure
  functions, no mutation, no rendering concern.
- **Render** (`@floorscript/render-svg`): Transform resolved geometry
  into output format. No layout decisions.
- Each stage MUST be independently testable with its own input/output
  contract.
- Functions MUST be pure: return new objects, never mutate arguments.

**Rationale:** Clean separation enables multiple render backends (SVG,
PDF, DXF), independent testing of each stage, and prevents coupling
between layout logic and presentation.

### V. Visual Verification Required

Automated tests alone are INSUFFICIENT for a graphical output tool.
Any change to resolvers, renderers, or example YAML files MUST
include visual inspection of rendered output:

- Build all packages after source changes (`pnpm build`).
- Render example YAML to SVG and convert to PNG.
- Inspect for: clipped elements, overlapping text, mispositioned
  symbols, correct layer rendering, proper line weights.
- Visual regressions not caught by snapshot tests MUST be caught by
  human or AI inspection before merge.

**Rationale:** Pixel-level correctness matters for architectural
drawings. A wall that renders 1px off-center or a label that overlaps
a dimension line is a real defect that unit tests cannot detect.

### VI. Strict Type Safety

All code MUST use TypeScript strict mode with Zod schemas for input
validation:

- TypeScript `strict: true` in all packages via `tsconfig.base.json`.
- All external input (YAML/JSON config) MUST be validated through Zod
  schemas before processing.
- Types MUST be inferred from Zod schemas where possible — avoid
  duplicate type definitions.
- Import paths MUST use `.js` extensions (ES Module convention).
- No `any` types except where interfacing with untyped third-party
  libraries, and those MUST be narrowed immediately.

**Rationale:** The parser is the trust boundary. Strict types after
parsing eliminate an entire class of runtime errors in resolvers and
renderers.

## Technology Constraints

- **Language:** TypeScript 5.x, target ES2022, strict mode.
- **Package manager:** pnpm with workspace protocol (`workspace:*`).
- **Bundler:** tsup with dual ESM + CJS output for library packages.
- **Testing:** Vitest. Tests live in `packages/*/__tests__/` or
  co-located `*.test.ts` files.
- **Validation:** Zod for all input schemas.
- **Monorepo structure:** Three packages —
  `@floorscript/core` → `@floorscript/render-svg` → `@floorscript/cli`.
  New packages MUST justify their existence; prefer extending existing
  packages over creating new ones.
- **No runtime DOM dependency.** SVG generation MUST work in pure
  Node.js without browser APIs or jsdom.
- **Naming conventions:**
  - Files: `kebab-case.ts`
  - Types/interfaces: `PascalCase`
  - Functions: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`

## Development Workflow

- Run `pnpm test` before committing any change.
- Run `pnpm build` after modifying `core` or `render-svg` — the CLI
  depends on built output.
- Run `pnpm typecheck` to verify type safety across all packages.
- Follow the visual verification workflow (Principle V) for any
  change that affects rendered output.
- Commit messages MUST follow conventional commits format.
- New resolvers go in `packages/core/src/resolver/` following existing
  patterns.
- New renderers go in `packages/render-svg/src/renderers/` and MUST
  be wired into `render-svg.ts`.

## Governance

This constitution is the authoritative source of project principles
and non-negotiable constraints. All design decisions, code reviews,
and feature proposals MUST be evaluated against these principles.

**Amendment procedure:**
1. Propose the change with rationale in a PR description.
2. Update this file with the new or modified principle.
3. Increment the version per semantic versioning (see below).
4. Verify all dependent templates remain consistent.
5. Document the change in the Sync Impact Report comment at the top
   of this file.

**Versioning policy:**
- MAJOR: Removal or incompatible redefinition of a core principle.
- MINOR: New principle added or existing principle materially expanded.
- PATCH: Wording clarification, typo fix, or non-semantic refinement.

**Compliance review:**
- Every PR MUST be consistent with these principles.
- The plan template's "Constitution Check" section MUST reference
  this file for gate criteria.
- Use `CLAUDE.md` as the runtime development guidance file.

**Version**: 1.0.0 | **Ratified**: 2026-02-12 | **Last Amended**: 2026-02-12
