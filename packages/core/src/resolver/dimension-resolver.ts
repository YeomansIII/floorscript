import type { UnitSystem } from "../types/config.js";
import type { ResolvedDimension, ResolvedRoom } from "../types/geometry.js";
import { formatDimension } from "../parser/dimension.js";

const DIMENSION_OFFSET_FT = 2;
const DIMENSION_OFFSET_M = 0.6;

/**
 * Auto-generate dimension lines for each room.
 * For each room, generates:
 *   1. Width dimension (horizontal) below the south wall
 *   2. Height dimension (vertical) to the left of the west wall
 */
export function generateDimensions(
  rooms: ResolvedRoom[],
  units: UnitSystem,
): ResolvedDimension[] {
  const offset =
    units === "imperial" ? DIMENSION_OFFSET_FT : DIMENSION_OFFSET_M;
  const dimensions: ResolvedDimension[] = [];

  for (const room of rooms) {
    const { x, y, width, height } = room.bounds;

    // Width dimension (horizontal, below south wall)
    dimensions.push({
      from: { x, y: y - offset },
      to: { x: x + width, y: y - offset },
      offset: -offset,
      label: formatDimension(width, units),
      orientation: "horizontal",
    });

    // Height dimension (vertical, left of west wall)
    dimensions.push({
      from: { x: x - offset, y },
      to: { x: x - offset, y: y + height },
      offset: -offset,
      label: formatDimension(height, units),
      orientation: "vertical",
    });
  }

  return dimensions;
}
