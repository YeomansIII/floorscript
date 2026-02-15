import type { ChainSegment, DimensionChain } from "@floorscript/core";
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
const CHAR_WIDTH_RATIO = 0.6;

// Extension line constants in plan units
const EXTENSION_GAP = 0.15;
const EXTENSION_OVERSHOOT = 0.15;

const DIM_TEXT_STYLE = {
  fontFamily: "'Helvetica','Arial',sans-serif",
  fill: "#000",
  stroke: "none",
  textAnchor: "middle" as const,
};

/**
 * Render a chain dimension with extension lines, baseline, tick marks,
 * and per-segment text labels.
 * Handles both single-segment chains (individual room dimensions) and
 * multi-segment chains (building edge dimensions) uniformly.
 * Narrow segments (textFits === false) get text shifted outside.
 */
export function renderChainDimension(
  chain: DimensionChain,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  if (chain.segments.length === 0) return;

  const tickSize = scaleValue(TICK_SIZE_FT, ctx);
  const textOffset = scaleValue(TEXT_OFFSET_FT, ctx);
  const fontSize = scaleValue(FONT_SIZE_FT, ctx);

  dc.openGroup({
    class: "chain-dimension",
    stroke: "#555",
    "stroke-width": "0.18mm",
  });

  if (chain.orientation === "horizontal") {
    renderHorizontalChain(dc, chain, ctx, tickSize, textOffset, fontSize);
  } else {
    renderVerticalChain(dc, chain, ctx, tickSize, textOffset, fontSize);
  }

  dc.closeGroup();
}

/** Estimate text width in SVG pixels */
function estimateTextWidthPx(label: string, fontSize: number): number {
  return label.length * fontSize * CHAR_WIDTH_RATIO;
}

function renderHorizontalChain(
  dc: DrawingContext,
  chain: DimensionChain,
  ctx: TransformContext,
  tickSize: number,
  textOffset: number,
  fontSize: number,
): void {
  const segments = chain.segments;
  const firstFrom = toSvg(segments[0].from, ctx);
  const lastTo = toSvg(segments[segments.length - 1].to, ctx);
  const y = firstFrom.y;

  // Extension line direction: from wall edge toward baseline and past it.
  const sign = chain.offset >= 0 ? 1 : -1;
  const baselineY = segments[0].from.y; // plan coords
  const defaultWallEdgeY = baselineY - chain.offset;
  const extEndY = baselineY + sign * EXTENSION_OVERSHOOT;

  // Collect unique boundary x-coordinates for extension lines
  const boundaryXs: number[] = [segments[0].from.x];
  for (const seg of segments) {
    boundaryXs.push(seg.to.x);
  }

  // Extension lines (perpendicular to baseline at each boundary)
  for (let i = 0; i < boundaryXs.length; i++) {
    const bx = boundaryXs[i];
    const wallEdgeY = chain.extensionWallCoords?.[i] ?? defaultWallEdgeY;
    const extStartY = wallEdgeY + sign * EXTENSION_GAP;
    const start = toSvg({ x: bx, y: extStartY }, ctx);
    const end = toSvg({ x: bx, y: extEndY }, ctx);
    dc.line(start.x, start.y, end.x, end.y);
  }

  // Dimension baseline (continuous across all segments)
  dc.line(firstFrom.x, y, lastTo.x, y);

  // Tick mark at the start of the first segment
  dc.line(
    firstFrom.x - tickSize,
    y + tickSize,
    firstFrom.x + tickSize,
    y - tickSize,
  );

  for (const segment of segments) {
    const from = toSvg(segment.from, ctx);
    const to = toSvg(segment.to, ctx);

    // Tick mark at the end of each segment
    dc.line(to.x - tickSize, y + tickSize, to.x + tickSize, y - tickSize);

    // Skip label for narrow wall-thickness segments
    if (segment.segmentType === "wall" && !segment.textFits) {
      continue;
    }

    // Text placement
    if (segment.textFits) {
      const midX = (from.x + to.x) / 2;
      dc.text(midX, y - textOffset, segment.label, {
        ...DIM_TEXT_STYLE,
        fontSize,
      });
    } else {
      renderNarrowHorizontalText(dc, segment, to, y, textOffset, fontSize);
    }
  }
}

