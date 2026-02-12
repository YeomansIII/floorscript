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
  let sweepFlag: 0 | 1;

  switch (dir) {
    case "south": {
      if (isRight) {
        hingePoint = toSvg(opening.gapEnd, ctx);
        arcEndPoint = toSvg(opening.gapStart, ctx);
      } else {
        hingePoint = toSvg(opening.gapStart, ctx);
        arcEndPoint = toSvg(opening.gapEnd, ctx);
      }
      if (isInward) {
        doorEndPoint = { x: hingePoint.x, y: hingePoint.y - doorWidth };
        sweepFlag = isRight ? 1 : 0;
      } else {
        doorEndPoint = { x: hingePoint.x, y: hingePoint.y + doorWidth };
        sweepFlag = isRight ? 0 : 1;
      }
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
      if (isInward) {
        doorEndPoint = { x: hingePoint.x, y: hingePoint.y + doorWidth };
        sweepFlag = isRight ? 0 : 1;
      } else {
        doorEndPoint = { x: hingePoint.x, y: hingePoint.y - doorWidth };
        sweepFlag = isRight ? 1 : 0;
      }
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
      if (isInward) {
        doorEndPoint = { x: hingePoint.x + doorWidth, y: hingePoint.y };
        sweepFlag = isRight ? 1 : 0;
      } else {
        doorEndPoint = { x: hingePoint.x - doorWidth, y: hingePoint.y };
        sweepFlag = isRight ? 0 : 1;
      }
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
      if (isInward) {
        doorEndPoint = { x: hingePoint.x - doorWidth, y: hingePoint.y };
        sweepFlag = isRight ? 0 : 1;
      } else {
        doorEndPoint = { x: hingePoint.x + doorWidth, y: hingePoint.y };
        sweepFlag = isRight ? 1 : 0;
      }
      break;
    }
  }

  dc.openGroup({ class: "opening door", ...OPENING_STYLE });

  // Door leaf line
  dc.line(hingePoint.x, hingePoint.y, doorEndPoint.x, doorEndPoint.y);

  // Swing arc from door end to arc end
  dc.arc(doorEndPoint.x, doorEndPoint.y, doorWidth, arcEndPoint.x, arcEndPoint.y, sweepFlag);

  dc.closeGroup();
}

function renderCasedOpening(
  opening: ResolvedOpening,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const gapStart = toSvg(opening.gapStart, ctx);
  const gapEnd = toSvg(opening.gapEnd, ctx);
  const tickLen = scaleValue(opening.wallThickness, ctx);

  dc.openGroup({ class: "opening cased-opening", ...OPENING_STYLE });

  const dir = opening.wallDirection;
  if (dir === "south" || dir === "north") {
    dc.line(gapStart.x, gapStart.y - tickLen / 2, gapStart.x, gapStart.y + tickLen / 2);
    dc.line(gapEnd.x, gapEnd.y - tickLen / 2, gapEnd.x, gapEnd.y + tickLen / 2);
  } else {
    dc.line(gapStart.x - tickLen / 2, gapStart.y, gapStart.x + tickLen / 2, gapStart.y);
    dc.line(gapEnd.x - tickLen / 2, gapEnd.y, gapEnd.x + tickLen / 2, gapEnd.y);
  }

  dc.closeGroup();
}
