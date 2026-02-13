import { parseDimension } from "../parser/dimension.js";
import type {
  CardinalDirection,
  CornerPosition,
  EnclosureConfig,
  UnitSystem,
  WallsConfig,
} from "../types/config.js";
import type {
  Rect,
  ResolvedEnclosure,
  ResolvedWall,
} from "../types/geometry.js";
import { resolveFromOffset, resolveOpenings } from "./opening-resolver.js";
import { resolveWallSegments } from "./segment-resolver.js";

// Interior wall thickness: 2x4 stud (3.5") + 0.5" drywall × 2 = 4.5" = 0.375ft
const INT_WALL_THICKNESS = 4.5 / 12;
const INT_LINE_WEIGHT = 0.5;

export interface WallModification {
  shortenFromStart?: number;
  shortenFromEnd?: number;
}

export interface EnclosureResult {
  enclosures: ResolvedEnclosure[];
  wallModifications: Map<CardinalDirection, WallModification>;
}

/**
 * Resolve corner-based enclosures within a parent room.
 *
 * Each enclosure is carved from a corner of the parent room, producing:
 * - Enclosure bounds (absolute position)
 * - Interior walls along exposed edges
 * - Wall modifications telling the parent how to shorten its walls
 */
export function resolveEnclosures(
  configs: EnclosureConfig[],
  parentBounds: Rect,
  units: UnitSystem,
  parentRoomId: string,
): EnclosureResult {
  // Validate unique IDs
  const ids = new Set<string>();
  for (const config of configs) {
    if (ids.has(config.id)) {
      throw new Error(
        `Duplicate enclosure id "${config.id}" in room "${parentRoomId}". ` +
          `Each enclosure must have a unique id within its parent room.`,
      );
    }
    ids.add(config.id);
  }

  const enclosures: ResolvedEnclosure[] = [];
  const wallModifications = new Map<CardinalDirection, WallModification>();

  for (const config of configs) {
    if (config.corner != null) {
      const enc = resolveCornerEnclosure(
        config,
        parentBounds,
        units,
        parentRoomId,
      );
      enclosures.push(enc.enclosure);
      mergeWallModifications(wallModifications, enc.modifications);
    } else if (config.wall != null) {
      const enc = resolveWallEnclosure(
        config,
        parentBounds,
        units,
        parentRoomId,
      );
      enclosures.push(enc.enclosure);
      mergeWallModifications(wallModifications, enc.modifications);
    }
  }

  // Validate no overlaps
  for (let i = 0; i < enclosures.length; i++) {
    for (let j = i + 1; j < enclosures.length; j++) {
      if (rectsOverlap(enclosures[i].bounds, enclosures[j].bounds)) {
        throw new Error(
          `Enclosures "${enclosures[i].id}" and "${enclosures[j].id}" overlap ` +
            `in room "${parentRoomId}". Reduce dimensions or reposition one of them.`,
        );
      }
    }
  }

  return { enclosures, wallModifications };
}

interface CornerEnclosureResult {
  enclosure: ResolvedEnclosure;
  modifications: Map<CardinalDirection, WallModification>;
}

function resolveCornerEnclosure(
  config: EnclosureConfig,
  parentBounds: Rect,
  units: UnitSystem,
  parentRoomId: string,
): CornerEnclosureResult {
  const corner = config.corner as CornerPosition;
  const lengthVal = parseDimension(config.length, units);
  const depthVal = parseDimension(config.depth, units);

  // Infer facing direction
  const facing = inferFacing(config, corner);

  // Compute enclosure bounds based on corner + facing
  const bounds = computeCornerBounds(
    corner,
    facing,
    lengthVal,
    depthVal,
    parentBounds,
  );

  // Validate bounds fit within parent
  validateBoundsInParent(bounds, parentBounds, config.id, parentRoomId);

  // Determine exposed edges (edges facing the room interior)
  const exposedEdges = getCornerExposedEdges(corner);

  // Generate interior walls on exposed edges
  const walls = generateEnclosureWalls(
    exposedEdges,
    bounds,
    config,
    units,
    parentRoomId,
  );

  // Compute parent wall modifications
  const modifications = computeCornerWallModifications(
    corner,
    facing,
    lengthVal,
    depthVal,
  );

  return {
    enclosure: {
      id: config.id,
      label: config.label,
      parentRoomId,
      bounds,
      facing,
      walls,
    },
    modifications,
  };
}

