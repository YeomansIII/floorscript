import type { Rect, ResolvedWall } from "../types/geometry.js";

/**
 * Compute wall segments by splitting the wall rectangle around openings.
 * Returns the original wall rect as a single segment if there are no openings.
 */
export function resolveWallSegments(wall: ResolvedWall): Rect[] {
  if (wall.openings.length === 0) {
    return [wall.rect];
  }

  const { rect, direction, openings } = wall;
  const segments: Rect[] = [];

  if (direction === "south" || direction === "north") {
    // Horizontal wall: openings split along X axis
    const sortedOpenings = [...openings].sort(
      (a, b) => a.gapStart.x - b.gapStart.x,
    );

    let currentX = rect.x;

    for (const opening of sortedOpenings) {
      const gapStartX = opening.gapStart.x;
      const gapEndX = opening.gapEnd.x;

      if (gapStartX > currentX) {
        segments.push({
          x: currentX,
          y: rect.y,
          width: gapStartX - currentX,
          height: rect.height,
        });
      }

      currentX = gapEndX;
    }

    const wallEndX = rect.x + rect.width;
    if (currentX < wallEndX) {
      segments.push({
        x: currentX,
        y: rect.y,
        width: wallEndX - currentX,
        height: rect.height,
      });
    }
  } else {
    // Vertical wall (east/west): openings split along Y axis
    const sortedOpenings = [...openings].sort(
      (a, b) => a.gapStart.y - b.gapStart.y,
    );

    let currentY = rect.y;

    for (const opening of sortedOpenings) {
      const gapStartY = opening.gapStart.y;
      const gapEndY = opening.gapEnd.y;

      if (gapStartY > currentY) {
        segments.push({
          x: rect.x,
          y: currentY,
          width: rect.width,
          height: gapStartY - currentY,
        });
      }

      currentY = gapEndY;
    }

    const wallEndY = rect.y + rect.height;
    if (currentY < wallEndY) {
      segments.push({
        x: rect.x,
        y: currentY,
        width: rect.width,
        height: wallEndY - currentY,
      });
    }
  }

  return segments;
}
