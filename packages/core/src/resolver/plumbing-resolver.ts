import type { PlumbingConfig, UnitSystem } from "../types/config.js";
import type {
  Point,
  ResolvedDrainRun,
  ResolvedPlumbing,
  ResolvedPlumbingFixture,
  ResolvedRoom,
  ResolvedSupplyRun,
  ResolvedValve,
  ResolvedWaterHeater,
  WallGraph,
} from "../types/geometry.js";
import { parseDimension } from "../parser/dimension.js";
import { findWallById } from "./wall-utils.js";

/**
 * Resolve plumbing config into absolute plan geometry.
 * Supports both legacy absolute positioning and wall-relative positioning.
 */
export function resolvePlumbing(
  config: PlumbingConfig,
  units: UnitSystem,
  rooms?: ResolvedRoom[],
  wallGraph?: WallGraph,
): ResolvedPlumbing {
  const fixtures = (config.fixtures ?? []).map((f) =>
    resolveFixture(f, units, rooms, wallGraph),
  );

  // Build fixture position map for from/to resolution
  const fixturePositions = new Map<string, Point>();
  for (const f of fixtures) {
    if (f.id) {
      fixturePositions.set(f.id, f.position);
    }
  }

  const supplyRuns = (config.supply_runs ?? []).map((r) =>
    resolveSupplyRun(r, units, fixturePositions, rooms, wallGraph),
  );

  const drainRuns = (config.drain_runs ?? []).map((r) =>
    resolveDrainRun(r, units, fixturePositions, rooms, wallGraph),
  );

  const valves = (config.valves ?? []).map((v) => resolveValve(v, units));

  const waterHeater = config.water_heater
    ? resolveWaterHeater(config.water_heater, units)
    : undefined;

  return { fixtures, supplyRuns, drainRuns, valves, waterHeater };
}

function resolveFixture(
  config: NonNullable<PlumbingConfig["fixtures"]>[number],
  units: UnitSystem,
  rooms?: ResolvedRoom[],
  wallGraph?: WallGraph,
): ResolvedPlumbingFixture {
  let position: Point;

  if (config.wall && rooms) {
    // Wall-relative positioning
    const { wall } = findWallById(config.wall, rooms, wallGraph);
    const alongWall = Array.isArray(config.position)
      ? parseDimension(config.position[0], units)
      : parseDimension(config.position, units);
    const offset = config.offset ? parseDimension(config.offset, units) : 0;

    position = computeWallRelativePosition(wall, alongWall, offset);
  } else if (Array.isArray(config.position)) {
    // Legacy absolute positioning
    position = parseDimensionTuple(config.position as [string | number, string | number], units);
  } else {
    // Single dimension with wall reference missing — treat as x=value, y=0
    position = { x: parseDimension(config.position, units), y: 0 };
  }

  return {
    id: config.id,
    fixtureType: config.type,
    position,
    width: config.width ? parseDimension(config.width, units) : undefined,
    depth: config.depth ? parseDimension(config.depth, units) : undefined,
    supply: config.supply,
    drain: config.drain,
  };
}

/**
 * Compute position relative to a wall's inner face.
 * alongWall = distance along the wall from its start
 * offset = distance from the inner wall face into the room
 */
function computeWallRelativePosition(
  wall: { direction: string; rect: { x: number; y: number; width: number; height: number }; thickness: number; innerEdge: { start: Point; end: Point }; interiorStartOffset: number },
  alongWall: number,
  offset: number,
): Point {
  const inner = wall.innerEdge;
  const iso = wall.interiorStartOffset;

  switch (wall.direction) {
    case "south":
      // Horizontal wall below room — inner face at top, offset goes up (into room)
      return { x: inner.start.x + iso + alongWall, y: inner.start.y + offset };
    case "north":
      // Horizontal wall above room — inner face at bottom, offset goes down (into room)
      return { x: inner.start.x + iso + alongWall, y: inner.start.y - offset };
    case "west":
      // Vertical wall left of room — inner face on right, offset goes right (into room)
      return { x: inner.start.x + offset, y: inner.start.y + iso + alongWall };
    case "east":
      // Vertical wall right of room — inner face on left, offset goes left (into room)
      return { x: inner.start.x - offset, y: inner.start.y + iso + alongWall };
    default:
      return { x: inner.start.x + iso + alongWall, y: inner.start.y + offset };
  }
}

