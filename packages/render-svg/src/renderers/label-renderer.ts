import type { ResolvedRoom } from "@floorscript/core";
import { toSvg, scaleValue, type TransformContext } from "../coordinate-transform.js";
import { escapeXml, n } from "../svg-document.js";

// Room label font size in plan units (feet or meters)
const LABEL_SIZE_FT = 0.5;

/**
 * Render a room label centered in the room.
 */
export function renderLabel(
  room: ResolvedRoom,
  ctx: TransformContext,
): string {
  const pos = toSvg(room.labelPosition, ctx);
  const fontSize = scaleValue(LABEL_SIZE_FT, ctx);

  return `<text x="${n(pos.x)}" y="${n(pos.y)}" class="label" font-size="${n(fontSize)}" font-weight="500" text-anchor="middle" dominant-baseline="central">${escapeXml(room.label)}</text>`;
}
