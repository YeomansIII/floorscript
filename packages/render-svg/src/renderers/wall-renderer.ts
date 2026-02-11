import type { ResolvedRoom, ResolvedWall, ResolvedOpening } from "@floorscript/core";
import { rectToSvg, type TransformContext } from "../coordinate-transform.js";
import { n } from "../svg-document.js";

/**
 * Render all walls for a room, splitting around openings.
 */
export function renderWalls(
  room: ResolvedRoom,
  ctx: TransformContext,
): string {
  const parts: string[] = [];

  parts.push(`<g class="room" id="room-${room.id}">`);
  parts.push(`<g class="walls">`);

  for (const wall of room.walls) {
    parts.push(renderWall(wall, ctx));
  }

  parts.push("</g>");
  parts.push("</g>");

  return parts.join("\n");
}

function renderWall(wall: ResolvedWall, ctx: TransformContext): string {
  const cssClass = `wall-${wall.type}`;

  if (wall.openings.length === 0) {
    // Simple case: no openings, render as single rectangle
    const svgRect = rectToSvg(wall.rect, ctx);
    return `<rect x="${n(svgRect.x)}" y="${n(svgRect.y)}" width="${n(svgRect.width)}" height="${n(svgRect.height)}" class="${cssClass}"/>`;
  }

  // Split wall into segments around openings
  const segments = getWallSegments(wall);
  const parts: string[] = [];
  parts.push(`<g class="${cssClass}">`);

  for (const seg of segments) {
    const svgRect = rectToSvg(seg, ctx);
    if (svgRect.width > 0.1 && svgRect.height > 0.1) {
      parts.push(
        `<rect x="${n(svgRect.x)}" y="${n(svgRect.y)}" width="${n(svgRect.width)}" height="${n(svgRect.height)}"/>`,
      );
    }
  }

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Split a wall rectangle into segments, excluding areas where openings are.
 */
function getWallSegments(
  wall: ResolvedWall,
): Array<{ x: number; y: number; width: number; height: number }> {
  const { rect, direction, openings } = wall;
  const segments: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];

  if (direction === "south" || direction === "north") {
    // Horizontal wall: openings split along X axis
    const sortedOpenings = [...openings].sort(
      (a, b) => a.gapStart.x - b.gapStart.x,
    );

    let currentX = rect.x;

    for (const opening of sortedOpenings) {
      const gapStartX = opening.gapStart.x;
      const gapEndX = opening.gapEnd.x;

      // Segment before the opening
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

    // Segment after last opening
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
