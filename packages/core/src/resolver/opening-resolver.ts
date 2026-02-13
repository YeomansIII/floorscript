import { parseDimension } from "../parser/dimension.js";
import type {
  CardinalDirection,
  OpeningConfig,
  UnitSystem,
} from "../types/config.js";
import type {
  LineSegment,
  ResolvedOpening,
  ResolvedWall,
} from "../types/geometry.js";

/**
 * Map from wall direction to which cardinal direction is the "start" end.
 *
 * - Horizontal walls (south/north) run west→east: start = west
 * - Vertical walls (east/west) run south→north: start = south
 */
const WALL_START_END: Record<
  CardinalDirection,
  { start: CardinalDirection; end: CardinalDirection }
> = {
  south: { start: "west", end: "east" },
  north: { start: "west", end: "east" },
  east: { start: "south", end: "north" },
  west: { start: "south", end: "north" },
};

/**
 * Convert `from`/`offset` to a numeric position along the wall interior.
 *
 * The `from` field names a perpendicular wall at one end of the target wall.
 * - If `from` matches the wall's "start" end, position = offset
 * - If `from` matches the wall's "end" end, position = wallInteriorLength - offset - openingWidth
 *
 * The position is relative to the wall interior start (same semantics as numeric `position`).
 */
export function resolveFromOffset(
  from: CardinalDirection,
  offset: number,
  wallDirection: CardinalDirection,
  wallInteriorLength: number,
  openingWidth: number,
): number {
  const { start, end } = WALL_START_END[wallDirection];

  if (from === start) {
    return offset;
  } else if (from === end) {
    return wallInteriorLength - offset - openingWidth;
  } else {
    throw new Error(
      `Invalid 'from' direction "${from}" for ${wallDirection} wall. ` +
        `Use "${start}" or "${end}".`,
    );
  }
}

/**
 * Resolve openings (doors/windows) to absolute positions on a wall.
 *
 * The opening `position` is the distance from the wall start:
 *   - South/North walls: from the left end (x increases)
 *   - East/West walls: from the bottom end (y increases)
 *
 * Supports three positioning modes:
 *   1. Numeric `position` — direct offset from wall start
 *   2. `position: "center"` — auto-center on wall interior
 *   3. `from`/`offset` — human-natural reference from a perpendicular wall
 */
export function resolveOpenings(
  wall: ResolvedWall,
  openings: OpeningConfig[],
  units: UnitSystem,
  ownerRoomId?: string,
  wallInteriorLength?: number,
): ResolvedOpening[] {
  return openings.map((config) => {
    const width = parseDimension(config.width, units);
    const position = resolveOpeningPosition(
      config,
      wall,
      units,
      width,
      wallInteriorLength,
    );

    const resolved = resolveOpeningGeometry(wall, config, position, width);
    if (ownerRoomId) {
      resolved.ownerRoomId = ownerRoomId;
    }
    return resolved;
  });
}

/**
 * Determine the numeric position for an opening along the wall interior.
 */
function resolveOpeningPosition(
  config: OpeningConfig,
  wall: ResolvedWall,
  units: UnitSystem,
  openingWidth: number,
  wallInteriorLength?: number,
): number {
  // Mode 1: from/offset positioning
  if (config.from != null && config.offset != null) {
    if (wallInteriorLength == null) {
      throw new Error(
        `Cannot resolve from/offset for opening on wall "${wall.id}": ` +
          `wall interior length not provided.`,
      );
    }
    const offset = parseDimension(config.offset, units);
    return resolveFromOffset(
      config.from,
      offset,
      wall.direction,
      wallInteriorLength,
      openingWidth,
    );
  }

  // Mode 2: center keyword
  if (config.position === "center") {
    if (wallInteriorLength == null) {
      throw new Error(
        `Cannot resolve 'center' position for opening on wall "${wall.id}": ` +
          `wall interior length not provided.`,
      );
    }
    return (wallInteriorLength - openingWidth) / 2;
  }

  // Mode 3: numeric position
  if (config.position != null) {
    return parseDimension(config.position, units);
  }

  throw new Error(
    `Opening on wall "${wall.id}" requires 'position', 'center', or 'from'/'offset'. ` +
      `Specify a numeric position, 'center', or use from/offset fields.`,
  );
}

function resolveOpeningGeometry(
  wall: ResolvedWall,
  config: OpeningConfig,
  position: number,
  width: number,
): ResolvedOpening {
  const dir = wall.direction;
  const rect = wall.rect;

  let gapStart: { x: number; y: number };
  let gapEnd: { x: number; y: number };
  let center: { x: number; y: number };
  let centerline: LineSegment;

  switch (dir) {
    case "south":
    case "north": {
      // Horizontal wall: position is distance from room interior left edge
      const startX = rect.x + wall.interiorStartOffset + position;
      const endX = startX + width;
      const wallY = rect.y;
      const midY = wallY + wall.thickness / 2;
      gapStart = { x: startX, y: wallY };
      gapEnd = { x: endX, y: wallY };
      center = { x: startX + width / 2, y: midY };
      centerline = {
        start: { x: startX, y: midY },
        end: { x: endX, y: midY },
      };
      break;
    }
    case "east":
    case "west": {
      // Vertical wall: position is distance from room interior bottom edge
      const startY = rect.y + wall.interiorStartOffset + position;
      const endY = startY + width;
      const wallX = rect.x;
      const midX = wallX + wall.thickness / 2;
      gapStart = { x: wallX, y: startY };
      gapEnd = { x: wallX, y: endY };
      center = { x: midX, y: startY + width / 2 };
      centerline = {
        start: { x: midX, y: startY },
        end: { x: midX, y: endY },
      };
      break;
    }
  }

  return {
    type: config.type,
    position: center,
    width,
    wallDirection: dir,
    wallThickness: wall.thickness,
    style: config.type === "door" ? (config.style ?? "standard") : undefined,
    swing: config.type === "door" ? config.swing : undefined,
    gapStart,
    gapEnd,
    centerline,
  };
}
