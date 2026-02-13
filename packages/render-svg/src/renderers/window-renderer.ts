import type { ResolvedOpening } from "@floorscript/core";
import {
  scaleValue,
  type TransformContext,
  toSvg,
} from "../coordinate-transform.js";
import type { DrawingContext } from "../drawing-context.js";

/**
 * Render a window symbol: two parallel lines within the wall opening.
 */
export function renderWindow(
  opening: ResolvedOpening,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const clStart = toSvg(opening.centerline.start, ctx);
  const clEnd = toSvg(opening.centerline.end, ctx);
  const wallThick = scaleValue(opening.wallThickness, ctx);
  const lineOffset = wallThick * 0.25;

  dc.openGroup({
    class: "opening window",
    stroke: "#000",
    "stroke-width": "0.35mm",
    fill: "none",
  });

  const dir = opening.wallDirection;

  if (dir === "south" || dir === "north") {
    dc.line(clStart.x, clStart.y - lineOffset, clEnd.x, clEnd.y - lineOffset);
    dc.line(clStart.x, clStart.y + lineOffset, clEnd.x, clEnd.y + lineOffset);
  } else {
    dc.line(clStart.x - lineOffset, clStart.y, clEnd.x - lineOffset, clEnd.y);
    dc.line(clStart.x + lineOffset, clStart.y, clEnd.x + lineOffset, clEnd.y);
  }

  dc.closeGroup();
}
