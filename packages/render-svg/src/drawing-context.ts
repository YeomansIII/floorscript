/**
 * Abstract drawing interface for rendering primitives.
 * Enables multiple output backends (SVG, PDF) from the same renderer logic.
 */
export interface StyleOpts {
  stroke?: string;
  strokeWidth?: string;
  fill?: string;
  strokeDasharray?: string;
}

export interface TextOpts extends StyleOpts {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAnchor?: "start" | "middle" | "end";
  dominantBaseline?: string;
  transform?: string;
}

export interface DrawingContext {
  line(x1: number, y1: number, x2: number, y2: number, opts?: StyleOpts): void;
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    opts?: StyleOpts,
  ): void;
  text(x: number, y: number, content: string, opts?: TextOpts): void;
  arc(
    startX: number,
    startY: number,
    radius: number,
    endX: number,
    endY: number,
    sweepFlag: 0 | 1,
    opts?: StyleOpts,
    ry?: number,
  ): void;
  circle(cx: number, cy: number, r: number, opts?: StyleOpts): void;
  polyline(points: { x: number; y: number }[], opts?: StyleOpts): void;
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    opts?: StyleOpts,
  ): void;
  openGroup(attrs?: Record<string, string>): void;
  closeGroup(): void;
  getOutput(): string;
}
