import type { ResolvedOpening } from "@floorscript/core";
import { toSvg, scaleValue, type TransformContext } from "../coordinate-transform.js";
import type { DrawingContext } from "../drawing-context.js";

const OPENING_STYLE = { stroke: "#000", "stroke-width": "0.35mm", fill: "none" };

/**
 * Render a door symbol.
 * Standard door: line (door leaf) + quarter-circle arc (swing path).
 * Cased opening: just the gap, no symbol.
 */
export function renderDoor(
  opening: ResolvedOpening,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  if (opening.style === "cased-opening") {
    renderCasedOpening(opening, ctx, dc);
    return;
  }

  renderStandardDoor(opening, ctx, dc);
}

function renderStandardDoor(
  opening: ResolvedOpening,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const doorWidth = scaleValue(opening.width, ctx);
  const dir = opening.wallDirection;
  const swing = opening.swing ?? "inward-right";

  // Parse swing direction
  const isInward = swing.startsWith("inward");
  const isRight = swing.endsWith("right");

  // Determine hinge point and swing geometry based on wall direction
  let hingePoint: { x: number; y: number };
  let doorEndPoint: { x: number; y: number };
  let arcEndPoint: { x: number; y: number };

  switch (dir) {
    case "south": {
      if (isRight) {
        hingePoint = toSvg(opening.gapEnd, ctx);
        arcEndPoint = toSvg(opening.gapStart, ctx);
      } else {
        hingePoint = toSvg(opening.gapStart, ctx);
        arcEndPoint = toSvg(opening.gapEnd, ctx);
      }
      doorEndPoint = isInward
        ? { x: hingePoint.x, y: hingePoint.y - doorWidth }
        : { x: hingePoint.x, y: hingePoint.y + doorWidth };
      break;
    }
    case "north": {
      if (isRight) {
        hingePoint = toSvg(opening.gapEnd, ctx);
        arcEndPoint = toSvg(opening.gapStart, ctx);
      } else {
        hingePoint = toSvg(opening.gapStart, ctx);
        arcEndPoint = toSvg(opening.gapEnd, ctx);
      }
      doorEndPoint = isInward
        ? { x: hingePoint.x, y: hingePoint.y + doorWidth }
        : { x: hingePoint.x, y: hingePoint.y - doorWidth };
      break;
    }
    case "west": {
      if (isRight) {
        hingePoint = toSvg(opening.gapEnd, ctx);
        arcEndPoint = toSvg(opening.gapStart, ctx);
      } else {
        hingePoint = toSvg(opening.gapStart, ctx);
        arcEndPoint = toSvg(opening.gapEnd, ctx);
      }
      doorEndPoint = isInward
        ? { x: hingePoint.x + doorWidth, y: hingePoint.y }
        : { x: hingePoint.x - doorWidth, y: hingePoint.y };
      break;
    }
    case "east": {
      if (isRight) {
        hingePoint = toSvg(opening.gapEnd, ctx);
        arcEndPoint = toSvg(opening.gapStart, ctx);
      } else {
        hingePoint = toSvg(opening.gapStart, ctx);
        arcEndPoint = toSvg(opening.gapEnd, ctx);
      }
      doorEndPoint = isInward
        ? { x: hingePoint.x - doorWidth, y: hingePoint.y }
        : { x: hingePoint.x + doorWidth, y: hingePoint.y };
      break;
    }
  }

  // Compute sweep flag geometrically via cross product in SVG coordinates.
  // This replaces per-direction sweep assignments and is immune to Y-flip confusion.
  const leafDx = doorEndPoint.x - hingePoint.x;
  const leafDy = doorEndPoint.y - hingePoint.y;
  const swingDx = arcEndPoint.x - hingePoint.x;
  const swingDy = arcEndPoint.y - hingePoint.y;
  const cross = leafDx * swingDy - leafDy * swingDx;
  const sweepFlag: 0 | 1 = cross > 0 ? 1 : 0;

  dc.openGroup({ class: "opening door", ...OPENING_STYLE });

  // Door leaf line
  dc.line(hingePoint.x, hingePoint.y, doorEndPoint.x, doorEndPoint.y);

  // Swing arc from door end to arc end
  dc.arc(doorEndPoint.x, doorEndPoint.y, doorWidth, arcEndPoint.x, arcEndPoint.y, sweepFlag);

  dc.closeGroup();
}

/**
 * Render a cased opening with L-shaped casing marks at each end.
 * The L-marks extend along the wall edge and perpendicular into the wall thickness,
 * making them clearly visible at standard zoom levels.
 */
function renderCasedOpening(
  opening: ResolvedOpening,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const gapStart = toSvg(opening.gapStart, ctx);
  const gapEnd = toSvg(opening.gapEnd, ctx);
  const wallThick = scaleValue(opening.wallThickness, ctx);
  // L-mark arm along the opening = proportional to wall thickness
  const armLen = wallThick * 1.5;

  dc.openGroup({ class: "opening cased-opening", ...OPENING_STYLE });

  const dir = opening.wallDirection;
  if (dir === "south" || dir === "north") {
    // Horizontal wall: L-marks at left and right ends
    // In SVG coords, gapStart.y is the bottom of the wall rect; wall extends upward
    // Left end (gapStart):
    dc.line(gapStart.x, gapStart.y - wallThick, gapStart.x, gapStart.y);
    dc.line(gapStart.x, gapStart.y - wallThick, gapStart.x + armLen, gapStart.y - wallThick);
    dc.line(gapStart.x, gapStart.y, gapStart.x + armLen, gapStart.y);
    // Right end (gapEnd):
    dc.line(gapEnd.x, gapEnd.y - wallThick, gapEnd.x, gapEnd.y);
    dc.line(gapEnd.x, gapEnd.y - wallThick, gapEnd.x - armLen, gapEnd.y - wallThick);
    dc.line(gapEnd.x, gapEnd.y, gapEnd.x - armLen, gapEnd.y);
  } else {
    // Vertical wall: L-marks at top and bottom ends
    // In SVG coords, gapStart.x is the left edge of the wall rect; wall extends rightward
    // Bottom end (gapStart):
    dc.line(gapStart.x, gapStart.y, gapStart.x + wallThick, gapStart.y);
    dc.line(gapStart.x, gapStart.y, gapStart.x, gapStart.y + armLen);
    dc.line(gapStart.x + wallThick, gapStart.y, gapStart.x + wallThick, gapStart.y + armLen);
    // Top end (gapEnd):
    dc.line(gapEnd.x, gapEnd.y, gapEnd.x + wallThick, gapEnd.y);
    dc.line(gapEnd.x, gapEnd.y, gapEnd.x, gapEnd.y - armLen);
    dc.line(gapEnd.x + wallThick, gapEnd.y, gapEnd.x + wallThick, gapEnd.y - armLen);
  }

  dc.closeGroup();
}
