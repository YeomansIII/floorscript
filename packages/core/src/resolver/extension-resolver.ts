import { parseDimension } from "../parser/dimension.js";
import type {
  CardinalDirection,
  ExtensionConfig,
  UnitSystem,
} from "../types/config.js";
import type {
  Rect,
  ResolvedExtension,
  Wall,
} from "../types/geometry.js";
import { resolveFromOffset } from "./opening-resolver.js";
import { resolveOpenings } from "./opening-resolver.js";
import { resolveWallSegments } from "./segment-resolver.js";
import type { WallGap } from "./wall-resolver.js";

// Exterior wall thickness: 2x6 stud (5.5") + 0.5" drywall × 2 = 6.5" = 0.5417ft
const EXT_WALL_THICKNESS = 6.5 / 12;
const EXT_LINE_WEIGHT = 0.7;

export interface ExtensionResult {
  extensions: ResolvedExtension[];
  walls: Wall[];
  wallGaps: Map<CardinalDirection, WallGap[]>;
}

/**
 * Resolve extensions that project outward from a parent room wall.
 *
 * Each extension produces:
 * - Extension bounds (positioned outside the parent room)
 * - 3 exterior walls (the side facing the parent is open)
 * - Wall gaps indicating where the parent wall should be split
 */
export function resolveExtensions(
  configs: ExtensionConfig[],
  parentBounds: Rect,
  units: UnitSystem,
  parentRoomId: string,
): ExtensionResult {
  // Validate unique IDs
  const ids = new Set<string>();
  for (const config of configs) {
    if (ids.has(config.id)) {
      throw new Error(
        `Duplicate extension id "${config.id}" in room "${parentRoomId}". ` +
          `Each extension must have a unique id within its parent room.`,
      );
    }
    ids.add(config.id);
  }

  const extensions: ResolvedExtension[] = [];
  const allWalls: Wall[] = [];
  const wallGaps = new Map<CardinalDirection, WallGap[]>();

  for (const config of configs) {
    const ext = resolveExtension(config, parentBounds, units, parentRoomId);
    extensions.push(ext.extension);
    allWalls.push(...ext.walls);

    // Accumulate wall gaps
    const existing = wallGaps.get(config.wall) ?? [];
    existing.push(ext.gap);
    wallGaps.set(config.wall, existing);
  }

  return { extensions, walls: allWalls, wallGaps };
}

interface SingleExtensionResult {
  extension: ResolvedExtension;
  walls: Wall[];
  gap: WallGap;
}

function resolveExtension(
  config: ExtensionConfig,
  parentBounds: Rect,
  units: UnitSystem,
  parentRoomId: string,
): SingleExtensionResult {
  const extWidth = parseDimension(config.width, units);
  const extDepth = parseDimension(config.depth, units);
  const offset = parseDimension(config.offset, units);

  // Get the parent wall length (interior dimension along the wall)
  const parentWallLength =
    config.wall === "north" || config.wall === "south"
      ? parentBounds.width
      : parentBounds.height;

  // Compute position along parent wall using from/offset
  const posAlongWall = resolveFromOffset(
    config.from,
    offset,
    config.wall,
    parentWallLength,
    extWidth,
  );

  // Validate extension fits on parent wall
  if (posAlongWall + extWidth > parentWallLength + 0.001) {
    throw new Error(
      `Extension "${config.id}" exceeds parent wall "${config.wall}" in room "${parentRoomId}". ` +
        `Position (${posAlongWall.toFixed(2)}) + width (${extWidth.toFixed(2)}) = ` +
        `${(posAlongWall + extWidth).toFixed(2)} > wall length (${parentWallLength.toFixed(2)}). ` +
        `Reduce offset or width.`,
    );
  }
  if (posAlongWall < -0.001) {
    throw new Error(
      `Extension "${config.id}" has negative position on wall "${config.wall}" in room "${parentRoomId}". ` +
        `Check from/offset values.`,
    );
  }

  // Compute extension bounds (outside parent room)
  const bounds = computeExtensionBounds(
    config.wall,
    posAlongWall,
    extWidth,
    extDepth,
    parentBounds,
  );

  // Compute wall gap on parent wall
  const gap = computeExtensionGap(
    config.wall,
    posAlongWall,
    extWidth,
    parentBounds,
  );

  // Generate 3 exterior walls (open side faces parent)
  const extWalls = generateExtensionWalls(
    config.wall,
    bounds,
    config,
    units,
    parentRoomId,
  );

  return {
    extension: {
      id: config.id,
      label: config.label,
      parentRoomId,
      bounds,
      parentWall: config.wall,
    },
    walls: extWalls,
    gap,
  };
}

