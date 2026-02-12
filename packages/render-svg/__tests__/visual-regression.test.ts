import { describe, expect, it } from "vitest";
import { parseConfig, resolveLayout } from "@floorscript/core";
import { renderSvg } from "../src/render-svg.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXAMPLES_DIR = resolve(__dirname, "../../../examples");

function loadAndRender(filename: string): string {
  const yaml = readFileSync(resolve(EXAMPLES_DIR, filename), "utf-8");
  const config = parseConfig(yaml);
  const resolved = resolveLayout(config);
  return renderSvg(resolved);
}

/**
 * Visual regression tests using SVG string snapshots.
 *
 * These tests lock down the exact SVG output for each example.
 * If a rendering change causes a test to fail:
 *   - If the change is intentional, update snapshots: pnpm test -- -u
 *   - If the change is unintentional, investigate the regression
 */
describe("visual regression", () => {
  it("single-room renders consistently", () => {
    const svg = loadAndRender("single-room.yaml");
    expect(svg).toMatchSnapshot();
  });

  it("kitchen-reno existing plan renders consistently", () => {
    const yaml = readFileSync(resolve(EXAMPLES_DIR, "kitchen-reno.yaml"), "utf-8");
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config, "existing");
    const svg = renderSvg(resolved);
    expect(svg).toMatchSnapshot();
  });

  it("kitchen-reno proposed plan renders consistently", () => {
    const yaml = readFileSync(resolve(EXAMPLES_DIR, "kitchen-reno.yaml"), "utf-8");
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config, "proposed");
    const svg = renderSvg(resolved);
    expect(svg).toMatchSnapshot();
  });

  it("multi-room renders consistently", () => {
    const svg = loadAndRender("multi-room.yaml");
    expect(svg).toMatchSnapshot();
  });

  it("single-room renders consistently at different widths", () => {
    const yaml = readFileSync(resolve(EXAMPLES_DIR, "single-room.yaml"), "utf-8");
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config);

    const svg600 = renderSvg(resolved, { width: 600 });
    const svg2400 = renderSvg(resolved, { width: 2400 });

    expect(svg600).toMatchSnapshot();
    expect(svg2400).toMatchSnapshot();
  });

  it("renders consistently with options disabled", () => {
    const yaml = readFileSync(resolve(EXAMPLES_DIR, "single-room.yaml"), "utf-8");
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config);

    const svg = renderSvg(resolved, {
      showDimensions: false,
      showLabels: false,
      showTitleBlock: false,
    });

    expect(svg).toMatchSnapshot();
  });

  it("multi-room with electrical hidden renders consistently", () => {
    const yaml = readFileSync(resolve(EXAMPLES_DIR, "multi-room.yaml"), "utf-8");
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config);

    const svg = renderSvg(resolved, {
      layers: { electrical: { visible: false } },
    });

    expect(svg).not.toContain('class="layer-electrical"');
    expect(svg).toContain('class="layer-plumbing"');
    expect(svg).toMatchSnapshot();
  });

  it("multi-room with plumbing hidden renders consistently", () => {
    const yaml = readFileSync(resolve(EXAMPLES_DIR, "multi-room.yaml"), "utf-8");
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config);

    const svg = renderSvg(resolved, {
      layers: { plumbing: { visible: false } },
    });

    expect(svg).not.toContain('class="layer-plumbing"');
    expect(svg).toContain('class="layer-electrical"');
    expect(svg).toMatchSnapshot();
  });
});
