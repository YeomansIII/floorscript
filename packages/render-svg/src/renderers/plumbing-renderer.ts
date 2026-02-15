import type {
  ResolvedDrainRun,
  ResolvedPlumbing,
  ResolvedPlumbingFixture,
  ResolvedSupplyRun,
  ResolvedValve,
  ResolvedWaterHeater,
} from "@floorscript/core";
import {
  scaleValue,
  type TransformContext,
  toSvg,
} from "../coordinate-transform.js";
import type { DrawingContext } from "../drawing-context.js";

const FIXTURE_STYLE = { stroke: "#000", strokeWidth: "0.3mm", fill: "none" };
const SUPPLY_HOT_STYLE = {
  stroke: "#CC0000",
  strokeWidth: "0.4mm",
  fill: "none",
};
const SUPPLY_COLD_STYLE = {
  stroke: "#0000CC",
  strokeWidth: "0.4mm",
  fill: "none",
};
const DRAIN_STYLE = { stroke: "#006600", strokeWidth: "0.5mm", fill: "none" };

/**
 * Render all plumbing elements into the drawing context.
 */
export function renderPlumbing(
  plumbing: ResolvedPlumbing,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  dc.openGroup({ class: "plumbing" });

  // Render runs first (behind fixtures)
  for (const run of plumbing.supplyRuns) {
    renderSupplyRun(run, ctx, dc);
  }
  for (const run of plumbing.drainRuns) {
    renderDrainRun(run, ctx, dc);
  }

  // Fixtures
  for (const fixture of plumbing.fixtures) {
    renderPlumbingFixture(fixture, ctx, dc);
  }

  // Valves
  for (const valve of plumbing.valves) {
    renderValve(valve, ctx, dc);
  }

  // Water heater
  if (plumbing.waterHeater) {
    renderWaterHeater(plumbing.waterHeater, ctx, dc);
  }

  dc.closeGroup();
}

/**
 * Get SVG rotation angle for a fixture based on its plan orientation.
 * Default drawing orientation is "facing-south" in plan coordinates:
 *   tank at pos.y - d/2 (smaller SVG Y = north in plan),
 *   bowl at pos.y + d*0.1 (larger SVG Y = south in plan).
 * So facing-north needs 180° to flip the drawing.
 */
function getRotationAngle(orientation?: string): number {
  switch (orientation) {
    case "facing-north":
      return 180;
    case "facing-east":
      return -90;
    case "facing-west":
      return 90;
    default:
      return 0;
  }
}

