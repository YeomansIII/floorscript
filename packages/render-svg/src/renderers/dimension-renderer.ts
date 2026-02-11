import type { ResolvedDimension } from "@floorscript/core";
import { toSvg, scaleValue, type TransformContext } from "../coordinate-transform.js";
import { escapeXml, n } from "../svg-document.js";

// Dimension element sizes in plan units (feet/meters)
const TICK_SIZE_FT = 0.15;
const TEXT_OFFSET_FT = 0.25;
const FONT_SIZE_FT = 0.35;

/**
 * Render a dimension with extension lines, tick marks, and text.
 */
export function renderDimension(
  dim: ResolvedDimension,
  ctx: TransformContext,
): string {
  const from = toSvg(dim.from, ctx);
  const to = toSvg(dim.to, ctx);

  const tickSize = scaleValue(TICK_SIZE_FT, ctx);
  const textOffset = scaleValue(TEXT_OFFSET_FT, ctx);
  const fontSize = scaleValue(FONT_SIZE_FT, ctx);

  const parts: string[] = [];
  parts.push(`<g class="dimension">`);

  if (dim.orientation === "horizontal") {
    renderHorizontalDimension(parts, from, to, dim, tickSize, textOffset, fontSize);
  } else {
    renderVerticalDimension(parts, from, to, dim, tickSize, textOffset, fontSize);
  }

  parts.push("</g>");
  return parts.join("\n");
}

function renderHorizontalDimension(
  parts: string[],
  from: { x: number; y: number },
  to: { x: number; y: number },
  dim: ResolvedDimension,
  tickSize: number,
  textOffset: number,
  fontSize: number,
): void {
  const y = from.y;

  // Dimension line
  parts.push(
    `<line x1="${n(from.x)}" y1="${n(y)}" x2="${n(to.x)}" y2="${n(y)}"/>`,
  );

  // Tick marks (45-degree slashes)
  parts.push(
    `<line x1="${n(from.x - tickSize)}" y1="${n(y + tickSize)}" x2="${n(from.x + tickSize)}" y2="${n(y - tickSize)}"/>`,
  );
  parts.push(
    `<line x1="${n(to.x - tickSize)}" y1="${n(y + tickSize)}" x2="${n(to.x + tickSize)}" y2="${n(y - tickSize)}"/>`,
  );

  // Text centered above the dimension line
  const midX = (from.x + to.x) / 2;
  parts.push(
    `<text x="${n(midX)}" y="${n(y - textOffset)}" class="label" font-size="${n(fontSize)}" text-anchor="middle">${escapeXml(dim.label)}</text>`,
  );
}

function renderVerticalDimension(
  parts: string[],
  from: { x: number; y: number },
  to: { x: number; y: number },
  dim: ResolvedDimension,
  tickSize: number,
  textOffset: number,
  fontSize: number,
): void {
  const x = from.x;

  // Dimension line
  parts.push(
    `<line x1="${n(x)}" y1="${n(from.y)}" x2="${n(x)}" y2="${n(to.y)}"/>`,
  );

  // Tick marks (45-degree slashes)
  parts.push(
    `<line x1="${n(x - tickSize)}" y1="${n(from.y + tickSize)}" x2="${n(x + tickSize)}" y2="${n(from.y - tickSize)}"/>`,
  );
  parts.push(
    `<line x1="${n(x - tickSize)}" y1="${n(to.y + tickSize)}" x2="${n(x + tickSize)}" y2="${n(to.y - tickSize)}"/>`,
  );

  // Text centered beside the dimension line, rotated
  const midY = (from.y + to.y) / 2;
  parts.push(
    `<text x="${n(x - textOffset)}" y="${n(midY)}" class="label" font-size="${n(fontSize)}" text-anchor="middle" transform="rotate(-90, ${n(x - textOffset)}, ${n(midY)})">${escapeXml(dim.label)}</text>`,
  );
}
