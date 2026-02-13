import { parseDimension } from "../parser/dimension.js";
import type {
  CardinalDirection,
  FloorPlanConfig,
  PlanConfig,
  RoomConfig,
  UnitSystem,
  WallsConfig,
} from "../types/config.js";
import type {
  Rect,
  ResolvedEnclosure,
  ResolvedExtension,
  ResolvedPlan,
  ResolvedRoom,
} from "../types/geometry.js";
import { computeCompositeOutline } from "./composite-outline.js";
import { generateDimensions } from "./dimension-resolver.js";
import { resolveElectrical } from "./electrical-resolver.js";
import { resolveEnclosures } from "./enclosure-resolver.js";
import { resolveExtensions } from "./extension-resolver.js";
import { resolveOpenings } from "./opening-resolver.js";
import { resolvePlumbing } from "./plumbing-resolver.js";
import { resolveWallSegments } from "./segment-resolver.js";
import {
  buildWallGraph,
  resolveWallComposition,
} from "./shared-wall-resolver.js";
import { validatePlan } from "./validation.js";
import { resolveWalls } from "./wall-resolver.js";

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
  const wallGraph = buildWallGraph(rooms, plan.shared_walls, config.units);
  const bounds = computeBounds(rooms);
  const dimensions = generateDimensions(rooms, config.units);

  const electrical = plan.electrical
    ? resolveElectrical(plan.electrical, rooms, config.units)
    : undefined;

  const plumbing = plan.plumbing
    ? resolvePlumbing(plan.plumbing, config.units, rooms, wallGraph)
    : undefined;

  const resolvedPlan: ResolvedPlan = {
    project: config.project,
    units: config.units,
    title: plan.title,
    rooms,
    dimensions,
    bounds,
    wallGraph,
    electrical,
    plumbing,
    layers: plan.layers,
  };

  resolvedPlan.validation = validatePlan(resolvedPlan);

  return resolvedPlan;
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
        x =
          ref.x +
          ref.width +
          computeSharedGap(refRoom, config.walls, "east", units);
        y = alignPosition(ref.y, ref.height, height, adj.alignment, offset);
        break;
      case "west":
        x =
          ref.x -
          width -
          computeSharedGap(refRoom, config.walls, "west", units);
        y = alignPosition(ref.y, ref.height, height, adj.alignment, offset);
        break;
      case "north":
        y =
          ref.y +
          ref.height +
          computeSharedGap(refRoom, config.walls, "north", units);
        x = alignPosition(ref.x, ref.width, width, adj.alignment, offset);
        break;
      case "south":
        y =
          ref.y -
          height -
          computeSharedGap(refRoom, config.walls, "south", units);
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

  // Resolve enclosures and extensions (before wall generation)
  let enclosures: ResolvedEnclosure[] | undefined;
  let extensions: ResolvedExtension[] | undefined;
  let wallModifications:
    | Map<CardinalDirection, { shortenFromStart?: number; shortenFromEnd?: number }>
    | undefined;
  let wallGaps:
    | Map<CardinalDirection, Array<{ gapStart: number; gapEnd: number }>>
    | undefined;

  if (config.enclosures && config.enclosures.length > 0) {
    const encResult = resolveEnclosures(
      config.enclosures,
      bounds,
      units,
      config.id,
    );
    enclosures = encResult.enclosures;
    wallModifications = encResult.wallModifications;
  }

  if (config.extensions && config.extensions.length > 0) {
    const extResult = resolveExtensions(
      config.extensions,
      bounds,
      units,
      config.id,
    );
    extensions = extResult.extensions;
    wallGaps = extResult.wallGaps;
  }

  // Resolve walls (with optional modifications from enclosures/extensions)
  const walls = resolveWalls(
    config.walls,
    config.id,
    bounds,
    units,
    wallModifications,
    wallGaps,
  );

  // Resolve openings on each wall, then compute wall segments
  for (const wall of walls) {
    const wallDir = wall.direction;
    const wallConfig = config.walls?.[wallDir];
    if (wallConfig?.openings && wallConfig.openings.length > 0) {
      // Wall interior length = room dimension along the wall axis
      const wallInteriorLength =
        wallDir === "north" || wallDir === "south" ? width : height;
      wall.openings = resolveOpenings(
        wall,
        wallConfig.openings,
        units,
        config.id,
        wallInteriorLength,
      );
      // Re-split segments by openings (segments already account for extension gaps)
      wall.segments = resolveWallSegments(wall);
    }
    // When no openings, keep existing segments from wall resolver (may include extension gaps)
  }

  // Compute composite outline when room has extensions or enclosures
  let compositeOutline: import("../types/geometry.js").Point[] | undefined;
  let labelPosition: import("../types/geometry.js").Point;

  const hasComposite =
    (enclosures && enclosures.length > 0) ||
    (extensions && extensions.length > 0);

  if (hasComposite) {
    const extRects = extensions?.map((e) => e.bounds) ?? [];
    const encRects = enclosures?.map((e) => e.bounds) ?? [];
    compositeOutline = computeCompositeOutline(bounds, extRects, encRects);
    // Place label at centroid of the parent rect minus enclosures (largest open area)
    labelPosition = computeCompositeLabelPosition(bounds, encRects);
  } else {
    labelPosition = { x: x + width / 2, y: y + height / 2 };
  }

  return {
    id: config.id,
    label: config.label,
    bounds,
    labelPosition,
    walls,
    compositeOutline,
    enclosures,
    extensions,
  };
}

