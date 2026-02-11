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
  .wall-exterior { fill: #000; stroke: none; }
  .wall-interior { fill: #333; stroke: none; }
  .wall-load-bearing { fill: #333; stroke: none; }
  .opening line, .opening path { stroke: #000; stroke-width: 0.35mm; fill: none; }
  .dimension line { stroke: #555; stroke-width: 0.18mm; }
  .label { font-family: 'Helvetica', 'Arial', sans-serif; fill: #000; }
  .title-block .label { font-family: 'Helvetica', 'Arial', sans-serif; fill: #000; }
`;

// Extra SVG height reserved for the title block below the drawing area
const TITLE_BLOCK_RESERVE = 160;

export function renderSvg(
  plan: ResolvedPlan,
  options?: SvgRenderOptions,
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ctx = createTransform(plan, opts.width, opts.margin);

  // Reserve extra height for the title block so it doesn't overlap the drawing
  const totalHeight = opts.showTitleBlock
    ? ctx.svgHeight + TITLE_BLOCK_RESERVE
    : ctx.svgHeight;

  const doc = new SvgDocument(
    { x: 0, y: 0, width: ctx.svgWidth, height: totalHeight },
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

  // Title block — placed at bottom of the extended SVG area
  if (opts.showTitleBlock) {
    doc.addToLayer(
      "title-block",
      renderTitleBlock(plan.project, ctx.svgWidth, totalHeight),
    );
  }

  return doc.toString();
}
