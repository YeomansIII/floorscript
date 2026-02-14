import type { CardinalDirection } from "../types/config.js";
import type {
  PerimeterChain,
  PerimeterEdge,
  Point,
  Rect,
  WallGraph,
} from "../types/geometry.js";

/**
 * Compute building perimeter edges from the unified wall graph.
 *
 * Collects outer-edges from non-shared, non-enclosure walls
 * (source !== "enclosure" && shared === false), chains them into
 * CCW-wound closed polygons, simplifies collinear vertices,
 * and computes bounds per chain.
 */
export function computePerimeter(wallGraph: WallGraph): PerimeterChain[] {
  // Step 1: Collect directed outer-edges from exterior-facing walls
  const edges: DirectedEdge[] = [];
  for (const wall of wallGraph.walls) {
    // Exclude enclosure walls (interior partitions) and shared walls (between rooms)
    if (wall.source === "enclosure" || wall.shared) continue;

    const edge: DirectedEdge = {
      start: { ...wall.outerEdge.start },
      end: { ...wall.outerEdge.end },
      wallId: wall.id,
      direction: wall.direction,
    };

    // Ensure CCW winding (standard math convention, Y-up):
    // South: left→right, East: bottom→top, North: right→left, West: top→bottom
    switch (wall.direction) {
      case "south":
        // Outer edge at bottom, CCW = left to right
        if (edge.start.x > edge.end.x) {
          [edge.start, edge.end] = [edge.end, edge.start];
        }
        break;
      case "north":
        // Outer edge at top, CCW = right to left
        if (edge.start.x < edge.end.x) {
          [edge.start, edge.end] = [edge.end, edge.start];
        }
        break;
      case "east":
        // Outer edge at right, CCW = bottom to top
        if (edge.start.y > edge.end.y) {
          [edge.start, edge.end] = [edge.end, edge.start];
        }
        break;
      case "west":
        // Outer edge at left, CCW = top to bottom
        if (edge.start.y < edge.end.y) {
          [edge.start, edge.end] = [edge.end, edge.start];
        }
        break;
    }

    edges.push(edge);
  }

  if (edges.length === 0) return [];

  // Step 2: Sort edges to form a natural CCW circuit around the building
  // Use angle from centroid to edge midpoint
  const cx =
    edges.reduce((sum, e) => sum + (e.start.x + e.end.x) / 2, 0) /
    edges.length;
  const cy =
    edges.reduce((sum, e) => sum + (e.start.y + e.end.y) / 2, 0) /
    edges.length;

  edges.sort((a, b) => {
    const midA = { x: (a.start.x + a.end.x) / 2, y: (a.start.y + a.end.y) / 2 };
    const midB = { x: (b.start.x + b.end.x) / 2, y: (b.start.y + b.end.y) / 2 };
    const angleA = Math.atan2(midA.y - cy, midA.x - cx);
    const angleB = Math.atan2(midB.y - cy, midB.x - cx);
    return angleA - angleB;
  });

  // Step 3: Chain edges, inserting corner connectors where endpoints don't match
  const chains = chainEdgesWithCorners(edges);

  // Step 4: Simplify collinear vertices and compute bounds
  return chains.map((edgeList) => {
    const simplified = simplifyCollinear(edgeList);
    const bounds = computeChainBounds(simplified);
    return { edges: simplified, bounds };
  });
}

interface DirectedEdge {
  start: Point;
  end: Point;
  wallId: string;
  direction: CardinalDirection;
}

const EPSILON = 1e-6;

function pointsEqual(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

/**
 * Chain sorted edges into closed polygons, inserting corner connector edges
 * where consecutive edges don't share exact endpoints.
 *
 * Wall geometry has corner gaps: horizontal walls extend through corners
 * but vertical walls don't. Corner connectors fill these gaps.
 */
function chainEdgesWithCorners(
  sortedEdges: DirectedEdge[],
): PerimeterEdge[][] {
  if (sortedEdges.length === 0) return [];

  const allEdges: PerimeterEdge[] = [];

  for (let i = 0; i < sortedEdges.length; i++) {
    const current = sortedEdges[i];
    const next = sortedEdges[(i + 1) % sortedEdges.length];

    // Add current edge
    allEdges.push({
      start: current.start,
      end: current.end,
      wallId: current.wallId,
      direction: current.direction,
    });

    // If current end doesn't match next start, insert a corner connector
    if (!pointsEqual(current.end, next.start)) {
      allEdges.push({
        start: current.end,
        end: next.start,
        wallId: current.wallId, // attribute to current wall
        direction: inferCornerDirection(current.end, next.start),
      });
    }
  }

  return [allEdges];
}

/**
 * Infer the cardinal direction of a corner connector edge.
 */
function inferCornerDirection(from: Point, to: Point): CardinalDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? "south" : "north"; // horizontal movement
  }
  return dy > 0 ? "east" : "west"; // vertical movement
}

/**
 * Remove intermediate vertices where consecutive edges are collinear.
 * Two edges are collinear if the cross-product of their direction vectors
 * is zero (within floating-point epsilon).
 */
function simplifyCollinear(edges: PerimeterEdge[]): PerimeterEdge[] {
  if (edges.length <= 2) return edges;

  const result: PerimeterEdge[] = [];
  let current = edges[0];

  for (let i = 1; i < edges.length; i++) {
    const next = edges[i];

    const dx1 = current.end.x - current.start.x;
    const dy1 = current.end.y - current.start.y;
    const dx2 = next.end.x - next.start.x;
    const dy2 = next.end.y - next.start.y;

    const cross = dx1 * dy2 - dy1 * dx2;

    if (Math.abs(cross) < EPSILON) {
      // Collinear: merge by extending current edge to next's end
      current = {
        start: current.start,
        end: next.end,
        wallId: current.wallId,
        direction: current.direction,
      };
    } else {
      result.push(current);
      current = next;
    }
  }

  // Check if last edge is collinear with the first
  if (result.length > 0) {
    const first = result[0];
    const dx1 = current.end.x - current.start.x;
    const dy1 = current.end.y - current.start.y;
    const dx2 = first.end.x - first.start.x;
    const dy2 = first.end.y - first.start.y;
    const cross = dx1 * dy2 - dy1 * dx2;

    if (Math.abs(cross) < EPSILON) {
      // Merge last into first
      result[0] = {
        start: current.start,
        end: first.end,
        wallId: current.wallId,
        direction: current.direction,
      };
    } else {
      result.push(current);
    }
  } else {
    result.push(current);
  }

  return result;
}

function computeChainBounds(edges: PerimeterEdge[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const edge of edges) {
    minX = Math.min(minX, edge.start.x, edge.end.x);
    minY = Math.min(minY, edge.start.y, edge.end.y);
    maxX = Math.max(maxX, edge.start.x, edge.end.x);
    maxY = Math.max(maxY, edge.start.y, edge.end.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
