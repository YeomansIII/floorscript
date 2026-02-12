import type { PlumbingConfig, UnitSystem } from "../types/config.js";
import type {
  Point,
  ResolvedDrainRun,
  ResolvedPlumbing,
  ResolvedPlumbingFixture,
  ResolvedSupplyRun,
  ResolvedValve,
  ResolvedWaterHeater,
} from "../types/geometry.js";
import { parseDimension } from "../parser/dimension.js";

/**
 * Resolve plumbing config into absolute plan geometry.
 *
 * All plumbing positions are plan-absolute coordinates (no wall-lookup needed).
 */
export function resolvePlumbing(
  config: PlumbingConfig,
  units: UnitSystem,
): ResolvedPlumbing {
  const fixtures = (config.fixtures ?? []).map((f) =>
    resolveFixture(f, units),
  );

  const supplyRuns = (config.supply_runs ?? []).map((r) =>
    resolveSupplyRun(r, units),
  );

  const drainRuns = (config.drain_runs ?? []).map((r) =>
    resolveDrainRun(r, units),
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
): ResolvedPlumbingFixture {
  return {
    id: config.id,
    fixtureType: config.type,
    position: parseDimensionTuple(config.position, units),
    width: config.width ? parseDimension(config.width, units) : undefined,
    depth: config.depth ? parseDimension(config.depth, units) : undefined,
    supply: config.supply,
    drain: config.drain,
  };
}

function resolveSupplyRun(
  config: NonNullable<PlumbingConfig["supply_runs"]>[number],
  units: UnitSystem,
): ResolvedSupplyRun {
  return {
    supplyType: config.type,
    path: config.path.map((p) => parseDimensionTuple(p, units)),
    size: config.size,
  };
}

function resolveDrainRun(
  config: NonNullable<PlumbingConfig["drain_runs"]>[number],
  units: UnitSystem,
): ResolvedDrainRun {
  return {
    path: config.path.map((p) => parseDimensionTuple(p, units)),
    size: config.size,
    slope: config.slope,
  };
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
