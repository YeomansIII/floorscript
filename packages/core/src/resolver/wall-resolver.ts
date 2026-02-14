import type {
  CardinalDirection,
  UnitSystem,
  WallConfig,
  WallsConfig,
} from "../types/config.js";
import type { LineSegment, Rect, Wall } from "../types/geometry.js";
import type { WallModification } from "./enclosure-resolver.js";
import { resolveWallComposition } from "./shared-wall-resolver.js";

const LINE_WEIGHTS: Record<string, number> = {
  exterior: 0.7,
  interior: 0.5,
  "load-bearing": 0.5,
};

export interface WallGap {
  gapStart: number;
  gapEnd: number;
}

/**
 * Resolve walls for a room given its bounding rectangle.
 * Room bounds represent interior clear space (sheetrock to sheetrock).
 * Walls extend OUTSIDE the room bounds as additional material.
 * Horizontal walls (north/south) extend through corners; vertical walls (east/west) butt in.
 *
 * Optionally accepts wall modifications (from enclosures) and wall gaps (from extensions)
 * to adjust parent wall geometry.
 */
export function resolveWalls(
  wallsConfig: WallsConfig | undefined,
  roomId: string,
  roomBounds: Rect,
  units: UnitSystem,
  wallModifications?: Map<CardinalDirection, WallModification>,
  wallGaps?: Map<CardinalDirection, WallGap[]>,
): Wall[] {
  const walls: Wall[] = [];
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

    const mod = wallModifications?.get(dir);
    const gaps = wallGaps?.get(dir);

    const wall = resolveWallGeometry(
      roomId,
      dir,
      wallType,
      composition,
      roomBounds,
      thicknesses.get("west")!,
      thicknesses.get("east")!,
      mod,
      gaps,
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
 *
 * Wall modifications shorten walls from start/end (for enclosures).
 * Wall gaps remove segments entirely (for extensions).
 */
function resolveWallGeometry(
  roomId: string,
  direction: CardinalDirection,
  wallType: string,
  composition: import("../types/config.js").WallComposition,
  bounds: Rect,
  westThickness: number,
  eastThickness: number,
  modification?: WallModification,
  gaps?: WallGap[],
): Wall {
  const thickness = composition.totalThickness;
  const { x, y, width, height } = bounds;
  const shortenStart = modification?.shortenFromStart ?? 0;
  const shortenEnd = modification?.shortenFromEnd ?? 0;

  let rect: Rect;
  let outerStart: { x: number; y: number };
  let outerEnd: { x: number; y: number };
  let innerStart: { x: number; y: number };
  let innerEnd: { x: number; y: number };
  let interiorStartOffset: number;

  switch (direction) {
    case "south": {
      // Horizontal wall extends through corners, adjusted for enclosure shortening
      const startX = x - westThickness + shortenStart;
      const endX = x + width + eastThickness - shortenEnd;
      rect = {
        x: startX,
        y: y - thickness,
        width: endX - startX,
        height: thickness,
      };
      outerStart = { x: startX, y: y - thickness };
      outerEnd = { x: endX, y: y - thickness };
      innerStart = { x: startX, y };
      innerEnd = { x: endX, y };
      interiorStartOffset = Math.max(0, westThickness - shortenStart);
      break;
    }
    case "north": {
      const startX = x - westThickness + shortenStart;
      const endX = x + width + eastThickness - shortenEnd;
      rect = {
        x: startX,
        y: y + height,
        width: endX - startX,
        height: thickness,
      };
      outerStart = { x: startX, y: y + height + thickness };
      outerEnd = { x: endX, y: y + height + thickness };
      innerStart = { x: startX, y: y + height };
      innerEnd = { x: endX, y: y + height };
      interiorStartOffset = Math.max(0, westThickness - shortenStart);
      break;
    }
    case "west": {
      const startY = y + shortenStart;
      const endY = y + height - shortenEnd;
      rect = { x: x - thickness, y: startY, width: thickness, height: endY - startY };
      outerStart = { x: x - thickness, y: startY };
      outerEnd = { x: x - thickness, y: endY };
      innerStart = { x, y: startY };
      innerEnd = { x, y: endY };
      interiorStartOffset = 0;
      break;
    }
    case "east": {
      const startY = y + shortenStart;
      const endY = y + height - shortenEnd;
      rect = { x: x + width, y: startY, width: thickness, height: endY - startY };
      outerStart = { x: x + width + thickness, y: startY };
      outerEnd = { x: x + width + thickness, y: endY };
      innerStart = { x: x + width, y: startY };
      innerEnd = { x: x + width, y: endY };
      interiorStartOffset = 0;
      break;
    }
  }

  // Compute segments: start with full wall rect, then split by gaps
  let segments: Rect[];
  if (gaps && gaps.length > 0) {
    segments = splitWallByGaps(rect, direction, gaps);
  } else {
    segments = [rect];
  }

  const outerEdge: LineSegment = { start: outerStart, end: outerEnd };
  const innerEdge: LineSegment = { start: innerStart, end: innerEnd };
  const centerline: LineSegment = {
    start: {
      x: (outerStart.x + innerStart.x) / 2,
      y: (outerStart.y + innerStart.y) / 2,
    },
    end: {
      x: (outerEnd.x + innerEnd.x) / 2,
      y: (outerEnd.y + innerEnd.y) / 2,
    },
  };

  return {
    id: `${roomId}.${direction}`,
    direction,
    type: wallType as "exterior" | "interior" | "load-bearing",
    thickness,
    lineWeight: LINE_WEIGHTS[wallType] ?? 0.5,
    outerEdge,
    innerEdge,
    centerline,
    rect,
    openings: [],
    segments,
    interiorStartOffset,
    composition,
    roomId,
    roomIdB: null,
    directionInB: null,
    subSpaceId: null,
    source: "parent",
    shared: false,
  };
}

/**
 * Split a wall rect into segments by removing gap regions.
 * Gaps are defined along the wall's primary axis.
 */
function splitWallByGaps(
  wallRect: Rect,
  direction: CardinalDirection,
  gaps: WallGap[],
): Rect[] {
  const isHorizontal = direction === "north" || direction === "south";
  const segments: Rect[] = [];

  // Sort gaps by start position
  const sorted = [...gaps].sort((a, b) => a.gapStart - b.gapStart);

  if (isHorizontal) {
    let currentX = wallRect.x;
    for (const gap of sorted) {
      if (gap.gapStart > currentX + 0.001) {
        segments.push({
          x: currentX,
          y: wallRect.y,
          width: gap.gapStart - currentX,
          height: wallRect.height,
        });
      }
      currentX = gap.gapEnd;
    }
    const endX = wallRect.x + wallRect.width;
    if (endX > currentX + 0.001) {
      segments.push({
        x: currentX,
        y: wallRect.y,
        width: endX - currentX,
        height: wallRect.height,
      });
    }
  } else {
    let currentY = wallRect.y;
    for (const gap of sorted) {
      if (gap.gapStart > currentY + 0.001) {
        segments.push({
          x: wallRect.x,
          y: currentY,
          width: wallRect.width,
          height: gap.gapStart - currentY,
        });
      }
      currentY = gap.gapEnd;
    }
    const endY = wallRect.y + wallRect.height;
    if (endY > currentY + 0.001) {
      segments.push({
        x: wallRect.x,
        y: currentY,
        width: wallRect.width,
        height: endY - currentY,
      });
    }
  }

  return segments.length > 0 ? segments : [wallRect];
}
