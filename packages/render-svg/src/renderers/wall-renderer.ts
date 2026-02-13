import type {
  PlanWall,
  ResolvedEnclosure,
  ResolvedExtension,
  ResolvedRoom,
  ResolvedWall,
  WallGraph,
} from "@floorscript/core";
import { rectToSvg, type TransformContext } from "../coordinate-transform.js";
import type { DrawingContext } from "../drawing-context.js";

const WALL_FILLS: Record<string, string> = {
  exterior: "#000",
  interior: "#333",
  "load-bearing": "#333",
};

/**
 * Render all walls from a WallGraph (plan-level, shared walls rendered once).
 */
export function renderWallGraph(
  wallGraph: WallGraph,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  dc.openGroup({ class: "walls" });

  for (const wall of wallGraph.walls) {
    renderPlanWall(wall, ctx, dc);
  }

  dc.closeGroup();
}

/**
 * Render all walls for a room using pre-computed segments.
 * Fallback for when no WallGraph is available.
 */
export function renderWalls(
  room: ResolvedRoom,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  dc.openGroup({ class: "room", id: `room-${room.id}` });
  dc.openGroup({ class: "walls" });

  for (const wall of room.walls) {
    renderWall(wall, ctx, dc);
  }

  dc.closeGroup();
  dc.closeGroup();
}

function renderPlanWall(
  wall: PlanWall,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const fill = WALL_FILLS[wall.type] ?? "#333";

  if (wall.segments.length === 1) {
    const svgRect = rectToSvg(wall.segments[0], ctx);
    dc.rect(svgRect.x, svgRect.y, svgRect.width, svgRect.height, {
      fill,
      stroke: "none",
    });
    return;
  }

  dc.openGroup({ fill, stroke: "none" });

  for (const seg of wall.segments) {
    const svgRect = rectToSvg(seg, ctx);
    if (svgRect.width > 0.1 && svgRect.height > 0.1) {
      dc.rect(svgRect.x, svgRect.y, svgRect.width, svgRect.height);
    }
  }

  dc.closeGroup();
}

/**
 * Render enclosure interior walls for a room.
 */
export function renderEnclosureWalls(
  enclosures: ResolvedEnclosure[],
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  for (const enc of enclosures) {
    dc.openGroup({ class: "enclosure-walls", id: `enclosure-${enc.id}` });
    for (const wall of enc.walls) {
      renderWall(wall, ctx, dc);
    }
    dc.closeGroup();
  }
}

/**
 * Render extension exterior walls for a room.
 */
export function renderExtensionWalls(
  extensions: ResolvedExtension[],
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  for (const ext of extensions) {
    dc.openGroup({ class: "extension-walls", id: `extension-${ext.id}` });
    for (const wall of ext.walls) {
      renderWall(wall, ctx, dc);
    }
    dc.closeGroup();
  }
}

function renderWall(
  wall: ResolvedWall,
  ctx: TransformContext,
  dc: DrawingContext,
): void {
  const fill = WALL_FILLS[wall.type] ?? "#333";

  if (wall.segments.length === 1) {
    const svgRect = rectToSvg(wall.segments[0], ctx);
    dc.rect(svgRect.x, svgRect.y, svgRect.width, svgRect.height, {
      fill,
      stroke: "none",
    });
    return;
  }

  dc.openGroup({ fill, stroke: "none" });

  for (const seg of wall.segments) {
    const svgRect = rectToSvg(seg, ctx);
    if (svgRect.width > 0.1 && svgRect.height > 0.1) {
      dc.rect(svgRect.x, svgRect.y, svgRect.width, svgRect.height);
    }
  }

  dc.closeGroup();
}