/**
 * Resolve a wall-based enclosure positioned along a parent wall.
 *
 * Uses `from`/`offset` for positioning along the wall, `length` for extent
 * along the wall (or "full" for entire wall), and `depth` for how far
 * it extends into the room.
 */
function resolveWallEnclosure(
  config: EnclosureConfig,
  parentBounds: Rect,
  units: UnitSystem,
  parentRoomId: string,
): CornerEnclosureResult {
  const wall = config.wall as CardinalDirection;
  const depthVal = parseDimension(config.depth, units);

  // Wall interior length
  const wallLength =
    wall === "north" || wall === "south"
      ? parentBounds.width
      : parentBounds.height;

  // Resolve length: "full" spans entire wall
  const lengthVal =
    config.length === "full" ? wallLength : parseDimension(config.length, units);

  // Resolve position along wall
  let posAlongWall: number;
  if (config.length === "full") {
    posAlongWall = 0;
  } else if (config.from != null && config.offset != null) {
    const offset = parseDimension(config.offset, units);
    posAlongWall = resolveFromOffset(
      config.from,
      offset,
      wall,
      wallLength,
      lengthVal,
    );
  } else {
    posAlongWall = 0; // default: flush with wall start
  }

  // Validate fits
  if (posAlongWall + lengthVal > wallLength + 0.001) {
    throw new Error(
      `Enclosure "${config.id}" exceeds parent wall "${wall}" in room "${parentRoomId}". ` +
        `Position (${posAlongWall.toFixed(2)}) + length (${lengthVal.toFixed(2)}) = ` +
        `${(posAlongWall + lengthVal).toFixed(2)} > wall length (${wallLength.toFixed(2)}). ` +
        `Reduce offset or length.`,
    );
  }

  // Compute bounds
  const bounds = computeWallEnclosureBounds(
    wall,
    posAlongWall,
    lengthVal,
    depthVal,
    parentBounds,
  );

  validateBoundsInParent(bounds, parentBounds, config.id, parentRoomId);

  // Facing: wall enclosures face into the room (opposite of their wall)
  const facing = getOppositeDirection(wall);

  // Exposed edges: for a wall enclosure, the edges NOT against the parent wall
  const exposedEdges = getWallEnclosureExposedEdges(
    wall,
    posAlongWall,
    lengthVal,
    wallLength,
  );

  const walls = generateEnclosureWalls(
    exposedEdges,
    bounds,
    config,
    units,
    parentRoomId,
  );

  // Wall modifications: shorten the parent wall this enclosure is against
  const modifications = computeWallEnclosureModifications(
    wall,
    posAlongWall,
    lengthVal,
    depthVal,
    wallLength,
  );

  return {
    enclosure: {
      id: config.id,
      label: config.label,
      parentRoomId,
      bounds,
      facing,
      walls,
    },
    modifications,
  };
}

function computeWallEnclosureBounds(
  wall: CardinalDirection,
  posAlongWall: number,
  length: number,
  depth: number,
  parent: Rect,
): Rect {
  switch (wall) {
    case "north":
      // Along north wall, extends south into room
      return {
        x: parent.x + posAlongWall,
        y: parent.y + parent.height - depth,
        width: length,
        height: depth,
      };
    case "south":
      // Along south wall, extends north into room
      return {
        x: parent.x + posAlongWall,
        y: parent.y,
        width: length,
        height: depth,
      };
    case "east":
      // Along east wall, extends west into room
      return {
        x: parent.x + parent.width - depth,
        y: parent.y + posAlongWall,
        width: depth,
        height: length,
      };
    case "west":
      // Along west wall, extends east into room
      return {
        x: parent.x,
        y: parent.y + posAlongWall,
        width: depth,
        height: length,
      };
  }
}

