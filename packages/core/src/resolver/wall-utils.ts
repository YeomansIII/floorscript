import type { CardinalDirection } from "../types/config.js";
import type {
  Point,
  ResolvedRoom,
  Wall,
  WallGraph,
} from "../types/geometry.js";

/**
 * Find a wall by its reference string (e.g. "kitchen.south").
 * Looks up the Wall from the unified wall graph by room or sub-space ID.
 * Throws a descriptive error if the room/sub-space or wall direction is not found.
 */
export function findWallById(
  wallRef: string,
  rooms: ResolvedRoom[],
  wallGraph?: WallGraph,
): {
  room: ResolvedRoom;
  wall: Wall;
  direction: CardinalDirection;
} {
  const dotIndex = wallRef.lastIndexOf(".");
  if (dotIndex === -1) {
    throw new Error(
      `Invalid wall reference "${wallRef}": expected format "roomId.direction" (e.g. "kitchen.south")`,
    );
  }

  const prefix = wallRef.substring(0, dotIndex);
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

  // Try room lookup first
  const room = rooms.find((r) => r.id === prefix);

  if (room && wallGraph) {
    const wall = wallGraph.byRoom.get(prefix)?.get(direction);
    if (wall) {
      return { room, wall, direction };
    }
  }

  // Try sub-space lookup (enclosure/extension)
  if (!room && wallGraph) {
    const subSpaceWall = wallGraph.bySubSpace.get(prefix)?.get(direction);
    if (subSpaceWall) {
      const parentRoom = rooms.find((r) => r.id === subSpaceWall.roomId);
      if (parentRoom) {
        return { room: parentRoom, wall: subSpaceWall, direction };
      }
    }
  }

  if (!room) {
    const available = rooms.map((r) => r.id).join(", ");
    throw new Error(
      `Room "${prefix}" not found in wall reference "${wallRef}". Available rooms: ${available}`,
    );
  }

  // If no wall graph, we can't look up the wall
  if (!wallGraph) {
    throw new Error(
      `Wall "${direction}" not found on room "${prefix}" — no wall graph available`,
    );
  }

  throw new Error(`Wall "${direction}" not found on room "${prefix}"`);
}

/**
 * Compute absolute position for a wall-mounted element.
 * The element is placed along the wall at the given offset from wall start,
 * on the wall's inner face (toward the room interior).
 */
export function computeWallPosition(
  wall: Wall,
  _room: ResolvedRoom,
  alongWallOffset: number,
): Point {
  const rect = wall.rect;
  const centerOffset = wall.thickness / 2;

  switch (wall.direction) {
    case "south":
    case "north":
      // Horizontal wall: offset runs along X from room interior edge, centerline is Y
      return {
        x: rect.x + wall.interiorStartOffset + alongWallOffset,
        y: rect.y + centerOffset,
      };
    case "east":
    case "west":
      // Vertical wall: offset runs along Y from room interior edge, centerline is X
      return {
        x: rect.x + centerOffset,
        y: rect.y + wall.interiorStartOffset + alongWallOffset,
      };
  }
}
