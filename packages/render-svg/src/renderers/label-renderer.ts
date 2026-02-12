import type { ResolvedRoom } from "@floorscript/core";
import { toSvg, scaleValue, type TransformContext } from "../coordinate-transform.js";
import type { DrawingContext } from "../drawing-context.js";

// Room label font size in plan units (feet or meters)
const LABEL_SIZE_FT = 0.5;

/**
 * Render a room label centered in the room.
 */
export function renderLabel(
  room: ResolvedRoom,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const pos = toSvg(room.labelPosition, ctx);
  const fontSize = scaleValue(LABEL_SIZE_FT, ctx);

  dc.text(pos.x, pos.y, room.label, {
    fontFamily: "'Helvetica','Arial',sans-serif",
    fill: "#000",
    fontSize,
    fontWeight: "500",
    textAnchor: "middle",
    dominantBaseline: "central",
  });
}
