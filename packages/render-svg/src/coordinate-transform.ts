import type { Point, Rect, ResolvedPlan } from "@floorscript/core";

export interface TransformContext {
  planBounds: Rect;
  margin: number;
  scale: number;
  svgWidth: number;
  svgHeight: number;
}

/**
 * Create a transform context for converting plan coordinates to SVG coordinates.
 * Plan uses bottom-left origin (Y-up). SVG uses top-left origin (Y-down).
 */
export function createTransform(
  plan: ResolvedPlan,
  svgWidth: number,
  margin: number,
): TransformContext {
  const { bounds } = plan;
  const totalPlanWidth = bounds.width + 2 * margin;
  const totalPlanHeight = bounds.height + 2 * margin;

  const scale = svgWidth / totalPlanWidth;
  const svgHeight = totalPlanHeight * scale;

  return {
    planBounds: bounds,
    margin,
    scale,
    svgWidth,
    svgHeight,
  };
}

/**
 * Convert a point from plan coordinates (Y-up) to SVG coordinates (Y-down).
 */
export function toSvg(point: Point, ctx: TransformContext): Point {
  return {
    x: (point.x - ctx.planBounds.x + ctx.margin) * ctx.scale,
    y: ctx.svgHeight - (point.y - ctx.planBounds.y + ctx.margin) * ctx.scale,
  };
}

/**
 * Convert a rect from plan coordinates to SVG coordinates.
 * In SVG, (x,y) is the top-left corner.
 */
export function rectToSvg(
  rect: Rect,
  ctx: TransformContext,
): { x: number; y: number; width: number; height: number } {
  // Top-left in plan coords is (rect.x, rect.y + rect.height)
  const topLeft = toSvg({ x: rect.x, y: rect.y + rect.height }, ctx);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: rect.width * ctx.scale,
    height: rect.height * ctx.scale,
  };
}

/**
 * Scale a value from plan units to SVG pixels.
 */
export function scaleValue(value: number, ctx: TransformContext): number {
  return value * ctx.scale;
}
