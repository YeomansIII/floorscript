import type {
  ResolvedElectrical,
  ResolvedElectricalPanel,
  ResolvedElectricalRun,
  ResolvedLightFixture,
  ResolvedOutlet,
  ResolvedSmokeDetector,
  ResolvedSwitch,
} from "@floorscript/core";
import {
  scaleValue,
  type TransformContext,
  toSvg,
} from "../coordinate-transform.js";
import type { DrawingContext } from "../drawing-context.js";

// Symbol size in plan units (feet). ~4 inches radius = 0.35ft.
const SYMBOL_RADIUS_FT = 0.35;

const ELECTRICAL_STYLE = { stroke: "#000", strokeWidth: "0.3mm", fill: "none" };
const RUN_STYLE = { stroke: "#333", strokeWidth: "0.25mm", fill: "none" };

/**
 * Render all electrical elements into the drawing context.
 */
export function renderElectrical(
  electrical: ResolvedElectrical,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  dc.openGroup({ class: "electrical" });

  if (electrical.panel) {
    renderPanel(electrical.panel, ctx, dc);
  }

  for (const run of electrical.runs) {
    renderRun(run, ctx, dc);
  }

  for (const outlet of electrical.outlets) {
    renderOutlet(outlet, ctx, dc);
  }

  for (const sw of electrical.switches) {
    renderSwitch(sw, ctx, dc);
  }

  for (const fixture of electrical.fixtures) {
    renderLightFixture(fixture, ctx, dc);
  }

  for (const detector of electrical.smokeDetectors) {
    renderSmokeDetector(detector, ctx, dc);
  }

  dc.closeGroup();
}

function renderOutlet(
  outlet: ResolvedOutlet,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const pos = toSvg(outlet.position, ctx);
  const r = scaleValue(SYMBOL_RADIUS_FT, ctx);

  dc.openGroup({ class: `outlet outlet-${outlet.outletType}` });

  // Base circle for all outlet types (white fill so it's visible on walls)
  dc.circle(pos.x, pos.y, r, { ...ELECTRICAL_STYLE, fill: "#fff" });

  switch (outlet.outletType) {
    case "duplex": {
      // Two short horizontal lines through the circle
      const lineLen = r * 0.7;
      dc.line(
        pos.x - lineLen,
        pos.y - r * 0.35,
        pos.x + lineLen,
        pos.y - r * 0.35,
        ELECTRICAL_STYLE,
      );
      dc.line(
        pos.x - lineLen,
        pos.y + r * 0.35,
        pos.x + lineLen,
        pos.y + r * 0.35,
        ELECTRICAL_STYLE,
      );
      break;
    }
    case "gfci": {
      // "GFI" text below
      dc.text(pos.x, pos.y + r + scaleValue(0.15, ctx), "GFI", {
        fontSize: r * 0.7,
        textAnchor: "middle",
        dominantBaseline: "hanging",
        fill: "#000",
      });
      break;
    }
    case "240v": {
      // Three short diagonal lines inside circle
      const d = r * 0.5;
      dc.line(pos.x - d, pos.y - d, pos.x + d, pos.y + d, ELECTRICAL_STYLE);
      dc.line(pos.x, pos.y - d, pos.x, pos.y + d, ELECTRICAL_STYLE);
      dc.line(pos.x + d, pos.y - d, pos.x - d, pos.y + d, ELECTRICAL_STYLE);
      break;
    }
    case "dedicated": {
      // Small triangle mark inside upper part of circle
      const t = r * 0.4;
      dc.polyline(
        [
          { x: pos.x - t, y: pos.y },
          { x: pos.x, y: pos.y - t * 1.2 },
          { x: pos.x + t, y: pos.y },
        ],
        ELECTRICAL_STYLE,
      );
      break;
    }
    case "floor": {
      // Circle inside a square
      const sq = r * 1.5;
      dc.rect(pos.x - sq, pos.y - sq, sq * 2, sq * 2, ELECTRICAL_STYLE);
      break;
    }
  }

  dc.closeGroup();
}

function renderSwitch(
  sw: ResolvedSwitch,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const pos = toSvg(sw.position, ctx);
  const r = scaleValue(SYMBOL_RADIUS_FT, ctx);

  dc.openGroup({ class: `switch switch-${sw.switchType}` });

  let label: string;
  switch (sw.switchType) {
    case "single":
      label = "S";
      break;
    case "three-way":
      label = "S3";
      break;
    case "four-way":
      label = "S4";
      break;
    case "dimmer":
      label = "SD";
      break;
  }

  // White background circle so switch label is visible on walls
  dc.circle(pos.x, pos.y, r, {
    stroke: "#000",
    strokeWidth: "0.3mm",
    fill: "#fff",
  });

  dc.text(pos.x, pos.y, label, {
    fontSize: r * 1.1,
    textAnchor: "middle",
    dominantBaseline: "central",
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fill: "#000",
  });

  dc.closeGroup();
}

