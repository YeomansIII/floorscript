# CLAUDE.md

## Project Overview

FloorScript is a TypeScript library and CLI for programmatic generation of architectural floor plans from structured YAML/JSON configuration. It targets LLM AI agents as primary consumers, producing permit-ready residential floor plans, kitchen/bath renovation documents, and basic electrical/plumbing layouts.

## Repository Structure

This is a **pnpm monorepo** with three packages:

```
packages/
  core/           # @floorscript/core — Parser, resolver, types (Zod schemas + geometry)
  render-svg/     # @floorscript/render-svg — SVG rendering engine
  cli/            # @floorscript/cli — Command-line interface (Commander)
examples/         # Example floor plans (YAML, SVG, PNG)
SPEC.md           # Full language and architecture specification
```

### Package Dependency Graph

```
cli → render-svg → core
```

### Key Source Directories

- `packages/core/src/types/` — Input config interfaces (`config.ts`) and output geometry types (`geometry.ts`)
- `packages/core/src/parser/` — YAML/JSON parsing (`config-parser.ts`) and dimension string parsing (`dimension.ts`)
- `packages/core/src/resolver/` — Layout resolution: `layout-resolver.ts` (orchestrator), `wall-resolver.ts`, `opening-resolver.ts`, `dimension-resolver.ts`
- `packages/render-svg/src/renderers/` — Individual SVG renderers for walls, doors, windows, dimensions, labels, title blocks
- `packages/render-svg/src/svg-document.ts` — Lightweight SVG builder (no DOM dependency)
- `packages/cli/src/commands/` — CLI commands: `render.ts`, `init.ts`

## Common Commands

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages (pnpm -r build)
pnpm test                 # Run all tests once (vitest run)
pnpm test:watch           # Run tests in watch mode
pnpm typecheck            # Type-check all packages (pnpm -r typecheck)
pnpm clean                # Remove all dist/ folders
```

Per-package commands (run from package directory):
```bash
pnpm build                # tsup build
pnpm dev                  # tsup --watch
pnpm test                 # vitest run
pnpm typecheck            # tsc --noEmit
```

## Architecture

**Pipeline:** Input (YAML/JSON) → `parseConfig` → `resolveLayout` → `renderSvg` → SVG output

1. **@floorscript/core** — Parses input config via Zod validation, resolves room positions into absolute geometry (walls, openings, dimension lines)
2. **@floorscript/render-svg** — Transforms resolved geometry into SVG, handling coordinate flipping (Y-up to Y-down) and architectural drawing conventions
3. **@floorscript/cli** — Exposes `render` and `init` commands via Commander

### Public API Surface

```typescript
// @floorscript/core
export { parseConfig } from "./parser/config-parser.js";
export { resolveLayout } from "./resolver/layout-resolver.js";
export { parseDimension, formatDimension } from "./parser/dimension.js";
export * from "./types/config.js";    // FloorPlanConfig, RoomConfig, etc.
export * from "./types/geometry.js";  // ResolvedPlan, ResolvedRoom, etc.

