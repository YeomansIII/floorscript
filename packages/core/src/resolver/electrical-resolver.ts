import type {
  ElectricalConfig,
  UnitSystem,
  CardinalDirection,
} from "../types/config.js";
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
  ResolvedWall,
} from "../types/geometry.js";
import { parseDimension } from "../parser/dimension.js";

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
  const panel = config.panel
    ? resolvePanel(config.panel, units)
    : undefined;

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

/**
 * Find a wall by its reference string (e.g. "kitchen.south").
 * Throws a descriptive error if the room or wall direction is not found.
 */
export function findWallById(
  wallRef: string,
  rooms: ResolvedRoom[],
): { room: ResolvedRoom; wall: ResolvedWall } {
  const dotIndex = wallRef.lastIndexOf(".");
  if (dotIndex === -1) {
    throw new Error(
      `Invalid wall reference "${wallRef}": expected format "roomId.direction" (e.g. "kitchen.south")`,
    );
  }

  const roomId = wallRef.substring(0, dotIndex);
  const direction = wallRef.substring(dotIndex + 1) as CardinalDirection;

  const validDirections: CardinalDirection[] = [
    "north",
    "south",
    "east",
    "west",
  ];
  if (!validDirections.includes(direction)) {
    throw new Error(
      `Invalid wall direction "${direction}" in wall reference "${wallRef}": must be north, south, east, or west`,
    );
  }

  const room = rooms.find((r) => r.id === roomId);
  if (!room) {
    const available = rooms.map((r) => r.id).join(", ");
    throw new Error(
      `Room "${roomId}" not found in wall reference "${wallRef}". Available rooms: ${available}`,
    );
  }

  const wall = room.walls.find((w) => w.direction === direction);
  if (!wall) {
    throw new Error(
      `Wall "${direction}" not found on room "${roomId}"`,
    );
  }

  return { room, wall };
}

/**
 * Compute absolute position for a wall-mounted element.
 * The element is placed along the wall at the given offset from wall start,
 * on the wall's centerline (midpoint of wall thickness).
 */
function computeWallPosition(
  wall: ResolvedWall,
  _room: ResolvedRoom,
  alongWallOffset: number,
): Point {
  const rect = wall.rect;
  const centerOffset = wall.thickness / 2;

  switch (wall.direction) {
    case "south":
    case "north":
      // Horizontal wall: offset runs along X, centerline is Y
      return {
        x: rect.x + alongWallOffset,
        y: rect.y + centerOffset,
      };
    case "east":
    case "west":
      // Vertical wall: offset runs along Y, centerline is X
      return {
        x: rect.x + centerOffset,
        y: rect.y + alongWallOffset,
      };
  }
}
