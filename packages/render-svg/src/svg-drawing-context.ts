import type { DrawingContext, StyleOpts, TextOpts } from "./drawing-context.js";
import { escapeXml, n } from "./utils.js";

/**
 * SVG implementation of DrawingContext.
 * Builds SVG elements as string output.
 */
export class SvgDrawingContext implements DrawingContext {
  private parts: string[] = [];

  line(x1: number, y1: number, x2: number, y2: number, opts?: StyleOpts): void {
    this.parts.push(
      `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"${styleAttrs(opts)}/>`,
    );
  }

  rect(x: number, y: number, width: number, height: number, opts?: StyleOpts): void {
    this.parts.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}"${styleAttrs(opts)}/>`,
    );
  }

  text(x: number, y: number, content: string, opts?: TextOpts): void {
    this.parts.push(
      `<text x="${n(x)}" y="${n(y)}"${textAttrs(opts)}>${escapeXml(content)}</text>`,
    );
  }

  arc(
    startX: number,
    startY: number,
    radius: number,
    endX: number,
    endY: number,
    sweepFlag: 0 | 1,
    opts?: StyleOpts,
  ): void {
    this.parts.push(
      `<path d="M ${n(startX)},${n(startY)} A ${n(radius)},${n(radius)} 0 0,${sweepFlag} ${n(endX)},${n(endY)}"${styleAttrs(opts)}/>`,
    );
  }

  circle(cx: number, cy: number, r: number, opts?: StyleOpts): void {
    this.parts.push(
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"${styleAttrs(opts)}/>`,
    );
  }

  polyline(points: { x: number; y: number }[], opts?: StyleOpts): void {
    const pointsStr = points.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
    this.parts.push(
      `<polyline points="${pointsStr}"${styleAttrs(opts)}/>`,
    );
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, opts?: StyleOpts): void {
    this.parts.push(
      `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${styleAttrs(opts)}/>`,
    );
  }

  openGroup(attrs?: Record<string, string>): void {
    if (!attrs || Object.keys(attrs).length === 0) {
      this.parts.push("<g>");
    } else {
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      this.parts.push(`<g ${attrStr}>`);
    }
  }

  closeGroup(): void {
    this.parts.push("</g>");
  }

  getOutput(): string {
    return this.parts.join("\n");
  }
}

function styleAttrs(opts?: StyleOpts): string {
  if (!opts) return "";
  const attrs: string[] = [];
  if (opts.stroke !== undefined) attrs.push(`stroke="${opts.stroke}"`);
  if (opts.strokeWidth !== undefined) attrs.push(`stroke-width="${opts.strokeWidth}"`);
  if (opts.fill !== undefined) attrs.push(`fill="${opts.fill}"`);
  if (opts.strokeDasharray !== undefined) attrs.push(`stroke-dasharray="${opts.strokeDasharray}"`);
  return attrs.length > 0 ? " " + attrs.join(" ") : "";
}

function textAttrs(opts?: TextOpts): string {
  if (!opts) return "";
  const attrs: string[] = [];
  // Style attrs
  if (opts.stroke !== undefined) attrs.push(`stroke="${opts.stroke}"`);
  if (opts.strokeWidth !== undefined) attrs.push(`stroke-width="${opts.strokeWidth}"`);
  if (opts.fill !== undefined) attrs.push(`fill="${opts.fill}"`);
  // Text-specific attrs
  if (opts.fontFamily !== undefined) attrs.push(`font-family="${opts.fontFamily}"`);
  if (opts.fontSize !== undefined) attrs.push(`font-size="${n(opts.fontSize)}"`);
  if (opts.fontWeight !== undefined) attrs.push(`font-weight="${opts.fontWeight}"`);
  if (opts.textAnchor !== undefined) attrs.push(`text-anchor="${opts.textAnchor}"`);
  if (opts.dominantBaseline !== undefined) attrs.push(`dominant-baseline="${opts.dominantBaseline}"`);
  if (opts.transform !== undefined) attrs.push(`transform="${opts.transform}"`);
  return attrs.length > 0 ? " " + attrs.join(" ") : "";
}
