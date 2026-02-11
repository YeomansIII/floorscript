/**
 * Lightweight SVG document builder. No DOM dependency.
 */
export class SvgDocument {
  private defs: string[] = [];
  private layers: Map<string, string[]> = new Map();
  private style: string = "";

  constructor(
    private viewBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    private background: string = "white",
  ) {}

  setStyle(css: string): void {
    this.style = css;
  }

  addDef(svg: string): void {
    this.defs.push(svg);
  }

  addToLayer(layerName: string, svg: string): void {
    if (!this.layers.has(layerName)) {
      this.layers.set(layerName, []);
    }
    this.layers.get(layerName)!.push(svg);
  }

  toString(): string {
    const { x, y, width, height } = this.viewBox;
    const parts: string[] = [];

    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(x)} ${n(y)} ${n(width)} ${n(height)}" width="${n(width)}" height="${n(height)}">`,
    );

    if (this.style) {
      parts.push(`<style>${this.style}</style>`);
    }

    if (this.defs.length > 0) {
      parts.push("<defs>");
      for (const def of this.defs) {
        parts.push(def);
      }
      parts.push("</defs>");
    }

    parts.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="${this.background}"/>`,
    );

    for (const [layerName, elements] of this.layers) {
      parts.push(`<g class="layer-${layerName}">`);
      for (const el of elements) {
        parts.push(el);
      }
      parts.push("</g>");
    }

    parts.push("</svg>");
    return parts.join("\n");
  }
}

/** Round number for clean SVG output */
function n(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Escape XML special characters in text content */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Round a number for SVG attribute output */
export { n };