/**
 * Compute absolute bounds for an extension outside the parent room.
 */
function computeExtensionBounds(
  parentWall: CardinalDirection,
  posAlongWall: number,
  extWidth: number,
  extDepth: number,
  parent: Rect,
): Rect {
  switch (parentWall) {
    case "north":
      return {
        x: parent.x + posAlongWall,
        y: parent.y + parent.height,
        width: extWidth,
        height: extDepth,
      };
    case "south":
      return {
        x: parent.x + posAlongWall,
        y: parent.y - extDepth,
        width: extWidth,
        height: extDepth,
      };
    case "east":
      return {
        x: parent.x + parent.width,
        y: parent.y + posAlongWall,
        width: extDepth,
        height: extWidth,
      };
    case "west":
      return {
        x: parent.x - extDepth,
        y: parent.y + posAlongWall,
        width: extDepth,
        height: extWidth,
      };
  }
}

/**
 * Compute the gap in the parent wall where the extension connects.
 * Gap coordinates are in absolute position along the wall axis.
 */
function computeExtensionGap(
  parentWall: CardinalDirection,
  posAlongWall: number,
  extWidth: number,
  parent: Rect,
): WallGap {
  switch (parentWall) {
    case "north":
    case "south":
      // Horizontal wall: gap is along X axis
      return {
        gapStart: parent.x + posAlongWall,
        gapEnd: parent.x + posAlongWall + extWidth,
      };
    case "east":
    case "west":
      // Vertical wall: gap is along Y axis
      return {
        gapStart: parent.y + posAlongWall,
        gapEnd: parent.y + posAlongWall + extWidth,
      };
  }
}

/**
 * Generate 3 exterior walls for the extension (the open side faces the parent room).
 *
 * The far wall (same direction as parentWall) follows the main room convention:
 * horizontal walls extend through corners, vertical walls butt in. We extend
 * the far wall by EXT_WALL_THICKNESS on each perpendicular side to close
 * corner gaps.
 */
function generateExtensionWalls(
  parentWall: CardinalDirection,
  bounds: Rect,
  config: ExtensionConfig,
  units: UnitSystem,
  parentRoomId: string,
): Wall[] {
  // The open side is the one facing the parent room
  const openSide = getOppositDirection(parentWall);
  const allDirs: CardinalDirection[] = ["north", "south", "east", "west"];
  const closedDirs = allDirs.filter((d) => d !== openSide);

  // The far wall is the same direction as the parent wall
  const farWallDir = parentWall;

  const walls: Wall[] = [];
  for (const dir of closedDirs) {
    // For the far wall, extend bounds so it goes through corners
    const isFarWall = dir === farWallDir;
    const wallBounds = isFarWall ? extendFarWallBounds(bounds, dir) : bounds;

    const wall = createExteriorWall(
      `${parentRoomId}.${config.id}.${dir}`,
      dir,
      wallBounds,
      parentRoomId,
      config.id,
    );

    // Far wall needs interiorStartOffset so openings stay positioned
    // relative to the extension interior, not the extended wall
    if (isFarWall) {
      wall.interiorStartOffset = EXT_WALL_THICKNESS;
    }

    // Resolve openings if configured — use original bounds for interior length
    const wallConfig = config.walls?.[dir];
    if (wallConfig?.openings && wallConfig.openings.length > 0) {
      const wallInteriorLength =
        dir === "north" || dir === "south"
          ? bounds.width
          : bounds.height;
      wall.openings = resolveOpenings(
        wall,
        wallConfig.openings,
        units,
        `${parentRoomId}.${config.id}`,
        wallInteriorLength,
      );
    }
    wall.segments = resolveWallSegments(wall);

    walls.push(wall);
  }

  return walls;
}

