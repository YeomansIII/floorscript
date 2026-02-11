import type { ResolvedPlan } from "@floorscript/core";
import { SvgDocument } from "./svg-document.js";
import { createTransform } from "./coordinate-transform.js";
import { renderWalls } from "./renderers/wall-renderer.js";
import { renderDoor } from "./renderers/door-renderer.js";
import { renderWindow } from "./renderers/window-renderer.js";
import { renderLabel } from "./renderers/label-renderer.js";
import { renderDimension } from "./renderers/dimension-renderer.js";
import { renderTitleBlock } from "./renderers/title-block-renderer.js";

export interface SvgRenderOptions {
  width?: number;
  background?: string;
  margin?: number;
  showDimensions?: boolean;
  showLabels?: boolean;
  showTitleBlock?: boolean;
}

const DEFAULT_OPTIONS: Required<SvgRenderOptions> = {
  width: 1200,
  background: "white",
  margin: 4,
  showDimensions: true,
  showLabels: true,
  showTitleBlock: true,
};

const SVG_STYLE = `
  .wall-exterior { fill: #000; stroke: #000; stroke-width: 0.7mm; }
  .wall-interior { fill: #333; stroke: #333; stroke-width: 0.5mm; }
  .wall-load-bearing { fill: #333; stroke: #333; stroke-width: 0.5mm; }
  .opening line, .opening path { stroke: #000; stroke-width: 0.35mm; fill: none; }
  .dimension line { stroke: #000; stroke-width: 0.18mm; }
  .label { font-family: 'Helvetica', 'Arial', sans-serif; fill: #000; }
  .room-label { font-size: 14px; font-weight: 500; }
  .dim-label { font-size: 10px; }
  .title-block .label { font-family: 'Helvetica', 'Arial', sans-serif; fill: #000; }
`;

export function renderSvg(
  plan: ResolvedPlan,
  options?: SvgRenderOptions,
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ctx = createTransform(plan, opts.width, opts.margin);

  const doc = new SvgDocument(
    { x: 0, y: 0, width: ctx.svgWidth, height: ctx.svgHeight },
    opts.background,
  );

  doc.setStyle(SVG_STYLE);

  // Render rooms (walls + openings)
  for (const room of plan.rooms) {
    doc.addToLayer("structural", renderWalls(room, ctx));

    for (const wall of room.walls) {
      for (const opening of wall.openings) {
        if (opening.type === "door") {
          doc.addToLayer("structural", renderDoor(opening, ctx));
        } else if (opening.type === "window") {
          doc.addToLayer("structural", renderWindow(opening, ctx));
        }
      }
    }
  }

  // Labels
  if (opts.showLabels) {
    for (const room of plan.rooms) {
      doc.addToLayer("labels", renderLabel(room, ctx));
    }
  }

  // Dimensions
  if (opts.showDimensions) {
    for (const dim of plan.dimensions) {
      doc.addToLayer("dimensions", renderDimension(dim, ctx));
    }
  }

  // Title block
  if (opts.showTitleBlock) {
    doc.addToLayer(
      "title-block",
      renderTitleBlock(plan.project, ctx.svgWidth, ctx.svgHeight),
    );
  }

  return doc.toString();
}
