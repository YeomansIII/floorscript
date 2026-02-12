import type { ResolvedRoom, ResolvedWall } from "@floorscript/core";
import { rectToSvg, type TransformContext } from "../coordinate-transform.js";
import type { DrawingContext } from "../drawing-context.js";

const WALL_FILLS: Record<string, string> = {
  exterior: "#000",
  interior: "#333",
  "load-bearing": "#333",
};

/**
 * Render all walls for a room using pre-computed segments.
 */
export function renderWalls(
  room: ResolvedRoom,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  dc.openGroup({ class: "room", id: `room-${room.id}` });
  dc.openGroup({ class: "walls" });

  for (const wall of room.walls) {
    renderWall(wall, ctx, dc);
  }

  dc.closeGroup();
  dc.closeGroup();
}

function renderWall(wall: ResolvedWall, ctx: TransformContext, dc: DrawingContext): void {
  const fill = WALL_FILLS[wall.type] ?? "#333";

  if (wall.segments.length === 1) {
    const svgRect = rectToSvg(wall.segments[0], ctx);
    dc.rect(svgRect.x, svgRect.y, svgRect.width, svgRect.height, { fill, stroke: "none" });
    return;
  }

  dc.openGroup({ fill, stroke: "none" });

  for (const seg of wall.segments) {
    const svgRect = rectToSvg(seg, ctx);
    if (svgRect.width > 0.1 && svgRect.height > 0.1) {
      dc.rect(svgRect.x, svgRect.y, svgRect.width, svgRect.height);
    }
  }

  dc.closeGroup();
}