/**
 * Extend the far wall bounds by EXT_WALL_THICKNESS on each perpendicular side
 * so horizontal far walls extend through corners and vertical far walls do too.
 */
function extendFarWallBounds(bounds: Rect, dir: CardinalDirection): Rect {
  const t = EXT_WALL_THICKNESS;
  if (dir === "north" || dir === "south") {
    // Horizontal far wall: extend width by t on each side
    return {
      x: bounds.x - t,
      y: bounds.y,
      width: bounds.width + 2 * t,
      height: bounds.height,
    };
  } else {
    // Vertical far wall: extend height by t on each side
    return {
      x: bounds.x,
      y: bounds.y - t,
      width: bounds.width,
      height: bounds.height + 2 * t,
    };
  }
}

function getOppositDirection(dir: CardinalDirection): CardinalDirection {
  switch (dir) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    case "west":
      return "east";
  }
}

/**
 * Create an exterior wall on one edge of an extension.
 */
function createExteriorWall(
  id: string,
  direction: CardinalDirection,
  bounds: Rect,
  parentRoomId: string,
  extensionId: string,
): Wall {
  const { x, y, width, height } = bounds;
  const t = EXT_WALL_THICKNESS;

  let rect: Rect;
  let outerStart: { x: number; y: number };
  let outerEnd: { x: number; y: number };
  let innerStart: { x: number; y: number };
  let innerEnd: { x: number; y: number };

  switch (direction) {
    case "south":
      rect = { x, y: y - t, width, height: t };
      outerStart = { x, y: y - t };
      outerEnd = { x: x + width, y: y - t };
      innerStart = { x, y };
      innerEnd = { x: x + width, y };
      break;
    case "north":
      rect = { x, y: y + height, width, height: t };
      outerStart = { x, y: y + height + t };
      outerEnd = { x: x + width, y: y + height + t };
      innerStart = { x, y: y + height };
      innerEnd = { x: x + width, y: y + height };
      break;
    case "east":
      rect = { x: x + width, y, width: t, height };
      outerStart = { x: x + width + t, y };
      outerEnd = { x: x + width + t, y: y + height };
      innerStart = { x: x + width, y };
      innerEnd = { x: x + width, y: y + height };
      break;
    case "west":
      rect = { x: x - t, y, width: t, height };
      outerStart = { x: x - t, y };
      outerEnd = { x: x - t, y: y + height };
      innerStart = { x, y };
      innerEnd = { x, y: y + height };
      break;
  }

  const outerEdge = { start: outerStart, end: outerEnd };
  const innerEdge = { start: innerStart, end: innerEnd };

  return {
    id,
    direction,
    type: "exterior",
    thickness: t,
    lineWeight: EXT_LINE_WEIGHT,
    outerEdge,
    innerEdge,
    centerline: {
      start: {
        x: (outerStart.x + innerStart.x) / 2,
        y: (outerStart.y + innerStart.y) / 2,
      },
      end: {
        x: (outerEnd.x + innerEnd.x) / 2,
        y: (outerEnd.y + innerEnd.y) / 2,
      },
    },
    rect,
    openings: [],
    segments: [rect],
    interiorStartOffset: 0,
    composition: {
      stud: null,
      studWidthFt: 0,
      finishA: 0,
      finishB: 0,
      totalThickness: t,
    },
    roomId: parentRoomId,
    roomIdB: null,
    directionInB: null,
    subSpaceId: extensionId,
    source: "extension",
    shared: false,
  };
}
