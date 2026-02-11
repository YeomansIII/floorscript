import type { ProjectConfig } from "@floorscript/core";
import { escapeXml, n } from "../svg-document.js";

// Title block dimensions in SVG pixels
const TB_WIDTH = 250;
const TB_HEIGHT = 120;
const TB_MARGIN = 20;
const TB_DIVIDER_Y = 75;

/**
 * Render a title block in the lower-right corner of the SVG.
 */
export function renderTitleBlock(
  project: ProjectConfig,
  svgWidth: number,
  svgHeight: number,
): string {
  const x = svgWidth - TB_WIDTH - TB_MARGIN;
  const y = svgHeight - TB_HEIGHT - TB_MARGIN;

  const parts: string[] = [];
  parts.push(`<g class="title-block">`);

  // Border rectangle
  parts.push(
    `<rect x="${n(x)}" y="${n(y)}" width="${TB_WIDTH}" height="${TB_HEIGHT}" fill="white" stroke="#000" stroke-width="0.35mm"/>`,
  );

  // Divider line
  parts.push(
    `<line x1="${n(x)}" y1="${n(y + TB_DIVIDER_Y)}" x2="${n(x + TB_WIDTH)}" y2="${n(y + TB_DIVIDER_Y)}" stroke="#000" stroke-width="0.25mm"/>`,
  );

  // Top section: project info
  let textY = y + 20;
  parts.push(
    `<text x="${n(x + 10)}" y="${n(textY)}" class="label" font-size="14" font-weight="bold">${escapeXml(project.title)}</text>`,
  );

  if (project.address) {
    textY += 18;
    parts.push(
      `<text x="${n(x + 10)}" y="${n(textY)}" class="label" font-size="10">${escapeXml(project.address)}</text>`,
    );
  }

  if (project.owner) {
    textY += 16;
    parts.push(
      `<text x="${n(x + 10)}" y="${n(textY)}" class="label" font-size="10">${escapeXml(project.owner)}</text>`,
    );
  }

  // Bottom section: sheet info
  const bottomY = y + TB_DIVIDER_Y;

  if (project.sheet) {
    parts.push(
      `<text x="${n(x + 10)}" y="${n(bottomY + 18)}" class="label" font-size="9">Sheet: ${escapeXml(project.sheet)}</text>`,
    );
  }

  if (project.date) {
    parts.push(
      `<text x="${n(x + 135)}" y="${n(bottomY + 18)}" class="label" font-size="9">Date: ${escapeXml(project.date)}</text>`,
    );
  }

  if (project.scale) {
    parts.push(
      `<text x="${n(x + 10)}" y="${n(bottomY + 33)}" class="label" font-size="9">Scale: ${escapeXml(project.scale)}</text>`,
    );
  }

  parts.push(
    `<text x="${n(x + 10)}" y="${n(bottomY + 43)}" class="label" font-size="8" fill="#666">Drawn by: FloorScript v0.1</text>`,
  );

  parts.push("</g>");
  return parts.join("\n");
}
