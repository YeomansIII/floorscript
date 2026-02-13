import type {
  CardinalDirection,
  UnitSystem,
  WallConfig,
  WallsConfig,
} from "../types/config.js";
import type { Rect, ResolvedWall } from "../types/geometry.js";
import { resolveWallComposition } from "./shared-wall-resolver.js";

const LINE_WEIGHTS: Record<string, number> = {
  exterior: 0.7,
  interior: 0.5,
  "load-bearing": 0.5,
};

/**
 * Resolve walls for a room given its bounding rectangle.
 * Room bounds represent interior clear space (sheetrock to sheetrock).
 * Walls extend OUTSIDE the room bounds as additional material.
 * Horizontal walls (north/south) extend through corners; vertical walls (east/west) butt in.
 */
export function resolveWalls(
  wallsConfig: WallsConfig | undefined,
  roomId: string,
  roomBounds: Rect,
  units: UnitSystem,
): ResolvedWall[] {
  const walls: ResolvedWall[] = [];
  const directions: CardinalDirection[] = ["north", "south", "east", "west"];

  // Pre-compute all thicknesses so horizontal walls can extend by perpendicular thicknesses
  const thicknesses = new Map<CardinalDirection, number>();
  for (const dir of directions) {
    const wallConfig: WallConfig | undefined = wallsConfig?.[dir];
    const wallType = wallConfig?.type ?? "interior";
    const composition = resolveWallComposition(wallConfig, wallType, units);
    thicknesses.set(dir, composition.totalThickness);
  }

  for (const dir of directions) {
    const wallConfig: WallConfig | undefined = wallsConfig?.[dir];
    const wallType = wallConfig?.type ?? "interior";
    const composition = resolveWallComposition(wallConfig, wallType, units);

    const wall = resolveWallGeometry(
      roomId,
      dir,
      wallType,
      composition.totalThickness,
      roomBounds,
      thicknesses.get("west")!,
      thicknesses.get("east")!,
    );
    walls.push(wall);
  }

  return walls;
}

/**
 * Compute wall geometry with walls extending OUTSIDE room bounds.
 * Inner edge = room boundary. Outer edge = room boundary + thickness outward.
 * Horizontal walls (north/south) extend to cover corner squares.
 * Vertical walls (east/west) butt into horizontal walls.
 */
function resolveWallGeometry(
  roomId: string,
  direction: CardinalDirection,
  wallType: string,
  thickness: number,
  bounds: Rect,
  westThickness: number,
  eastThickness: number,
): ResolvedWall {
  const { x, y, width, height } = bounds;

  let rect: Rect;
  let outerStart: { x: number; y: number };
  let outerEnd: { x: number; y: number };
  let innerStart: { x: number; y: number };
  let innerEnd: { x: number; y: number };
  let interiorStartOffset: number;

  switch (direction) {
    case "south":
      // Horizontal wall extends through corners
      rect = { x: x - westThickness, y: y - thickness, width: width + westThickness + eastThickness, height: thickness };
      outerStart = { x: x - westThickness, y: y - thickness };
      outerEnd = { x: x + width + eastThickness, y: y - thickness };
      innerStart = { x: x - westThickness, y };
      innerEnd = { x: x + width + eastThickness, y };
      interiorStartOffset = westThickness;
      break;
    case "north":
      // Horizontal wall extends through corners
      rect = { x: x - westThickness, y: y + height, width: width + westThickness + eastThickness, height: thickness };
      outerStart = { x: x - westThickness, y: y + height + thickness };
      outerEnd = { x: x + width + eastThickness, y: y + height + thickness };
      innerStart = { x: x - westThickness, y: y + height };
      innerEnd = { x: x + width + eastThickness, y: y + height };
      interiorStartOffset = westThickness;
      break;
    case "west":
      // Vertical wall butts into horizontal walls (no corner extension)
      rect = { x: x - thickness, y, width: thickness, height };
      outerStart = { x: x - thickness, y };
      outerEnd = { x: x - thickness, y: y + height };
      innerStart = { x, y };
      innerEnd = { x, y: y + height };
      interiorStartOffset = 0;
      break;
    case "east":
      // Vertical wall butts into horizontal walls (no corner extension)
      rect = { x: x + width, y, width: thickness, height };
      outerStart = { x: x + width + thickness, y };
      outerEnd = { x: x + width + thickness, y: y + height };
      innerStart = { x: x + width, y };
      innerEnd = { x: x + width, y: y + height };
      interiorStartOffset = 0;
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
    interiorStartOffset,
  };
}
