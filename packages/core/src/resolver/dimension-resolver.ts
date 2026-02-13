import type { UnitSystem } from "../types/config.js";
import type { Rect, ResolvedDimension, ResolvedRoom, WallGraph } from "../types/geometry.js";
import { formatDimension } from "../parser/dimension.js";

const DIMENSION_OFFSET_FT = 2;
const DIMENSION_OFFSET_M = 0.6;
const LANE_SPACING_FT = 1.5;
const LANE_SPACING_M = 0.45;
const EPSILON = 0.01;

/**
 * Auto-generate dimension lines for each room.
 * Neighbor-aware: dimensions are placed on the side away from neighboring rooms.
 * Shared-wall dimensions are deduplicated.
 */
export function generateDimensions(
  rooms: ResolvedRoom[],
  units: UnitSystem,
  wallGraph?: WallGraph,
): ResolvedDimension[] {
  const baseOffset = units === "imperial" ? DIMENSION_OFFSET_FT : DIMENSION_OFFSET_M;
  const laneSpacing = units === "imperial" ? LANE_SPACING_FT : LANE_SPACING_M;
  const dimensions: ResolvedDimension[] = [];

  // Track which edges have been dimensioned to avoid duplicates on shared walls
  const dimensionedEdges = new Set<string>();

  for (const room of rooms) {
    const { x, y, width, height } = room.bounds;

    // Determine neighbors
    const hasNeighborSouth = hasNeighborInDirection(room, rooms, "south");
    const hasNeighborNorth = hasNeighborInDirection(room, rooms, "north");
    const hasNeighborWest = hasNeighborInDirection(room, rooms, "west");
    const hasNeighborEast = hasNeighborInDirection(room, rooms, "east");

    // Width dimension (horizontal)
    const widthEdgeKey = makeEdgeKey(x, x + width, "horizontal", y);
    if (!dimensionedEdges.has(widthEdgeKey)) {
      // Prefer south side; if neighbor south, use north side
      const dimY = hasNeighborSouth
        ? y + height + baseOffset
        : y - baseOffset;

      dimensions.push({
        from: { x, y: dimY },
        to: { x: x + width, y: dimY },
        offset: hasNeighborSouth ? baseOffset : -baseOffset,
        label: formatDimension(width, units),
        orientation: "horizontal",
      });
      dimensionedEdges.add(widthEdgeKey);
    }

    // Height dimension (vertical)
    const heightEdgeKey = makeEdgeKey(y, y + height, "vertical", x);
    if (!dimensionedEdges.has(heightEdgeKey)) {
      // Prefer west side; if neighbor west, use east side
      const dimX = hasNeighborWest
        ? x + width + baseOffset
        : x - baseOffset;

      dimensions.push({
        from: { x: dimX, y },
        to: { x: dimX, y: y + height },
        offset: hasNeighborWest ? baseOffset : -baseOffset,
        label: formatDimension(height, units),
        orientation: "vertical",
      });
      dimensionedEdges.add(heightEdgeKey);
    }
  }

  return dimensions;
}

// Maximum gap between rooms that still counts as "neighbor" (same as shared wall detection)
const MAX_GAP = 1.0;

/**
 * Check if a room has a neighbor in the given direction.
 * Gap-aware: detects rooms separated by a wall-thickness gap.
 */
function hasNeighborInDirection(
  room: ResolvedRoom,
  rooms: ResolvedRoom[],
  direction: "north" | "south" | "east" | "west",
): boolean {
  const b = room.bounds;

  for (const other of rooms) {
    if (other.id === room.id) continue;
    const o = other.bounds;

    switch (direction) {
      case "south": {
        const gap = b.y - (o.y + o.height);
        if (gap >= -EPSILON && gap <= MAX_GAP && hasXOverlap(b, o)) return true;
        break;
      }
      case "north": {
        const gap = o.y - (b.y + b.height);
        if (gap >= -EPSILON && gap <= MAX_GAP && hasXOverlap(b, o)) return true;
        break;
      }
      case "west": {
        const gap = b.x - (o.x + o.width);
        if (gap >= -EPSILON && gap <= MAX_GAP && hasYOverlap(b, o)) return true;
        break;
      }
      case "east": {
        const gap = o.x - (b.x + b.width);
        if (gap >= -EPSILON && gap <= MAX_GAP && hasYOverlap(b, o)) return true;
        break;
      }
    }
  }
  return false;
}

function hasXOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width + EPSILON && b.x < a.x + a.width + EPSILON;
}

function hasYOverlap(a: Rect, b: Rect): boolean {
  return a.y < b.y + b.height + EPSILON && b.y < a.y + a.height + EPSILON;
}

function makeEdgeKey(start: number, end: number, orientation: string, perpendicular: number): string {
  const s = Math.round(start * 1000) / 1000;
  const e = Math.round(end * 1000) / 1000;
  const p = Math.round(perpendicular * 1000) / 1000;
  return `${orientation}:${s}-${e}@${p}`;
}