function renderNarrowHorizontalText(
  dc: DrawingContext,
  segment: ChainSegment,
  to: { x: number; y: number },
  y: number,
  textOffset: number,
  fontSize: number,
): void {
  // Shift text to the right past the segment end
  const textWidth = estimateTextWidthPx(segment.label, fontSize);
  const pad = fontSize * 0.6; // 30% padding on each side
  const textX = to.x + textWidth / 2 + pad;

  dc.text(textX, y - textOffset, segment.label, {
    ...DIM_TEXT_STYLE,
    fontSize,
  });

  // Extend dimension line from segment end to text end
  dc.line(to.x, y, textX + textWidth / 2, y);
}

function renderVerticalChain(
  dc: DrawingContext,
  chain: DimensionChain,
  ctx: TransformContext,
  tickSize: number,
  textOffset: number,
  fontSize: number,
): void {
  const segments = chain.segments;
  const firstFrom = toSvg(segments[0].from, ctx);
  const lastTo = toSvg(segments[segments.length - 1].to, ctx);
  const x = firstFrom.x;

  // Extension line direction: from wall edge toward baseline and past it.
  const sign = chain.offset >= 0 ? 1 : -1;
  const baselineX = segments[0].from.x; // plan coords
  const defaultWallEdgeX = baselineX - chain.offset;
  const extEndX = baselineX + sign * EXTENSION_OVERSHOOT;

  // Collect unique boundary y-coordinates for extension lines
  const boundaryYs: number[] = [segments[0].from.y];
  for (const seg of segments) {
    boundaryYs.push(seg.to.y);
  }

  // Extension lines (perpendicular to baseline at each boundary)
  for (let i = 0; i < boundaryYs.length; i++) {
    const by = boundaryYs[i];
    const wallEdgeX = chain.extensionWallCoords?.[i] ?? defaultWallEdgeX;
    const extStartX = wallEdgeX + sign * EXTENSION_GAP;
    const start = toSvg({ x: extStartX, y: by }, ctx);
    const end = toSvg({ x: extEndX, y: by }, ctx);
    dc.line(start.x, start.y, end.x, end.y);
  }

  // Dimension baseline (continuous across all segments)
  dc.line(x, firstFrom.y, x, lastTo.y);

  // Tick mark at the start of the first segment
  dc.line(
    x - tickSize,
    firstFrom.y + tickSize,
    x + tickSize,
    firstFrom.y - tickSize,
  );

  for (const segment of segments) {
    const from = toSvg(segment.from, ctx);
    const to = toSvg(segment.to, ctx);

    // Tick mark at the end of each segment
    dc.line(x - tickSize, to.y + tickSize, x + tickSize, to.y - tickSize);

    // Skip label for narrow wall-thickness segments
    if (segment.segmentType === "wall" && !segment.textFits) {
      continue;
    }

    // Text placement
    if (segment.textFits) {
      const midY = (from.y + to.y) / 2;
      dc.text(x - textOffset, midY, segment.label, {
        ...DIM_TEXT_STYLE,
        fontSize,
        transform: `rotate(-90, ${n(x - textOffset)}, ${n(midY)})`,
      });
    } else {
      renderNarrowVerticalText(dc, segment, to, x, textOffset, fontSize);
    }
  }
}

function renderNarrowVerticalText(
  dc: DrawingContext,
  segment: ChainSegment,
  to: { x: number; y: number },
  x: number,
  textOffset: number,
  fontSize: number,
): void {
  // In SVG coords, Y increases downward. Shift text below the segment end.
  const textWidth = estimateTextWidthPx(segment.label, fontSize);
  const pad = fontSize * 0.6;
  const textY = to.y + textWidth / 2 + pad;
  const textX = x - textOffset;

  dc.text(textX, textY, segment.label, {
    ...DIM_TEXT_STYLE,
    fontSize,
    transform: `rotate(-90, ${n(textX)}, ${n(textY)})`,
  });

  // Extend dimension line from segment end to text end
  dc.line(x, to.y, x, textY + textWidth / 2);
}