function resolveSupplyRun(
  config: NonNullable<PlumbingConfig["supply_runs"]>[number],
  units: UnitSystem,
  fixturePositions: Map<string, Point>,
  rooms?: ResolvedRoom[],
  wallGraph?: WallGraph,
): ResolvedSupplyRun {
  const path = resolveRunPath(config.path, config.from, config.to, units, fixturePositions, rooms, wallGraph);
  return {
    supplyType: config.type,
    path,
    size: config.size,
  };
}

function resolveDrainRun(
  config: NonNullable<PlumbingConfig["drain_runs"]>[number],
  units: UnitSystem,
  fixturePositions: Map<string, Point>,
  rooms?: ResolvedRoom[],
  wallGraph?: WallGraph,
): ResolvedDrainRun {
  const path = resolveRunPath(config.path, config.from, config.to, units, fixturePositions, rooms, wallGraph);
  return {
    path,
    size: config.size,
    slope: config.slope,
  };
}

/**
 * Resolve a run path. Supports:
 * 1. Legacy: explicit path array
 * 2. from/to fixture ID references
 * 3. from/to wall references
 */
function resolveRunPath(
  path: [string | number, string | number][] | undefined,
  from: string | { wall: string; position: string | number } | undefined,
  to: string | { wall: string; position: string | number } | undefined,
  units: UnitSystem,
  fixturePositions: Map<string, Point>,
  rooms?: ResolvedRoom[],
  wallGraph?: WallGraph,
): Point[] {
  // Legacy path takes precedence
  if (path && path.length > 0) {
    return path.map((p) => parseDimensionTuple(p, units));
  }

  const points: Point[] = [];

  if (from) {
    points.push(resolveEndpoint(from, units, fixturePositions, rooms, wallGraph));
  }
  if (to) {
    points.push(resolveEndpoint(to, units, fixturePositions, rooms, wallGraph));
  }

  return points;
}

function resolveEndpoint(
  ref: string | { wall: string; position: string | number },
  units: UnitSystem,
  fixturePositions: Map<string, Point>,
  rooms?: ResolvedRoom[],
  wallGraph?: WallGraph,
): Point {
  if (typeof ref === "string") {
    // Fixture ID reference
    const pos = fixturePositions.get(ref);
    if (!pos) {
      throw new Error(`Fixture "${ref}" not found for supply/drain run endpoint`);
    }
    return pos;
  }

  // Wall reference
  if (!rooms) {
    throw new Error(`Wall reference "${ref.wall}" requires rooms context`);
  }
  const { wall } = findWallById(ref.wall, rooms, wallGraph);
  const alongWall = parseDimension(ref.position, units);
  return computeWallRelativePosition(wall, alongWall, 0);
}

function resolveValve(
  config: NonNullable<PlumbingConfig["valves"]>[number],
  units: UnitSystem,
): ResolvedValve {
  return {
    valveType: config.type,
    position: parseDimensionTuple(config.position, units),
    line: config.line,
  };
}

function resolveWaterHeater(
  config: NonNullable<PlumbingConfig["water_heater"]>,
  units: UnitSystem,
): ResolvedWaterHeater {
  return {
    position: parseDimensionTuple(config.position, units),
    heaterType: config.type,
    capacity: config.capacity,
  };
}

// ---- Helpers ----

function parseDimensionTuple(
  tuple: [string | number, string | number],
  units: UnitSystem,
): Point {
  return {
    x: parseDimension(tuple[0], units),
    y: parseDimension(tuple[1], units),
  };
}
