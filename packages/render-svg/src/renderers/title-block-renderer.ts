import type { ProjectConfig } from "@floorscript/core";
import { escapeXml, n } from "../svg-document.js";

// Title block dimensions in SVG pixels
const TB_WIDTH = 350;
const TB_HEIGHT = 140;
const TB_MARGIN = 20;
const TB_DIVIDER_Y = 90;

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
    `<rect x="${n(x)}" y="${n(y)}" width="${TB_WIDTH}" height="${TB_HEIGHT}" fill="white" stroke="#000" stroke-width="0.5"/>`,
  );

  // Divider line
  parts.push(
    `<line x1="${n(x)}" y1="${n(y + TB_DIVIDER_Y)}" x2="${n(x + TB_WIDTH)}" y2="${n(y + TB_DIVIDER_Y)}" stroke="#000" stroke-width="0.35"/>`,
  );

  // Top section: project info
  let textY = y + 24;
  parts.push(
    `<text x="${n(x + 12)}" y="${n(textY)}" class="label" font-size="18" font-weight="bold">${escapeXml(project.title)}</text>`,
  );

  if (project.address) {
    textY += 22;
    parts.push(
      `<text x="${n(x + 12)}" y="${n(textY)}" class="label" font-size="13">${escapeXml(project.address)}</text>`,
    );
  }

  if (project.owner) {
    textY += 20;
    parts.push(
      `<text x="${n(x + 12)}" y="${n(textY)}" class="label" font-size="13">${escapeXml(project.owner)}</text>`,
    );
  }

  // Bottom section: sheet info
  const bottomY = y + TB_DIVIDER_Y;

  if (project.sheet) {
    parts.push(
      `<text x="${n(x + 12)}" y="${n(bottomY + 20)}" class="label" font-size="12">Sheet: ${escapeXml(project.sheet)}</text>`,
    );
  }

  if (project.date) {
    parts.push(
      `<text x="${n(x + 185)}" y="${n(bottomY + 20)}" class="label" font-size="12">Date: ${escapeXml(project.date)}</text>`,
    );
  }

  if (project.scale) {
    parts.push(
      `<text x="${n(x + 12)}" y="${n(bottomY + 38)}" class="label" font-size="12">Scale: ${escapeXml(project.scale)}</text>`,
    );
  }

  parts.push(
    `<text x="${n(x + 185)}" y="${n(bottomY + 38)}" class="label" font-size="10" fill="#666">FloorScript v0.1</text>`,
  );

  parts.push("</g>");
  return parts.join("\n");
}
