import type { ResolvedRoom } from "@floorscript/core";
import { toSvg, type TransformContext } from "../coordinate-transform.js";
import { escapeXml, n } from "../svg-document.js";

/**
 * Render a room label centered in the room.
 */
export function renderLabel(
  room: ResolvedRoom,
  ctx: TransformContext,
): string {
  const pos = toSvg(room.labelPosition, ctx);

  return `<text x="${n(pos.x)}" y="${n(pos.y)}" class="label room-label" text-anchor="middle" dominant-baseline="central">${escapeXml(room.label)}</text>`;
}
