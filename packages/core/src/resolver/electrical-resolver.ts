import { parseDimension } from "../parser/dimension.js";
import type { ElectricalConfig, UnitSystem } from "../types/config.js";
import type {
  Point,
  ResolvedElectrical,
  ResolvedElectricalPanel,
  ResolvedElectricalRun,
  ResolvedLightFixture,
  ResolvedOutlet,
  ResolvedRoom,
  ResolvedSmokeDetector,
  ResolvedSwitch,
} from "../types/geometry.js";
import { computeWallPosition, findWallById } from "./wall-utils.js";

/**
 * Resolve electrical config into absolute plan geometry.
 *
 * - Panel and light fixtures use plan-absolute positions.
 * - Outlets and switches reference a wall (e.g. "kitchen.south") and
 *   are positioned along the wall centerline.
 * - Runs are polyline paths in plan-absolute coordinates.
 */
export function resolveElectrical(
  config: ElectricalConfig,
  rooms: ResolvedRoom[],
  units: UnitSystem,
): ResolvedElectrical {
  const panel = config.panel ? resolvePanel(config.panel, units) : undefined;

  const outlets = (config.outlets ?? []).map((o) =>
    resolveOutlet(o, rooms, units),
  );

  const switches = (config.switches ?? []).map((s) =>
    resolveSwitch(s, rooms, units),
  );

  const fixtures = (config.fixtures ?? []).map((f) =>
    resolveLightFixture(f, units),
  );

  const smokeDetectors = (config.smoke_detectors ?? []).map((d) =>
    resolveSmokeDetector(d, units),
  );

  const runs = (config.runs ?? []).map((r) => resolveRun(r, units));

  return { panel, outlets, switches, fixtures, smokeDetectors, runs };
}

function resolvePanel(
  config: NonNullable<ElectricalConfig["panel"]>,
  units: UnitSystem,
): ResolvedElectricalPanel {
  return {
    position: parseDimensionTuple(config.position, units),
    amps: config.amps,
    label: config.label,
  };
}

function resolveOutlet(
  config: NonNullable<ElectricalConfig["outlets"]>[number],
  rooms: ResolvedRoom[],
  units: UnitSystem,
): ResolvedOutlet {
  const { wall, room } = findWallById(config.wall, rooms);
  const alongWallOffset = parseDimension(config.position[0], units);
  const position = computeWallPosition(wall, room, alongWallOffset);

  return {
    id: config.id,
    outletType: config.type,
    position,
    wallId: config.wall,
    wallDirection: wall.direction,
    wallThickness: wall.thickness,
    circuit: config.circuit,
    label: config.label,
  };
}

function resolveSwitch(
  config: NonNullable<ElectricalConfig["switches"]>[number],
  rooms: ResolvedRoom[],
  units: UnitSystem,
): ResolvedSwitch {
  const { wall, room } = findWallById(config.wall, rooms);
  const alongWallOffset = parseDimension(config.position[0], units);
  const position = computeWallPosition(wall, room, alongWallOffset);

  return {
    id: config.id,
    switchType: config.type,
    position,
    wallId: config.wall,
    wallDirection: wall.direction,
    wallThickness: wall.thickness,
    controls: config.controls,
    circuit: config.circuit,
  };
}

function resolveLightFixture(
  config: NonNullable<ElectricalConfig["fixtures"]>[number],
  units: UnitSystem,
): ResolvedLightFixture {
  return {
    id: config.id,
    fixtureType: config.type,
    position: parseDimensionTuple(config.position, units),
    width: config.width ? parseDimension(config.width, units) : undefined,
    circuit: config.circuit,
  };
}

function resolveSmokeDetector(
  config: NonNullable<ElectricalConfig["smoke_detectors"]>[number],
  units: UnitSystem,
): ResolvedSmokeDetector {
  return {
    position: parseDimensionTuple(config.position, units),
    detectorType: config.type,
  };
}

function resolveRun(
  config: NonNullable<ElectricalConfig["runs"]>[number],
  units: UnitSystem,
): ResolvedElectricalRun {
  return {
    circuit: config.circuit,
    path: config.path.map((p) => parseDimensionTuple(p, units)),
    style: config.style ?? "solid",
  };
}

// Re-export findWallById for backwards compatibility
export { findWallById } from "./wall-utils.js";

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