function renderLightFixture(
  fixture: ResolvedLightFixture,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const pos = toSvg(fixture.position, ctx);
  const r = scaleValue(SYMBOL_RADIUS_FT, ctx);

  dc.openGroup({ class: `light-fixture light-${fixture.fixtureType}` });

  switch (fixture.fixtureType) {
    case "recessed": {
      // Circle inside square
      const sq = r * 1.2;
      dc.rect(pos.x - sq, pos.y - sq, sq * 2, sq * 2, ELECTRICAL_STYLE);
      dc.circle(pos.x, pos.y, r * 0.7, ELECTRICAL_STYLE);
      break;
    }
    case "surface": {
      // Circle with 4 ray lines at 45° angles
      dc.circle(pos.x, pos.y, r, ELECTRICAL_STYLE);
      const ray = r * 1.5;
      const d = ray * Math.SQRT1_2;
      dc.line(
        pos.x - d,
        pos.y - d,
        pos.x - r * Math.SQRT1_2,
        pos.y - r * Math.SQRT1_2,
        ELECTRICAL_STYLE,
      );
      dc.line(
        pos.x + d,
        pos.y - d,
        pos.x + r * Math.SQRT1_2,
        pos.y - r * Math.SQRT1_2,
        ELECTRICAL_STYLE,
      );
      dc.line(
        pos.x - d,
        pos.y + d,
        pos.x - r * Math.SQRT1_2,
        pos.y + r * Math.SQRT1_2,
        ELECTRICAL_STYLE,
      );
      dc.line(
        pos.x + d,
        pos.y + d,
        pos.x + r * Math.SQRT1_2,
        pos.y + r * Math.SQRT1_2,
        ELECTRICAL_STYLE,
      );
      break;
    }
    case "pendant": {
      // Circle with short line extending down
      dc.circle(pos.x, pos.y, r * 0.7, ELECTRICAL_STYLE);
      dc.line(pos.x, pos.y + r * 0.7, pos.x, pos.y + r * 2, ELECTRICAL_STYLE);
      break;
    }
    case "under-cabinet": {
      // Dashed line of specified width
      const w = fixture.width
        ? scaleValue(fixture.width, ctx)
        : scaleValue(2, ctx);
      dc.line(pos.x - w / 2, pos.y, pos.x + w / 2, pos.y, {
        ...ELECTRICAL_STYLE,
        strokeDasharray: "4 2",
      });
      break;
    }
    case "fan": {
      // Circle with 3 blade lines at 120° intervals
      dc.circle(pos.x, pos.y, r, ELECTRICAL_STYLE);
      for (let i = 0; i < 3; i++) {
        const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2;
        const bx = pos.x + Math.cos(angle) * r * 1.6;
        const by = pos.y + Math.sin(angle) * r * 1.6;
        dc.line(
          pos.x + Math.cos(angle) * r,
          pos.y + Math.sin(angle) * r,
          bx,
          by,
          ELECTRICAL_STYLE,
        );
      }
      break;
    }
  }

  dc.closeGroup();
}

function renderSmokeDetector(
  detector: ResolvedSmokeDetector,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const pos = toSvg(detector.position, ctx);
  const r = scaleValue(SYMBOL_RADIUS_FT, ctx);

  dc.openGroup({ class: "smoke-detector" });

  dc.circle(pos.x, pos.y, r, ELECTRICAL_STYLE);

  let label: string;
  switch (detector.detectorType) {
    case "smoke":
      label = "SD";
      break;
    case "co":
      label = "CO";
      break;
    case "combo":
      label = "S/CO";
      break;
  }

  dc.text(pos.x, pos.y, label, {
    fontSize: r * 0.9,
    textAnchor: "middle",
    dominantBaseline: "central",
    fontFamily: "sans-serif",
    fill: "#000",
  });

  dc.closeGroup();
}

function renderPanel(
  panel: ResolvedElectricalPanel,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const pos = toSvg(panel.position, ctx);
  const w = scaleValue(1, ctx); // 1ft wide
  const h = scaleValue(1.5, ctx); // 1.5ft tall

  dc.openGroup({ class: "electrical-panel" });

  dc.rect(pos.x - w / 2, pos.y - h / 2, w, h, {
    stroke: "#000",
    strokeWidth: "0.4mm",
    fill: "#fff",
  });

  dc.text(pos.x, pos.y - h * 0.15, "PANEL", {
    fontSize: w * 0.22,
    textAnchor: "middle",
    dominantBaseline: "central",
    fontFamily: "sans-serif",
    fontWeight: "bold",
    fill: "#000",
  });

  dc.text(pos.x, pos.y + h * 0.2, `${panel.amps}A`, {
    fontSize: w * 0.18,
    textAnchor: "middle",
    dominantBaseline: "central",
    fontFamily: "sans-serif",
    fill: "#000",
  });

  if (panel.label) {
    dc.text(pos.x, pos.y + h / 2 + scaleValue(0.15, ctx), panel.label, {
      fontSize: w * 0.16,
      textAnchor: "middle",
      dominantBaseline: "hanging",
      fontFamily: "sans-serif",
      fill: "#666",
    });
  }

  dc.closeGroup();
}

function renderRun(
  run: ResolvedElectricalRun,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  if (run.path.length < 2) return;

  const svgPoints = run.path.map((p) => toSvg(p, ctx));
  const style = {
    ...RUN_STYLE,
    ...(run.style === "dashed" ? { strokeDasharray: "6 3" } : {}),
  };

  dc.polyline(svgPoints, style);
}
