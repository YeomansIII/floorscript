import type { Point, Rect } from "../types/geometry.js";

/**
 * Compute the composite outline of a room with extensions and enclosures.
 *
 * Uses coordinate-compression grid approach:
 * 1. Collect unique X/Y coordinates from all rectangles
 * 2. Mark grid cells as inside (parent + extensions - enclosures)
 * 3. Collect directed boundary edges (CCW winding)
 * 4. Chain edges into a polygon and remove collinear vertices
 *
 * @returns Point[] in counterclockwise winding order (Y-up), or empty if degenerate
 */
export function computeCompositeOutline(
  parentRect: Rect,
  extensionRects: Rect[],
  enclosureRects: Rect[],
): Point[] {
  if (parentRect.width <= 0 || parentRect.height <= 0) return [];

  // 1. Collect all unique X and Y coordinates
  const allRects = [parentRect, ...extensionRects, ...enclosureRects];
  const xSet = new Set<number>();
  const ySet = new Set<number>();

  for (const r of allRects) {
    xSet.add(round(r.x));
    xSet.add(round(r.x + r.width));
    ySet.add(round(r.y));
    ySet.add(round(r.y + r.height));
  }

  const xs = Array.from(xSet).sort((a, b) => a - b);
  const ys = Array.from(ySet).sort((a, b) => a - b);

  if (xs.length < 2 || ys.length < 2) return [];

  const cols = xs.length - 1;
  const rows = ys.length - 1;

  // 2. Mark grid cells as inside/outside
  const includeRects = [parentRect, ...extensionRects];
  const grid: boolean[][] = [];

  for (let row = 0; row < rows; row++) {
    grid[row] = [];
    for (let col = 0; col < cols; col++) {
      const cx = (xs[col] + xs[col + 1]) / 2;
      const cy = (ys[row] + ys[row + 1]) / 2;
      const inside =
        includeRects.some((r) => pointInRect(cx, cy, r)) &&
        !enclosureRects.some((r) => pointInRect(cx, cy, r));
      grid[row][col] = inside;
    }
  }

  // 3. Collect directed boundary edges (CCW: inside to the left)
  const edges: Array<{ from: Point; to: Point }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!grid[row][col]) continue;

      // Bottom edge: if cell below is outside
      if (row === 0 || !grid[row - 1][col]) {
        edges.push({
          from: { x: xs[col], y: ys[row] },
          to: { x: xs[col + 1], y: ys[row] },
        });
      }
      // Right edge: if cell to the right is outside
      if (col === cols - 1 || !grid[row][col + 1]) {
        edges.push({
          from: { x: xs[col + 1], y: ys[row] },
          to: { x: xs[col + 1], y: ys[row + 1] },
        });
      }
      // Top edge: if cell above is outside
      if (row === rows - 1 || !grid[row + 1][col]) {
        edges.push({
          from: { x: xs[col + 1], y: ys[row + 1] },
          to: { x: xs[col], y: ys[row + 1] },
        });
      }
      // Left edge: if cell to the left is outside
      if (col === 0 || !grid[row][col - 1]) {
        edges.push({
          from: { x: xs[col], y: ys[row + 1] },
          to: { x: xs[col], y: ys[row] },
        });
      }
    }
  }

  if (edges.length === 0) return [];

  // 4. Chain edges into a polygon
  const edgeMap = new Map<string, Point>();
  for (const e of edges) {
    edgeMap.set(pointKey(e.from), e.to);
  }

  const start = edges[0].from;
  const polygon: Point[] = [start];
  let current = edgeMap.get(pointKey(start))!;

  while (
    current &&
    (round(current.x) !== round(start.x) ||
      round(current.y) !== round(start.y))
  ) {
    polygon.push(current);
    current = edgeMap.get(pointKey(current))!;
  }

  // 5. Remove collinear vertices
  const simplified = removeCollinear(polygon);

  // 6. Rotate so the bottom-left vertex is first
  return rotateToBottomLeft(simplified);
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function pointKey(p: Point): string {
  return `${round(p.x)},${round(p.y)}`;
}

function pointInRect(x: number, y: number, r: Rect): boolean {
  return (
    x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height
  );
}

function removeCollinear(polygon: Point[]): Point[] {
  if (polygon.length <= 3) return polygon;

  const result: Point[] = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];

    // Check if curr is collinear with prev and next
    if (!isCollinear(prev, curr, next)) {
      result.push(curr);
    }
  }

  return result;
}

function isCollinear(a: Point, b: Point, c: Point): boolean {
  // For axis-aligned polygons, collinear means same x or same y
  const sameX =
    Math.abs(a.x - b.x) < 0.001 && Math.abs(b.x - c.x) < 0.001;
  const sameY =
    Math.abs(a.y - b.y) < 0.001 && Math.abs(b.y - c.y) < 0.001;
  return sameX || sameY;
}

function rotateToBottomLeft(polygon: Point[]): Point[] {
  if (polygon.length === 0) return polygon;

  // Find the bottom-left vertex (min y, then min x)
  let minIdx = 0;
  for (let i = 1; i < polygon.length; i++) {
    const p = polygon[i];
    const m = polygon[minIdx];
    if (
      round(p.y) < round(m.y) ||
      (round(p.y) === round(m.y) && round(p.x) < round(m.x))
    ) {
      minIdx = i;
    }
  }

  if (minIdx === 0) return polygon;
  return [...polygon.slice(minIdx), ...polygon.slice(0, minIdx)];
}