function getOppositeDirection(dir: CardinalDirection): CardinalDirection {
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
 * Get exposed edges for a wall-based enclosure.
 * The facing side (opposite of wall) always has a wall.
 * The two perpendicular sides have walls unless flush with the parent edge.
 * The wall side itself is against the parent wall (no interior wall needed).
 */
function getWallEnclosureExposedEdges(
  wall: CardinalDirection,
  posAlongWall: number,
  length: number,
  wallLength: number,
): CardinalDirection[] {
  const facing = getOppositeDirection(wall);
  const edges: CardinalDirection[] = [facing];

  const eps = 0.001;
  const atStart = posAlongWall < eps;
  const atEnd = posAlongWall + length > wallLength - eps;

  // Add perpendicular edges that are exposed (not flush with parent corner)
  if (wall === "north" || wall === "south") {
    if (!atStart) edges.push("west");
    if (!atEnd) edges.push("east");
  } else {
    if (!atStart) edges.push("south");
    if (!atEnd) edges.push("north");
  }

  return edges;
}

function computeWallEnclosureModifications(
  wall: CardinalDirection,
  _posAlongWall: number,
  _length: number,
  depth: number,
  _wallLength: number,
): Map<CardinalDirection, WallModification> {
  const mods = new Map<CardinalDirection, WallModification>();

  // The parent wall is entirely behind the enclosure when length=full,
  // or partially. For simplicity, we modify perpendicular walls if needed.
  // The main effect: the wall perpendicular walls may need shortening.
  // For a full-wall enclosure on north: north wall is fully behind the enclosure.
  // The perpendicular walls (east/west) need shortening from the north end.
  // For a partial wall enclosure, the parent wall itself is not shortened
  // (the enclosure sits against it), but perpendicular walls are only shortened
  // if the enclosure is in a corner position. This is complex — for now,
  // we don't shorten parent walls for mid-wall enclosures (they sit against the wall).
  // The interior wall of the enclosure handles the boundary.

  // Actually, for wall enclosures, the main modification is:
  // The wall the enclosure is against does NOT need shortening (the enclosure sits against it).
  // But if the enclosure spans the full wall, the perpendicular corners may be affected.
  // For simplicity, we skip wall modifications for wall-based enclosures — their
  // interior walls handle the visual boundary. This can be refined later.

  // Note: we do not modify parent walls here because wall-based enclosures
  // sit against the parent wall (their back wall IS the parent wall).
  // The interior walls on exposed edges handle the visual separation.

  return mods;
}

/**
 * Three-tier facing inference:
 * 1. Explicit `facing` field
 * 2. Door opening on one interior wall → infer from that wall's direction
 * 3. Default: face along shorter dimension per corner
 */
function inferFacing(
  config: EnclosureConfig,
  corner: CornerPosition,
): CardinalDirection {
  // Tier 1: explicit
  if (config.facing) return config.facing;

  // Tier 2: door wall inference
  if (config.walls) {
    const doorsOnWalls = getWallsWithDoors(config.walls);
    if (doorsOnWalls.length === 1) {
      return doorsOnWalls[0];
    }
    if (doorsOnWalls.length > 1) {
      throw new Error(
        `Enclosure "${config.id}" has doors on multiple walls (${doorsOnWalls.join(", ")}) ` +
          `but no explicit 'facing' field. Specify 'facing' to resolve ambiguity.`,
      );
    }
  }

  // Tier 3: shorter-dimension default per corner
  return getDefaultFacing(corner);
}

function getWallsWithDoors(wallsConfig: WallsConfig): CardinalDirection[] {
  const result: CardinalDirection[] = [];
  const dirs: CardinalDirection[] = ["north", "south", "east", "west"];
  for (const dir of dirs) {
    const wallConfig = wallsConfig[dir];
    if (wallConfig?.openings?.some((o) => o.type === "door")) {
      result.push(dir);
    }
  }
  return result;
}

/**
 * Default facing per corner (opens toward room interior along shorter dimension).
 * NW → east, NE → west, SW → east, SE → west
 */
function getDefaultFacing(corner: CornerPosition): CardinalDirection {
  switch (corner) {
    case "northwest":
      return "east";
    case "northeast":
      return "west";
    case "southwest":
      return "east";
    case "southeast":
      return "west";
  }
}

/**
 * Compute absolute bounds for a corner enclosure.
 *
 * Convention:
 * - `length` = dimension perpendicular to facing direction
 * - `depth` = dimension in the facing direction
 *
 * For facing=east: depth is width (E-W), length is height (N-S)
 * For facing=west: depth is width (E-W), length is height (N-S)
 * For facing=north: depth is height (N-S), length is width (E-W)
 * For facing=south: depth is height (N-S), length is width (E-W)
 */
function computeCornerBounds(
  corner: CornerPosition,
  facing: CardinalDirection,
  length: number,
  depth: number,
  parent: Rect,
): Rect {
  // Determine enclosure width/height from facing + length/depth
  let encWidth: number;
  let encHeight: number;

  if (facing === "east" || facing === "west") {
    encWidth = depth; // depth is in the E-W direction
    encHeight = length; // length is in the N-S direction
  } else {
    encWidth = length; // length is in the E-W direction
    encHeight = depth; // depth is in the N-S direction
  }

  // Position based on corner
  let x: number;
  let y: number;

  switch (corner) {
    case "northwest":
      x = parent.x;
      y = parent.y + parent.height - encHeight;
      break;
    case "northeast":
      x = parent.x + parent.width - encWidth;
      y = parent.y + parent.height - encHeight;
      break;
    case "southwest":
      x = parent.x;
      y = parent.y;
      break;
    case "southeast":
      x = parent.x + parent.width - encWidth;
      y = parent.y;
      break;
  }

  return { x, y, width: encWidth, height: encHeight };
}

function validateBoundsInParent(
  bounds: Rect,
  parent: Rect,
  encId: string,
  roomId: string,
): void {
  const eps = 0.001;
  if (
    bounds.x < parent.x - eps ||
    bounds.y < parent.y - eps ||
    bounds.x + bounds.width > parent.x + parent.width + eps ||
    bounds.y + bounds.height > parent.y + parent.height + eps
  ) {
    throw new Error(
      `Enclosure "${encId}" exceeds parent room "${roomId}" dimensions. ` +
        `Enclosure bounds (${bounds.width.toFixed(2)} × ${bounds.height.toFixed(2)}) ` +
        `don't fit within room (${parent.width.toFixed(2)} × ${parent.height.toFixed(2)}). ` +
        `Reduce enclosure length or depth.`,
    );
  }
}

/**
 * Get the two exposed edges for a corner enclosure.
 * These are the edges facing the room interior (not against parent walls).
 */
function getCornerExposedEdges(
  corner: CornerPosition,
): CardinalDirection[] {
  switch (corner) {
    case "northwest":
      return ["east", "south"];
    case "northeast":
      return ["west", "south"];
    case "southwest":
      return ["east", "north"];
    case "southeast":
      return ["west", "north"];
  }
}

/**
 * Generate interior walls on the enclosure's exposed edges.
 */
function generateEnclosureWalls(
  exposedEdges: CardinalDirection[],
  bounds: Rect,
  config: EnclosureConfig,
  units: UnitSystem,
  parentRoomId: string,
): ResolvedWall[] {
  const walls: ResolvedWall[] = [];

  for (const dir of exposedEdges) {
    const wall = createInteriorWall(
      `${parentRoomId}.${config.id}.${dir}`,
      dir,
      bounds,
    );

    // Resolve openings on this wall if configured
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
 * Create a ResolvedWall for an interior wall on one edge of an enclosure.
 * The wall is placed on the boundary of the enclosure bounds, extending inward.
 */
function createInteriorWall(
  id: string,
  direction: CardinalDirection,
  bounds: Rect,
): ResolvedWall {
  const { x, y, width, height } = bounds;
  const t = INT_WALL_THICKNESS;

  let rect: Rect;
  let outerStart: { x: number; y: number };
  let outerEnd: { x: number; y: number };
  let innerStart: { x: number; y: number };
  let innerEnd: { x: number; y: number };
  let interiorStartOffset: number;

  switch (direction) {
    case "south":
      // Exposed south edge: wall sits at the south boundary of enclosure, extending inward (north)
      rect = { x, y, width, height: t };
      outerStart = { x, y };
      outerEnd = { x: x + width, y };
      innerStart = { x, y: y + t };
      innerEnd = { x: x + width, y: y + t };
      interiorStartOffset = 0;
      break;
    case "north":
      // Exposed north edge: wall sits at the north boundary, extending inward (south)
      rect = { x, y: y + height - t, width, height: t };
      outerStart = { x, y: y + height };
      outerEnd = { x: x + width, y: y + height };
      innerStart = { x, y: y + height - t };
      innerEnd = { x: x + width, y: y + height - t };
      interiorStartOffset = 0;
      break;
    case "east":
      // Exposed east edge: wall at east boundary, extending inward (west)
      rect = { x: x + width - t, y, width: t, height };
      outerStart = { x: x + width, y };
      outerEnd = { x: x + width, y: y + height };
      innerStart = { x: x + width - t, y };
      innerEnd = { x: x + width - t, y: y + height };
      interiorStartOffset = 0;
      break;
    case "west":
      // Exposed west edge: wall at west boundary, extending inward (east)
      rect = { x, y, width: t, height };
      outerStart = { x, y };
      outerEnd = { x, y: y + height };
      innerStart = { x: x + t, y };
      innerEnd = { x: x + t, y: y + height };
      interiorStartOffset = 0;
      break;
  }

  return {
    id,
    direction,
    type: "interior",
    thickness: t,
    lineWeight: INT_LINE_WEIGHT,
    outerEdge: { start: outerStart, end: outerEnd },
    innerEdge: { start: innerStart, end: innerEnd },
    rect,
    openings: [],
    segments: [rect],
    interiorStartOffset,
  };
}

/**
 * Corner enclosures sit inside the parent room — the parent's exterior walls
 * remain at full length (they ARE the closet's backing walls). The interior
 * partition walls on the exposed edges handle the boundary, so no parent
 * wall modifications are needed.
 */
function computeCornerWallModifications(
  _corner: CornerPosition,
  _facing: CardinalDirection,
  _length: number,
  _depth: number,
): Map<CardinalDirection, WallModification> {
  return new Map<CardinalDirection, WallModification>();
}

function mergeWallModifications(
  target: Map<CardinalDirection, WallModification>,
  source: Map<CardinalDirection, WallModification>,
): void {
  for (const [dir, mod] of source) {
    const existing = target.get(dir);
    if (existing) {
      target.set(dir, {
        shortenFromStart:
          (existing.shortenFromStart ?? 0) + (mod.shortenFromStart ?? 0) ||
          undefined,
        shortenFromEnd:
          (existing.shortenFromEnd ?? 0) + (mod.shortenFromEnd ?? 0) ||
          undefined,
      });
    } else {
      target.set(dir, { ...mod });
    }
  }
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  const eps = 0.001;
  return (
    a.x < b.x + b.width - eps &&
    a.x + a.width > b.x + eps &&
    a.y < b.y + b.height - eps &&
    a.y + a.height > b.y + eps
  );
}
