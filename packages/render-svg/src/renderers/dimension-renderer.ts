import type { ResolvedDimension } from "@floorscript/core";
import { toSvg, scaleValue, type TransformContext } from "../coordinate-transform.js";
import { escapeXml, n } from "../svg-document.js";

// Tick mark half-length in SVG pixels
const TICK_SIZE = 4;
// Extension line overshoot past dimension line in SVG pixels
const EXT_OVERSHOOT = 3;
// Text offset above dimension line in SVG pixels
const TEXT_OFFSET = 6;

/**
 * Render a dimension with extension lines, tick marks, and text.
 */
export function renderDimension(
  dim: ResolvedDimension,
  ctx: TransformContext,
): string {
  const from = toSvg(dim.from, ctx);
  const to = toSvg(dim.to, ctx);

  const parts: string[] = [];
  parts.push(`<g class="dimension">`);

  if (dim.orientation === "horizontal") {
    renderHorizontalDimension(parts, from, to, dim, ctx);
  } else {
    renderVerticalDimension(parts, from, to, dim, ctx);
  }

  parts.push("</g>");
  return parts.join("\n");
}

function renderHorizontalDimension(
  parts: string[],
  from: { x: number; y: number },
  to: { x: number; y: number },
  dim: ResolvedDimension,
  _ctx: TransformContext,
): void {
  const y = from.y; // same y for horizontal dim (already transformed)

  // Extension lines (vertical from measured points to dimension line)
  // For a dimension below the plan, from.y is below the plan in SVG coords
  const extTop = y - EXT_OVERSHOOT;
  const extBottom = y + EXT_OVERSHOOT;

  // We don't draw extension lines from the wall to the dim line for auto-dims
  // since the dim points are already at the offset position.
  // Just draw small ticks at each end.

  // Dimension line
  parts.push(
    `<line x1="${n(from.x)}" y1="${n(y)}" x2="${n(to.x)}" y2="${n(y)}"/>`,
  );

  // Tick marks (45-degree slashes)
  parts.push(
    `<line x1="${n(from.x - TICK_SIZE)}" y1="${n(y + TICK_SIZE)}" x2="${n(from.x + TICK_SIZE)}" y2="${n(y - TICK_SIZE)}"/>`,
  );
  parts.push(
    `<line x1="${n(to.x - TICK_SIZE)}" y1="${n(y + TICK_SIZE)}" x2="${n(to.x + TICK_SIZE)}" y2="${n(y - TICK_SIZE)}"/>`,
  );

  // Text centered above the dimension line
  const midX = (from.x + to.x) / 2;
  parts.push(
    `<text x="${n(midX)}" y="${n(y - TEXT_OFFSET)}" class="label dim-label" text-anchor="middle">${escapeXml(dim.label)}</text>`,
  );
}

function renderVerticalDimension(
  parts: string[],
  from: { x: number; y: number },
  to: { x: number; y: number },
  dim: ResolvedDimension,
  _ctx: TransformContext,
): void {
  const x = from.x; // same x for vertical dim

  // Dimension line
  parts.push(
    `<line x1="${n(x)}" y1="${n(from.y)}" x2="${n(x)}" y2="${n(to.y)}"/>`,
  );

  // Tick marks (45-degree slashes)
  parts.push(
    `<line x1="${n(x - TICK_SIZE)}" y1="${n(from.y + TICK_SIZE)}" x2="${n(x + TICK_SIZE)}" y2="${n(from.y - TICK_SIZE)}"/>`,
  );
  parts.push(
    `<line x1="${n(x - TICK_SIZE)}" y1="${n(to.y + TICK_SIZE)}" x2="${n(x + TICK_SIZE)}" y2="${n(to.y - TICK_SIZE)}"/>`,
  );

  // Text centered beside the dimension line, rotated
  const midY = (from.y + to.y) / 2;
  parts.push(
    `<text x="${n(x - TEXT_OFFSET)}" y="${n(midY)}" class="label dim-label" text-anchor="middle" transform="rotate(-90, ${n(x - TEXT_OFFSET)}, ${n(midY)})">${escapeXml(dim.label)}</text>`,
  );
}
