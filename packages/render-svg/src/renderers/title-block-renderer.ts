import type { ProjectConfig } from "@floorscript/core";
import type { DrawingContext } from "../drawing-context.js";

// Reference dimensions at 1200px SVG width
const REFERENCE_WIDTH = 1200;
const BASE_TB_WIDTH = 350;
const BASE_TB_HEIGHT = 140;
const BASE_TB_MARGIN = 20;
const BASE_TB_DIVIDER_Y = 90;

/**
 * Render a title block in the lower-right corner of the SVG.
 * Dimensions scale proportionally with SVG width.
 */
export function renderTitleBlock(
  project: ProjectConfig,
  svgWidth: number,
  svgHeight: number,
  dc: DrawingContext,
): void {
  const s = svgWidth / REFERENCE_WIDTH;

  const tbWidth = BASE_TB_WIDTH * s;
  const tbHeight = BASE_TB_HEIGHT * s;
  const tbMargin = BASE_TB_MARGIN * s;
  const tbDividerY = BASE_TB_DIVIDER_Y * s;

  const x = svgWidth - tbWidth - tbMargin;
  const y = svgHeight - tbHeight - tbMargin;

  dc.openGroup({
    class: "title-block",
    "font-family": "'Helvetica','Arial',sans-serif",
    fill: "#000",
  });

  // Border rectangle
  dc.rect(x, y, tbWidth, tbHeight, {
    fill: "white",
    stroke: "#000",
    strokeWidth: `${(0.5 * s).toFixed(2)}`,
  });

  // Divider line
  dc.line(x, y + tbDividerY, x + tbWidth, y + tbDividerY, {
    stroke: "#000",
    strokeWidth: `${(0.35 * s).toFixed(2)}`,
  });

  // Top section: project info
  let textY = y + 24 * s;
  dc.text(x + 12 * s, textY, project.title, {
    fontSize: 18 * s,
    fontWeight: "bold",
  });

  if (project.address) {
    textY += 22 * s;
    dc.text(x + 12 * s, textY, project.address, { fontSize: 13 * s });
  }

  if (project.owner) {
    textY += 20 * s;
    dc.text(x + 12 * s, textY, project.owner, { fontSize: 13 * s });
  }

  // Bottom section: sheet info
  const bottomY = y + tbDividerY;

  if (project.sheet) {
    dc.text(x + 12 * s, bottomY + 20 * s, `Sheet: ${project.sheet}`, {
      fontSize: 12 * s,
    });
  }

  if (project.date) {
    dc.text(x + 185 * s, bottomY + 20 * s, `Date: ${project.date}`, {
      fontSize: 12 * s,
    });
  }

  if (project.scale) {
    dc.text(x + 12 * s, bottomY + 38 * s, `Scale: ${project.scale}`, {
      fontSize: 12 * s,
    });
  }

  dc.text(x + 185 * s, bottomY + 38 * s, "FloorScript v0.1", {
    fontSize: 10 * s,
    fill: "#666",
  });

  dc.closeGroup();
}
