import type { CardinalDirection } from "../types/config.js";
import type {
  PlanWall,
  Point,
  ResolvedRoom,
  ResolvedWall,
  WallGraph,
} from "../types/geometry.js";

/**
 * Find a wall by its reference string (e.g. "kitchen.south").
 * When a WallGraph is available, looks up the PlanWall from the graph.
 * Falls back to per-room wall lookup when no graph is provided.
 * Throws a descriptive error if the room or wall direction is not found.
 */
export function findWallById(
  wallRef: string,
  rooms: ResolvedRoom[],
  wallGraph?: WallGraph,
): {
  room: ResolvedRoom;
  wall: ResolvedWall;
  planWall?: PlanWall;
  direction: CardinalDirection;
} {
  const dotIndex = wallRef.lastIndexOf(".");
  if (dotIndex === -1) {
    throw new Error(
      `Invalid wall reference "${wallRef}": expected format "roomId.direction" (e.g. "kitchen.south")`,
    );
  }

  const roomId = wallRef.substring(0, dotIndex);
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

  const room = rooms.find((r) => r.id === roomId);
  if (!room) {
    const available = rooms.map((r) => r.id).join(", ");
    throw new Error(
      `Room "${roomId}" not found in wall reference "${wallRef}". Available rooms: ${available}`,
    );
  }

  const wall = room.walls.find((w) => w.direction === direction);
  if (!wall) {
    throw new Error(`Wall "${direction}" not found on room "${roomId}"`);
  }

  // Also look up the PlanWall from the graph if available
  let planWall: PlanWall | undefined;
  if (wallGraph) {
    planWall = wallGraph.byRoom.get(roomId)?.get(direction);
  }

  return { room, wall, planWall, direction };
}

/**
 * Compute absolute position for a wall-mounted element.
 * The element is placed along the wall at the given offset from wall start,
 * on the wall's inner face (toward the room interior).
 */
export function computeWallPosition(
  wall: ResolvedWall,
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
