import type { OpeningConfig, UnitSystem } from "../types/config.js";
import type { LineSegment, ResolvedOpening, ResolvedWall } from "../types/geometry.js";
import { parseDimension } from "../parser/dimension.js";

/**
 * Resolve openings (doors/windows) to absolute positions on a wall.
 *
 * The opening `position` is the distance from the wall start:
 *   - South/North walls: from the left end (x increases)
 *   - East/West walls: from the bottom end (y increases)
 */
export function resolveOpenings(
  wall: ResolvedWall,
  openings: OpeningConfig[],
  units: UnitSystem,
): ResolvedOpening[] {
  return openings.map((config) => {
    const position = parseDimension(config.position, units);
    const width = parseDimension(config.width, units);

    return resolveOpeningGeometry(wall, config, position, width);
  });
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
      // Horizontal wall: position is distance from left
      const startX = rect.x + position;
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
      // Vertical wall: position is distance from bottom
      const startY = rect.y + position;
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
