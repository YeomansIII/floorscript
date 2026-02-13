import type { ResolvedDimension } from "@floorscript/core";
import {
  scaleValue,
  type TransformContext,
  toSvg,
} from "../coordinate-transform.js";
import type { DrawingContext } from "../drawing-context.js";
import { n } from "../utils.js";

// Dimension element sizes in plan units (feet/meters)
const TICK_SIZE_FT = 0.15;
const TEXT_OFFSET_FT = 0.25;
const FONT_SIZE_FT = 0.35;

const DIM_TEXT_STYLE = {
  fontFamily: "'Helvetica','Arial',sans-serif",
  fill: "#000",
  stroke: "none",
  textAnchor: "middle" as const,
};

/**
 * Render a dimension with extension lines, tick marks, and text.
 */
export function renderDimension(
  dim: ResolvedDimension,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const from = toSvg(dim.from, ctx);
  const to = toSvg(dim.to, ctx);

  const tickSize = scaleValue(TICK_SIZE_FT, ctx);
  const textOffset = scaleValue(TEXT_OFFSET_FT, ctx);
  const fontSize = scaleValue(FONT_SIZE_FT, ctx);

  dc.openGroup({
    class: "dimension",
    stroke: "#555",
    "stroke-width": "0.18mm",
  });

  if (dim.orientation === "horizontal") {
    renderHorizontalDimension(
      dc,
      from,
      to,
      dim,
      tickSize,
      textOffset,
      fontSize,
    );
  } else {
    renderVerticalDimension(dc, from, to, dim, tickSize, textOffset, fontSize);
  }

  dc.closeGroup();
}

function renderHorizontalDimension(
  dc: DrawingContext,
  from: { x: number; y: number },
  to: { x: number; y: number },
  dim: ResolvedDimension,
  tickSize: number,
  textOffset: number,
  fontSize: number,
): void {
  const y = from.y;

  // Dimension line
  dc.line(from.x, y, to.x, y);

  // Tick marks (45-degree slashes)
  dc.line(from.x - tickSize, y + tickSize, from.x + tickSize, y - tickSize);
  dc.line(to.x - tickSize, y + tickSize, to.x + tickSize, y - tickSize);

  // Text centered above the dimension line
  const midX = (from.x + to.x) / 2;
  dc.text(midX, y - textOffset, dim.label, { ...DIM_TEXT_STYLE, fontSize });
}

function renderVerticalDimension(
  dc: DrawingContext,
  from: { x: number; y: number },
  to: { x: number; y: number },
  dim: ResolvedDimension,
  tickSize: number,
  textOffset: number,
  fontSize: number,
): void {
  const x = from.x;

  // Dimension line
  dc.line(x, from.y, x, to.y);

  // Tick marks (45-degree slashes)
  dc.line(x - tickSize, from.y + tickSize, x + tickSize, from.y - tickSize);
  dc.line(x - tickSize, to.y + tickSize, x + tickSize, to.y - tickSize);

  // Text centered beside the dimension line, rotated
  const midY = (from.y + to.y) / 2;
  dc.text(x - textOffset, midY, dim.label, {
    ...DIM_TEXT_STYLE,
    fontSize,
    transform: `rotate(-90, ${n(x - textOffset)}, ${n(midY)})`,
  });
}
