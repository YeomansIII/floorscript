import type {
  CardinalDirection,
  UnitSystem,
  WallConfig,
  WallsConfig,
} from "../types/config.js";
import type { Rect, ResolvedWall } from "../types/geometry.js";
import { parseDimension } from "../parser/dimension.js";

const DEFAULT_EXTERIOR_THICKNESS_FT = 0.5; // 6 inches
const DEFAULT_INTERIOR_THICKNESS_FT = 0.375; // 4.5 inches
const DEFAULT_EXTERIOR_THICKNESS_M = 0.15;
const DEFAULT_INTERIOR_THICKNESS_M = 0.1;

const LINE_WEIGHTS: Record<string, number> = {
  exterior: 0.7,
  interior: 0.5,
  "load-bearing": 0.5,
};

function getDefaultThickness(
  wallType: string,
  units: UnitSystem,
): number {
  if (units === "imperial") {
    return wallType === "exterior"
      ? DEFAULT_EXTERIOR_THICKNESS_FT
      : DEFAULT_INTERIOR_THICKNESS_FT;
  }
  return wallType === "exterior"
    ? DEFAULT_EXTERIOR_THICKNESS_M
    : DEFAULT_INTERIOR_THICKNESS_M;
}

/**
 * Resolve walls for a room given its bounding rectangle.
 * Room position and dimensions define the outer boundary;
 * wall thickness extends inward.
 */
export function resolveWalls(
  wallsConfig: WallsConfig | undefined,
  roomId: string,
  roomBounds: Rect,
  units: UnitSystem,
): ResolvedWall[] {
  const walls: ResolvedWall[] = [];
  const directions: CardinalDirection[] = ["north", "south", "east", "west"];

  for (const dir of directions) {
    const wallConfig: WallConfig | undefined = wallsConfig?.[dir];
    // Default to interior wall if not specified
    const wallType = wallConfig?.type ?? "interior";
    const thickness = wallConfig?.thickness
      ? parseDimension(wallConfig.thickness, units)
      : getDefaultThickness(wallType, units);

    const wall = resolveWallGeometry(
      roomId,
      dir,
      wallType,
      thickness,
      roomBounds,
    );
    walls.push(wall);
  }

  return walls;
}

function resolveWallGeometry(
  roomId: string,
  direction: CardinalDirection,
  wallType: string,
  thickness: number,
  bounds: Rect,
): ResolvedWall {
  const { x, y, width, height } = bounds;

  let rect: Rect;
  let outerStart: { x: number; y: number };
  let outerEnd: { x: number; y: number };
  let innerStart: { x: number; y: number };
  let innerEnd: { x: number; y: number };

  switch (direction) {
    case "south":
      rect = { x, y, width, height: thickness };
      outerStart = { x, y };
      outerEnd = { x: x + width, y };
      innerStart = { x, y: y + thickness };
      innerEnd = { x: x + width, y: y + thickness };
      break;
    case "north":
      rect = { x, y: y + height - thickness, width, height: thickness };
      outerStart = { x, y: y + height };
      outerEnd = { x: x + width, y: y + height };
      innerStart = { x, y: y + height - thickness };
      innerEnd = { x: x + width, y: y + height - thickness };
      break;
    case "west":
      rect = { x, y, width: thickness, height };
      outerStart = { x, y };
      outerEnd = { x, y: y + height };
      innerStart = { x: x + thickness, y };
      innerEnd = { x: x + thickness, y: y + height };
      break;
    case "east":
      rect = { x: x + width - thickness, y, width: thickness, height };
      outerStart = { x: x + width, y };
      outerEnd = { x: x + width, y: y + height };
      innerStart = { x: x + width - thickness, y };
      innerEnd = { x: x + width - thickness, y: y + height };
      break;
  }

  return {
    id: `${roomId}.${direction}`,
    direction,
    type: wallType as "exterior" | "interior" | "load-bearing",
    thickness,
    lineWeight: LINE_WEIGHTS[wallType] ?? 0.5,
    outerEdge: { start: outerStart, end: outerEnd },
    innerEdge: { start: innerStart, end: innerEnd },
    rect,
    openings: [],
    segments: [rect],
  };
}