/**
 * Compute label position for composite rooms.
 * Uses the centroid of the parent rect minus enclosures to find
 * the largest open area for the label.
 */
function computeCompositeLabelPosition(
  parentBounds: Rect,
  enclosureRects: Rect[],
): { x: number; y: number } {
  if (enclosureRects.length === 0) {
    return {
      x: parentBounds.x + parentBounds.width / 2,
      y: parentBounds.y + parentBounds.height / 2,
    };
  }

  // Compute the area-weighted centroid of the parent minus enclosures
  // Simple approach: shift center away from enclosure corners
  const cx = parentBounds.x + parentBounds.width / 2;
  const cy = parentBounds.y + parentBounds.height / 2;

  // Check if center is inside an enclosure; if so, shift
  for (const enc of enclosureRects) {
    if (
      cx >= enc.x &&
      cx <= enc.x + enc.width &&
      cy >= enc.y &&
      cy <= enc.y + enc.height
    ) {
      // Center falls in enclosure — use parent center shifted to open area
      // Find the largest axis-aligned open rectangle (simplified: use area-weighted center)
      const parentArea = parentBounds.width * parentBounds.height;
      const encArea = enclosureRects.reduce(
        (sum, r) => sum + r.width * r.height,
        0,
      );
      const openArea = parentArea - encArea;
      if (openArea > 0) {
        // Weighted: parent center × parent area - enclosure centers × their areas
        let wx = cx * parentArea;
        let wy = cy * parentArea;
        for (const e of enclosureRects) {
          wx -= (e.x + e.width / 2) * (e.width * e.height);
          wy -= (e.y + e.height / 2) * (e.width * e.height);
        }
        return { x: wx / openArea, y: wy / openArea };
      }
    }
  }

  return { x: cx, y: cy };
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
    default:
      return refStart + offset;
  }
}

/**
 * Compute the gap between adjacent rooms for the shared wall.
 * The gap equals the thicker wall (thicker-wins rule) so the shared wall
 * fills this gap without intruding into either room's interior.
 */
function computeSharedGap(
  refRoom: ResolvedRoom,
  thisWallsConfig: WallsConfig | undefined,
  adjWall: CardinalDirection,
  units: UnitSystem,
): number {
  const oppositeDir: Record<CardinalDirection, CardinalDirection> = {
    east: "west",
    west: "east",
    north: "south",
    south: "north",
  };
  const refWall = refRoom.walls.find((w) => w.direction === adjWall);
  const refThickness = refWall?.thickness ?? 0;
  const thisDir = oppositeDir[adjWall];
  const thisWallConfig = thisWallsConfig?.[thisDir];
  const thisWallType = thisWallConfig?.type ?? "interior";
  const thisComp = resolveWallComposition(thisWallConfig, thisWallType, units);
  return Math.max(refThickness, thisComp.totalThickness);
}

/**
 * Compute plan bounds including exterior wall extents.
 * Room bounds are interior clear space; walls extend outside.
 */
function computeBounds(rooms: ResolvedRoom[]): Rect {
  if (rooms.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const room of rooms) {
    // Include wall extents outside room bounds
    for (const wall of room.walls) {
      const wr = wall.rect;
      minX = Math.min(minX, wr.x);
      minY = Math.min(minY, wr.y);
      maxX = Math.max(maxX, wr.x + wr.width);
      maxY = Math.max(maxY, wr.y + wr.height);
    }
    // Also include room interior bounds
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