function renderPlumbingFixture(
  fixture: ResolvedPlumbingFixture,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const pos = toSvg(fixture.position, ctx);
  const defaultSize = scaleValue(1.5, ctx); // 1.5ft default
  const w = fixture.width ? scaleValue(fixture.width, ctx) : defaultSize;
  const d = fixture.depth ? scaleValue(fixture.depth, ctx) : defaultSize * 0.7;

  const rotation = getRotationAngle(fixture.orientation);
  const groupAttrs: Record<string, string> = {
    class: `plumbing-fixture fixture-${fixture.fixtureType}`,
  };
  if (rotation !== 0) {
    groupAttrs.transform = `rotate(${rotation}, ${pos.x}, ${pos.y})`;
  }
  dc.openGroup(groupAttrs);

  switch (fixture.fixtureType) {
    case "kitchen-sink": {
      // Rectangle with vertical dividing line (double basin)
      dc.rect(pos.x - w / 2, pos.y - d / 2, w, d, FIXTURE_STYLE);
      dc.line(pos.x, pos.y - d / 2, pos.x, pos.y + d / 2, FIXTURE_STYLE);
      break;
    }
    case "bath-sink": {
      // Ellipse shape
      dc.ellipse(pos.x, pos.y, w / 2, d / 2, FIXTURE_STYLE);
      break;
    }
    case "toilet": {
      // Elongated ellipse (bowl) connected to small rectangle (tank)
      const bowlRx = w / 2;
      const bowlRy = d * 0.4;
      const tankH = d * 0.25;
      // Tank at top
      dc.rect(
        pos.x - bowlRx * 0.8,
        pos.y - d / 2,
        bowlRx * 1.6,
        tankH,
        FIXTURE_STYLE,
      );
      // Bowl below tank
      dc.ellipse(pos.x, pos.y + d * 0.1, bowlRx, bowlRy, FIXTURE_STYLE);
      break;
    }
    case "shower": {
      // Square with small circle (drain) at center
      dc.rect(pos.x - w / 2, pos.y - w / 2, w, w, FIXTURE_STYLE);
      dc.circle(pos.x, pos.y, scaleValue(0.1, ctx), FIXTURE_STYLE);
      break;
    }
    case "bathtub": {
      // Rectangle with one rounded end (arc at bottom).
      // Cap arc radius so the rectangular body is at least 60% of depth.
      const arcR = Math.min(w / 2, d * 0.4);
      const bodyH = d - arcR;
      dc.rect(pos.x - w / 2, pos.y - d / 2, w, bodyH, FIXTURE_STYLE);
      // Rounded bottom end (elliptical: rx spans tub width, ry controls curve depth)
      dc.arc(
        pos.x - w / 2,
        pos.y - d / 2 + bodyH,
        w / 2,
        pos.x + w / 2,
        pos.y - d / 2 + bodyH,
        1,
        FIXTURE_STYLE,
        arcR,
      );
      // Connect sides to arc
      dc.line(
        pos.x - w / 2,
        pos.y - d / 2,
        pos.x - w / 2,
        pos.y - d / 2 + bodyH,
        FIXTURE_STYLE,
      );
      dc.line(
        pos.x + w / 2,
        pos.y - d / 2,
        pos.x + w / 2,
        pos.y - d / 2 + bodyH,
        FIXTURE_STYLE,
      );
      break;
    }
    case "dishwasher": {
      renderLabeledSquare(pos, w, "DW", ctx, dc);
      break;
    }
    case "washing-machine": {
      renderLabeledSquare(pos, w, "WM", ctx, dc);
      break;
    }
    case "water-heater": {
      // Circle with "WH" text
      const r = w / 2;
      dc.circle(pos.x, pos.y, r, FIXTURE_STYLE);
      dc.text(pos.x, pos.y, "WH", {
        fontSize: r * 0.9,
        textAnchor: "middle",
        dominantBaseline: "central",
        fontFamily: "sans-serif",
        fontWeight: "bold",
        fill: "#000",
      });
      break;
    }
    case "utility-sink": {
      renderLabeledRect(pos, w, d, "US", ctx, dc);
      break;
    }
    case "hose-bib": {
      // Triangle with "HB" text
      const r = w / 2;
      dc.polyline(
        [
          { x: pos.x, y: pos.y - r },
          { x: pos.x + r, y: pos.y + r * 0.7 },
          { x: pos.x - r, y: pos.y + r * 0.7 },
          { x: pos.x, y: pos.y - r },
        ],
        FIXTURE_STYLE,
      );
      dc.text(pos.x, pos.y + r * 0.15, "HB", {
        fontSize: r * 0.7,
        textAnchor: "middle",
        dominantBaseline: "central",
        fontFamily: "sans-serif",
        fill: "#000",
      });
      break;
    }
  }

  dc.closeGroup();
}

function renderLabeledSquare(
  pos: { x: number; y: number },
  size: number,
  label: string,
  _ctx: TransformContext,
  dc: DrawingContext,
): void {
  dc.rect(pos.x - size / 2, pos.y - size / 2, size, size, FIXTURE_STYLE);
  dc.text(pos.x, pos.y, label, {
    fontSize: size * 0.35,
    textAnchor: "middle",
    dominantBaseline: "central",
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fill: "#000",
  });
}

function renderLabeledRect(
  pos: { x: number; y: number },
  w: number,
  h: number,
  label: string,
  _ctx: TransformContext,
  dc: DrawingContext,
): void {
  dc.rect(pos.x - w / 2, pos.y - h / 2, w, h, FIXTURE_STYLE);
  dc.text(pos.x, pos.y, label, {
    fontSize: Math.min(w, h) * 0.35,
    textAnchor: "middle",
    dominantBaseline: "central",
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fill: "#000",
  });
}

