import type { ResolvedOpening } from "@floorscript/core";
import { toSvg, scaleValue, type TransformContext } from "../coordinate-transform.js";
import { n } from "../svg-document.js";

/**
 * Render a door symbol.
 * Standard door: line (door leaf) + quarter-circle arc (swing path).
 * Cased opening: just the gap, no symbol.
 */
export function renderDoor(
  opening: ResolvedOpening,
  ctx: TransformContext,
): string {
  if (opening.style === "cased-opening") {
    return renderCasedOpening(opening, ctx);
  }

  return renderStandardDoor(opening, ctx);
}

function renderStandardDoor(
  opening: ResolvedOpening,
  ctx: TransformContext,
): string {
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
      // Horizontal wall at bottom
      if (isRight) {
        // Hinge on right side of opening
        hingePoint = toSvg(opening.gapEnd, ctx);
        arcEndPoint = toSvg(opening.gapStart, ctx);
      } else {
        hingePoint = toSvg(opening.gapStart, ctx);
        arcEndPoint = toSvg(opening.gapEnd, ctx);
      }
      if (isInward) {
        // Swings up (into room = toward positive Y = SVG negative Y)
        doorEndPoint = {
          x: hingePoint.x,
          y: hingePoint.y - doorWidth,
        };
        sweepFlag = isRight ? 1 : 0;
      } else {
        doorEndPoint = {
          x: hingePoint.x,
          y: hingePoint.y + doorWidth,
        };
        sweepFlag = isRight ? 0 : 1;
      }
      break;
    }
    case "north": {
      // Horizontal wall at top
      if (isRight) {
        hingePoint = toSvg(opening.gapEnd, ctx);
        arcEndPoint = toSvg(opening.gapStart, ctx);
      } else {
        hingePoint = toSvg(opening.gapStart, ctx);
        arcEndPoint = toSvg(opening.gapEnd, ctx);
      }
      if (isInward) {
        // Swings down (into room = toward negative Y = SVG positive Y)
        doorEndPoint = {
          x: hingePoint.x,
          y: hingePoint.y + doorWidth,
        };
        sweepFlag = isRight ? 0 : 1;
      } else {
        doorEndPoint = {
          x: hingePoint.x,
          y: hingePoint.y - doorWidth,
        };
        sweepFlag = isRight ? 1 : 0;
      }
      break;
    }
    case "west": {
      // Vertical wall on left
      if (isRight) {
        // "Right" when facing from outside (left) looking east
        hingePoint = toSvg(opening.gapEnd, ctx);
        arcEndPoint = toSvg(opening.gapStart, ctx);
      } else {
        hingePoint = toSvg(opening.gapStart, ctx);
        arcEndPoint = toSvg(opening.gapEnd, ctx);
      }
      if (isInward) {
        // Swings right (into room = toward positive X)
        doorEndPoint = {
          x: hingePoint.x + doorWidth,
          y: hingePoint.y,
        };
        sweepFlag = isRight ? 1 : 0;
      } else {
        doorEndPoint = {
          x: hingePoint.x - doorWidth,
          y: hingePoint.y,
        };
        sweepFlag = isRight ? 0 : 1;
      }
      break;
    }
    case "east": {
      // Vertical wall on right
      if (isRight) {
        hingePoint = toSvg(opening.gapEnd, ctx);
        arcEndPoint = toSvg(opening.gapStart, ctx);
      } else {
        hingePoint = toSvg(opening.gapStart, ctx);
        arcEndPoint = toSvg(opening.gapEnd, ctx);
      }
      if (isInward) {
        // Swings left (into room = toward negative X)
        doorEndPoint = {
          x: hingePoint.x - doorWidth,
          y: hingePoint.y,
        };
        sweepFlag = isRight ? 0 : 1;
      } else {
        doorEndPoint = {
          x: hingePoint.x + doorWidth,
          y: hingePoint.y,
        };
        sweepFlag = isRight ? 1 : 0;
      }
      break;
    }
  }

  const parts: string[] = [];
  parts.push(`<g class="opening door">`);

  // Door leaf line
  parts.push(
    `<line x1="${n(hingePoint.x)}" y1="${n(hingePoint.y)}" x2="${n(doorEndPoint.x)}" y2="${n(doorEndPoint.y)}"/>`,
  );

  // Swing arc from door end to arc end (where it rests against the wall)
  parts.push(
    `<path d="M ${n(doorEndPoint.x)},${n(doorEndPoint.y)} A ${n(doorWidth)},${n(doorWidth)} 0 0,${sweepFlag} ${n(arcEndPoint.x)},${n(arcEndPoint.y)}" fill="none"/>`,
  );

  parts.push("</g>");
  return parts.join("\n");
}

function renderCasedOpening(
  opening: ResolvedOpening,
  ctx: TransformContext,
): string {
  // Cased opening: thin lines at opening edges perpendicular to wall
  const gapStart = toSvg(opening.gapStart, ctx);
  const gapEnd = toSvg(opening.gapEnd, ctx);
  const tickLen = scaleValue(opening.wallThickness, ctx);

  const parts: string[] = [];
  parts.push(`<g class="opening cased-opening">`);

  const dir = opening.wallDirection;
  if (dir === "south" || dir === "north") {
    // Horizontal wall: tick marks are vertical
    parts.push(
      `<line x1="${n(gapStart.x)}" y1="${n(gapStart.y - tickLen / 2)}" x2="${n(gapStart.x)}" y2="${n(gapStart.y + tickLen / 2)}"/>`,
    );
    parts.push(
      `<line x1="${n(gapEnd.x)}" y1="${n(gapEnd.y - tickLen / 2)}" x2="${n(gapEnd.x)}" y2="${n(gapEnd.y + tickLen / 2)}"/>`,
    );
  } else {
    // Vertical wall: tick marks are horizontal
    parts.push(
      `<line x1="${n(gapStart.x - tickLen / 2)}" y1="${n(gapStart.y)}" x2="${n(gapStart.x + tickLen / 2)}" y2="${n(gapStart.y)}"/>`,
    );
    parts.push(
      `<line x1="${n(gapEnd.x - tickLen / 2)}" y1="${n(gapEnd.y)}" x2="${n(gapEnd.x + tickLen / 2)}" y2="${n(gapEnd.y)}"/>`,
    );
  }

  parts.push("</g>");
  return parts.join("\n");
}