// @floorscript/render-svg
export { renderSvg } from "./render-svg.js";
export type { SvgRenderOptions } from "./render-svg.js";
```

## Testing

- **Framework:** Vitest v3.0.0
- **Test locations:** `packages/*/src/**/*.test.ts` and `packages/*/__tests__/**/*.test.ts`
- **Existing test files:**
  - `packages/core/__tests__/config-parser.test.ts` — YAML/JSON parsing and Zod validation
  - `packages/core/__tests__/dimension.test.ts` — Imperial/metric dimension parsing
  - `packages/core/__tests__/layout-resolver.test.ts` — Room positioning and wall geometry
  - `packages/render-svg/__tests__/integration.test.ts` — End-to-end SVG rendering
- Run `pnpm test` from root before committing changes

## Code Conventions

- **TypeScript strict mode** enabled everywhere (via `tsconfig.base.json`)
- **ES Modules** — `"type": "module"` in all packages; use `.js` extensions in import paths
- **File naming:** kebab-case (`config-parser.ts`, `wall-resolver.ts`)
- **Type naming:** PascalCase for types/interfaces (`FloorPlanConfig`, `ResolvedPlan`)
- **Function naming:** camelCase (`parseDimension`, `resolveLayout`)
- **Constants:** UPPER_SNAKE_CASE (`DEFAULT_EXTERIOR_THICKNESS_FT`)
- **Functional style:** Pure functions that return new objects; avoid mutation
- **Zod schemas** for all input validation; types are inferred from schemas where possible
- **No barrel exports** except the main `index.ts` per package
- Dual output format: ESM + CJS via tsup (core and render-svg)

## Build Tooling

- **Package manager:** pnpm (workspace protocol `workspace:*` for inter-package deps)
- **Bundler:** tsup (per-package `tsup.config.ts`)
- **TypeScript:** v5.7.0, target ES2022, module ESNext, bundler resolution
- **Config:** `tsconfig.base.json` at root, extended by each package's `tsconfig.json`
- **`.npmrc`:** `shamefully-hoist=true` for dependency compatibility

## Key Domain Concepts

- **FloorPlanConfig** — Top-level input: metadata, unit system, plans (before/after)
- **Rooms** — Positioned via explicit `x`/`y` or adjacency helpers (`adjacent_to`)
- **Openings** — Doors and windows placed on walls with position offset and dimensions
- **Dimension lines** — Auto-generated or manually specified measurement annotations
- **Renovation plans** — `before`/`after` plan IDs for demolition/construction diffing
- **Unit system** — Imperial (feet/inches with fractions) or metric (meters/mm)

## Visual Verification

When modifying renderers, resolvers, or example YAML files, **always visually verify the output** before committing. This is critical for catching layout issues that tests alone cannot detect (clipped elements, overlapping text, mispositioned symbols, etc.).

### Verification Workflow

```bash
# 1. Build all packages (required after any source change)
pnpm build

# 2. Render the YAML example to SVG
node packages/cli/dist/index.js render examples/multi-room.yaml -o examples/multi-room.svg

# 3. Convert SVG to PNG for visual inspection
node scripts/svg-to-png.mjs examples/multi-room.svg examples/multi-room.png

# 4. Inspect the PNG (agents: use the Read tool on the PNG file to view it)
# Check for: clipped symbols, overlapping text, correct element placement,
# proper layer rendering, symbol sizing, and wall-mounted element visibility
```

### What to Check

- **Electrical symbols**: Panel text readable, outlets visible on walls (need white fill), switch labels sized correctly
- **Plumbing fixtures**: Toilet/sink shapes properly oriented, supply runs color-coded (red=hot, blue=cold), drain runs in green
- **Layer visibility**: All enabled layers render, disabled layers omitted
- **Wall-mounted elements**: Outlets and switches not obscured by wall fill (require white background)
- **Text overlaps**: Labels, dimensions, and symbols not colliding (especially in small rooms)
- **Boundary clipping**: No symbols cut off at room edges or viewBox boundaries

### Alternative PNG Generation

If the `scripts/svg-to-png.mjs` script fails (missing sharp), use npx:
```bash
npx sharp-cli -i examples/multi-room.svg -o examples/multi-room.png
```

## Working with This Repo

- Always run `pnpm build` after modifying core or render-svg, since CLI depends on built output
- The `SPEC.md` file is the authoritative reference for the input format and planned features
- Examples in `examples/` show real YAML inputs and their rendered SVG/PNG outputs
- When adding new geometry resolvers, follow the pattern in `packages/core/src/resolver/`
- When adding new SVG renderers, add to `packages/render-svg/src/renderers/` and wire into `render-svg.ts`

## Active Technologies
- TypeScript 5.7.0, target ES2022, strict mode + Zod (validation), yaml (parsing), tsup (bundler), Commander (CLI) (001-fix-structural-rendering)
- N/A (file-based I/O) (001-fix-structural-rendering)
- TypeScript 5.7.0, target ES2022, strict mode + Zod (validation), tsup (bundler), yaml (parsing) (004-smart-dimensions)
- N/A (file-based I/O, SVG output) (004-smart-dimensions)

## Recent Changes
- 001-fix-structural-rendering: Added TypeScript 5.7.0, target ES2022, strict mode + Zod (validation), yaml (parsing), tsup (bundler), Commander (CLI)
