import type { ResolvedOpening } from "@floorscript/core";
import { toSvg, scaleValue, type TransformContext } from "../coordinate-transform.js";
import { n } from "../svg-document.js";

/**
 * Render a window symbol: two parallel lines within the wall opening.
 */
export function renderWindow(
  opening: ResolvedOpening,
  ctx: TransformContext,
): string {
  const gapStart = toSvg(opening.gapStart, ctx);
  const gapEnd = toSvg(opening.gapEnd, ctx);
  const wallThick = scaleValue(opening.wallThickness, ctx);

  const parts: string[] = [];
  parts.push(`<g class="opening window">`);

  const dir = opening.wallDirection;

  if (dir === "south" || dir === "north") {
    // Horizontal wall: window lines are horizontal, offset vertically
    const lineOffset = wallThick * 0.25;
    const midY = (gapStart.y + gapEnd.y) / 2; // same y for horizontal walls

    parts.push(
      `<line x1="${n(gapStart.x)}" y1="${n(midY - lineOffset)}" x2="${n(gapEnd.x)}" y2="${n(midY - lineOffset)}"/>`,
    );
    parts.push(
      `<line x1="${n(gapStart.x)}" y1="${n(midY + lineOffset)}" x2="${n(gapEnd.x)}" y2="${n(midY + lineOffset)}"/>`,
    );
  } else {
    // Vertical wall: window lines are vertical, offset horizontally
    const lineOffset = wallThick * 0.25;
    const midX = (gapStart.x + gapEnd.x) / 2; // same x for vertical walls

    parts.push(
      `<line x1="${n(midX - lineOffset)}" y1="${n(gapStart.y)}" x2="${n(midX - lineOffset)}" y2="${n(gapEnd.y)}"/>`,
    );
    parts.push(
      `<line x1="${n(midX + lineOffset)}" y1="${n(gapStart.y)}" x2="${n(midX + lineOffset)}" y2="${n(gapEnd.y)}"/>`,
    );
  }

  parts.push("</g>");
  return parts.join("\n");
}
