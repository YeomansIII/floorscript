import type { FloorPlanConfig, PlanConfig, RoomConfig, UnitSystem } from "../types/config.js";
import type { Rect, ResolvedPlan, ResolvedRoom } from "../types/geometry.js";
import { parseDimension } from "../parser/dimension.js";
import { resolveWalls } from "./wall-resolver.js";
import { resolveOpenings } from "./opening-resolver.js";
import { resolveWallSegments } from "./segment-resolver.js";
import { generateDimensions } from "./dimension-resolver.js";
import { resolveElectrical } from "./electrical-resolver.js";
import { resolvePlumbing } from "./plumbing-resolver.js";

/**
 * Resolve a parsed FloorPlanConfig into a ResolvedPlan ready for rendering.
 * Resolves all dimension strings, computes absolute geometry, and generates dimensions.
 */
export function resolveLayout(
  config: FloorPlanConfig,
  planId?: string,
): ResolvedPlan {
  const plan = planId
    ? config.plans.find((p) => p.id === planId)
    : config.plans[0];

  if (!plan) {
    throw new Error(
      planId
        ? `Plan "${planId}" not found in config`
        : "No plans found in config",
    );
  }

  const rooms = resolveRooms(plan, config.units);
  const bounds = computeBounds(rooms);
  const dimensions = generateDimensions(rooms, config.units);

  const electrical = plan.electrical
    ? resolveElectrical(plan.electrical, rooms, config.units)
    : undefined;

  const plumbing = plan.plumbing
    ? resolvePlumbing(plan.plumbing, config.units)
    : undefined;

  return {
    project: config.project,
    units: config.units,
    title: plan.title,
    rooms,
    dimensions,
    bounds,
    electrical,
    plumbing,
    layers: plan.layers,
  };
}

function resolveRooms(plan: PlanConfig, units: UnitSystem): ResolvedRoom[] {
  const resolvedRooms: ResolvedRoom[] = [];
  const roomMap = new Map<string, ResolvedRoom>();

  for (const roomConfig of plan.rooms) {
    const resolved = resolveRoom(roomConfig, roomMap, units);
    resolvedRooms.push(resolved);
    roomMap.set(roomConfig.id, resolved);
  }

  return resolvedRooms;
}

function resolveRoom(
  config: RoomConfig,
  roomMap: Map<string, ResolvedRoom>,
  units: UnitSystem,
): ResolvedRoom {
  const width = parseDimension(config.width, units);
  const height = parseDimension(config.height, units);

  let x: number;
  let y: number;

  if (config.adjacent_to) {
    const adj = config.adjacent_to;
    const refRoom = roomMap.get(adj.room);
    if (!refRoom) {
      throw new Error(
        `Room "${config.id}" references unknown room "${adj.room}" in adjacent_to`,
      );
    }

    const offset = adj.offset ? parseDimension(adj.offset, units) : 0;
    const ref = refRoom.bounds;

    switch (adj.wall) {
      case "east":
        x = ref.x + ref.width;
        y = alignPosition(ref.y, ref.height, height, adj.alignment, offset);
        break;
      case "west":
        x = ref.x - width;
        y = alignPosition(ref.y, ref.height, height, adj.alignment, offset);
        break;
      case "north":
        y = ref.y + ref.height;
        x = alignPosition(ref.x, ref.width, width, adj.alignment, offset);
        break;
      case "south":
        y = ref.y - height;
        x = alignPosition(ref.x, ref.width, width, adj.alignment, offset);
        break;
    }
  } else if (config.position) {
    x = parseDimension(config.position[0], units);
    y = parseDimension(config.position[1], units);
  } else {
    x = 0;
    y = 0;
  }

  const bounds: Rect = { x, y, width, height };

  // Resolve walls
  const walls = resolveWalls(config.walls, config.id, bounds, units);

  // Resolve openings on each wall, then compute wall segments
  for (const wall of walls) {
    const wallDir = wall.direction;
    const wallConfig = config.walls?.[wallDir];
    if (wallConfig?.openings && wallConfig.openings.length > 0) {
      wall.openings = resolveOpenings(wall, wallConfig.openings, units);
    }
    wall.segments = resolveWallSegments(wall);
  }

  return {
    id: config.id,
    label: config.label,
    bounds,
    labelPosition: {
      x: x + width / 2,
      y: y + height / 2,
    },
    walls,
  };
}

function alignPosition(
  refStart: number,
  refLength: number,
  thisLength: number,
  alignment: "start" | "center" | "end" | undefined,
  offset: number,
): number {
  switch (alignment) {
    case "center":
      return refStart + (refLength - thisLength) / 2 + offset;
    case "end":
      return refStart + refLength - thisLength + offset;
    case "start":
    default:
      return refStart + offset;
  }
}

function computeBounds(rooms: ResolvedRoom[]): Rect {
  if (rooms.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const room of rooms) {
    const { x, y, width, height } = room.bounds;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
