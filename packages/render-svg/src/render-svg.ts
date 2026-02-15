import type { ResolvedPlan } from "@floorscript/core";
import { createTransform } from "./coordinate-transform.js";
import { renderChainDimension } from "./renderers/dimension-renderer.js";
import { renderDoor } from "./renderers/door-renderer.js";
import { renderElectrical } from "./renderers/electrical-renderer.js";
import { renderLabel } from "./renderers/label-renderer.js";
import { renderPlumbing } from "./renderers/plumbing-renderer.js";
import { renderTitleBlock } from "./renderers/title-block-renderer.js";
import { renderWallGraph } from "./renderers/wall-renderer.js";
import { renderWindow } from "./renderers/window-renderer.js";
import { SvgDocument } from "./svg-document.js";
import { SvgDrawingContext } from "./svg-drawing-context.js";

export interface SvgRenderOptions {
  width?: number;
  background?: string;
  margin?: number;
  showDimensions?: boolean;
  showLabels?: boolean;
  showTitleBlock?: boolean;
  layers?: Record<string, { visible: boolean; color_override?: string | null }>;
}

const DEFAULT_OPTIONS = {
  width: 1200,
  background: "white",
  showDimensions: true,
  showLabels: true,
  showTitleBlock: true,
} as const;

// Compute margin based on what needs to fit: lane 1 dim offset + text + overshoot + padding
const DEFAULT_MARGIN = 5; // 3.5ft lane 1 offset + 0.5ft text + 0.5ft overshoot + 0.5ft padding

// Base title block reserve at reference width of 1200px
const BASE_TITLE_BLOCK_RESERVE = 160;
const REFERENCE_WIDTH = 1200;

/**
 * Check if a layer is visible. Precedence:
 * 1. Render options (opts.layers) override everything
 * 2. Plan-level layers config (plan.layers)
 * 3. Default: visible
 */
function isLayerVisible(
  layerName: string,
  plan: ResolvedPlan,
  opts: SvgRenderOptions,
): boolean {
  const optLayer = opts.layers?.[layerName];
  if (optLayer !== undefined) return optLayer.visible;
  const planLayer = plan.layers?.[layerName];
  if (planLayer !== undefined) return planLayer.visible;
  return true;
}

export function renderSvg(
  plan: ResolvedPlan,
  options?: SvgRenderOptions,
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const margin = options?.margin ?? DEFAULT_MARGIN;
  const ctx = createTransform(plan, opts.width, margin);

  // Reserve extra height for the title block, scaled proportionally
  const titleBlockReserve =
    BASE_TITLE_BLOCK_RESERVE * (ctx.svgWidth / REFERENCE_WIDTH);
  const totalHeight = opts.showTitleBlock
    ? ctx.svgHeight + titleBlockReserve
    : ctx.svgHeight;

  const doc = new SvgDocument(
    { x: 0, y: 0, width: ctx.svgWidth, height: totalHeight },
    opts.background,
  );

  // Render walls + openings from unified wall graph (single pass)
  if (isLayerVisible("structural", plan, opts)) {
    const wallDc = new SvgDrawingContext();
    renderWallGraph(plan.wallGraph, ctx, wallDc);
    doc.addToLayer("structural", wallDc.getOutput());

    // Render openings from wall graph
    for (const wall of plan.wallGraph.walls) {
      for (const opening of wall.openings) {
        const openingDc = new SvgDrawingContext();
        if (opening.type === "door") {
          renderDoor(opening, ctx, openingDc);
        } else if (opening.type === "window") {
          renderWindow(opening, ctx, openingDc);
        }
        doc.addToLayer("structural", openingDc.getOutput());
      }
    }
  }

  // Labels
  if (opts.showLabels && isLayerVisible("labels", plan, opts)) {
    for (const room of plan.rooms) {
      const dc = new SvgDrawingContext();
      renderLabel(room, ctx, dc);
      doc.addToLayer("labels", dc.getOutput());

      // Sub-space labels for enclosures and extensions
      if (room.enclosures) {
        for (const enc of room.enclosures) {
          const subDc = new SvgDrawingContext();
          renderLabel(
            {
              id: enc.id,
              label: enc.label,
              bounds: enc.bounds,
              labelPosition: {
                x: enc.bounds.x + enc.bounds.width / 2,
                y: enc.bounds.y + enc.bounds.height / 2,
              },
            },
            ctx,
            subDc,
          );
          doc.addToLayer("labels", subDc.getOutput());
        }
      }
      if (room.extensions) {
        for (const ext of room.extensions) {
          const subDc = new SvgDrawingContext();
          renderLabel(
            {
              id: ext.id,
              label: ext.label,
              bounds: ext.bounds,
              labelPosition: {
                x: ext.bounds.x + ext.bounds.width / 2,
                y: ext.bounds.y + ext.bounds.height / 2,
              },
            },
            ctx,
            subDc,
          );
          doc.addToLayer("labels", subDc.getOutput());
        }
      }
    }
  }

  // Dimensions
  if (opts.showDimensions && isLayerVisible("dimensions", plan, opts)) {
    for (const chain of plan.dimensions) {
      const dc = new SvgDrawingContext();
      renderChainDimension(chain, ctx, dc);
      doc.addToLayer("dimensions", dc.getOutput());
    }
  }

  // Electrical
  if (plan.electrical && isLayerVisible("electrical", plan, opts)) {
    const dc = new SvgDrawingContext();
    renderElectrical(plan.electrical, ctx, dc);
    doc.addToLayer("electrical", dc.getOutput());
  }

  // Plumbing
  if (plan.plumbing && isLayerVisible("plumbing", plan, opts)) {
    const dc = new SvgDrawingContext();
    renderPlumbing(plan.plumbing, ctx, dc);
    doc.addToLayer("plumbing", dc.getOutput());
  }

  // Title block — placed at bottom of the extended SVG area
  if (opts.showTitleBlock) {
    const dc = new SvgDrawingContext();
    renderTitleBlock(plan.project, ctx.svgWidth, totalHeight, dc);
    doc.addToLayer("title-block", dc.getOutput());
  }

  return doc.toString();
}