function renderSupplyRun(
  run: ResolvedSupplyRun,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  if (run.path.length < 2) return;

  const svgPoints = run.path.map((p) => toSvg(p, ctx));
  const style = run.supplyType === "hot" ? SUPPLY_HOT_STYLE : SUPPLY_COLD_STYLE;

  dc.polyline(svgPoints, style);

  // Size annotation at midpoint
  if (run.size && run.path.length >= 2) {
    const midIdx = Math.floor(run.path.length / 2);
    const midPoint = svgPoints[midIdx];
    dc.text(midPoint.x + scaleValue(0.15, ctx), midPoint.y, run.size, {
      fontSize: scaleValue(0.15, ctx),
      textAnchor: "start",
      dominantBaseline: "central",
      fontFamily: "sans-serif",
      fill: style.stroke,
    });
  }
}

function renderDrainRun(
  run: ResolvedDrainRun,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  if (run.path.length < 2) return;

  const svgPoints = run.path.map((p) => toSvg(p, ctx));
  dc.polyline(svgPoints, DRAIN_STYLE);

  // Slope annotation at midpoint
  if (run.slope && run.path.length >= 2) {
    const midIdx = Math.floor(run.path.length / 2);
    const midPoint = svgPoints[midIdx];
    dc.text(midPoint.x + scaleValue(0.15, ctx), midPoint.y, run.slope, {
      fontSize: scaleValue(0.15, ctx),
      textAnchor: "start",
      dominantBaseline: "central",
      fontFamily: "sans-serif",
      fill: DRAIN_STYLE.stroke,
    });
  }
}

function renderValve(
  valve: ResolvedValve,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const pos = toSvg(valve.position, ctx);
  const size = scaleValue(0.2, ctx);

  dc.openGroup({ class: `valve valve-${valve.valveType}` });

  // Diamond shape (rotated square)
  dc.polyline(
    [
      { x: pos.x, y: pos.y - size },
      { x: pos.x + size, y: pos.y },
      { x: pos.x, y: pos.y + size },
      { x: pos.x - size, y: pos.y },
      { x: pos.x, y: pos.y - size },
    ],
    {
      stroke: "#000",
      strokeWidth: "0.3mm",
      fill: valve.valveType === "shutoff" ? "#000" : "none",
    },
  );

  if (valve.valveType === "pressure-regulator") {
    dc.text(pos.x, pos.y, "PR", {
      fontSize: size * 0.8,
      textAnchor: "middle",
      dominantBaseline: "central",
      fontFamily: "sans-serif",
      fill: "#000",
    });
  } else if (valve.valveType === "check") {
    // Arrow pointing right inside diamond
    dc.polyline(
      [
        { x: pos.x - size * 0.3, y: pos.y - size * 0.3 },
        { x: pos.x + size * 0.3, y: pos.y },
        { x: pos.x - size * 0.3, y: pos.y + size * 0.3 },
      ],
      { stroke: "#000", strokeWidth: "0.2mm", fill: "none" },
    );
  }

  dc.closeGroup();
}

function renderWaterHeater(
  heater: ResolvedWaterHeater,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const pos = toSvg(heater.position, ctx);
  const r = scaleValue(0.75, ctx); // 0.75ft radius

  dc.openGroup({ class: "water-heater" });

  dc.circle(pos.x, pos.y, r, FIXTURE_STYLE);

  dc.text(pos.x, pos.y, "WH", {
    fontSize: r * 0.8,
    textAnchor: "middle",
    dominantBaseline: "central",
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fill: "#000",
  });

  if (heater.capacity) {
    dc.text(pos.x, pos.y + r + scaleValue(0.15, ctx), heater.capacity, {
      fontSize: r * 0.4,
      textAnchor: "middle",
      dominantBaseline: "hanging",
      fontFamily: "sans-serif",
      fill: "#666",
    });
  }

  dc.closeGroup();
}
