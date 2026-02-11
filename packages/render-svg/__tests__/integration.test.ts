import { describe, expect, it } from "vitest";
import { parseConfig, resolveLayout } from "@floorscript/core";
import { renderSvg } from "../src/render-svg.js";

const MINIMAL_YAML = `
version: "0.1"
project:
  title: "Test Room"
  scale: "1/4in = 1ft"
units: imperial

plans:
  - id: main
    title: "Floor Plan"
    rooms:
      - id: room1
        label: "Living Room"
        position: [0, 0]
        width: 15ft
        height: 12ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east:
            type: exterior
            openings:
              - type: window
                position: 3ft
                width: 6ft
          west:
            type: exterior
            openings:
              - type: door
                position: 4ft
                width: 3ft
                swing: inward-right
`;

describe("end-to-end SVG rendering", () => {
  it("renders the minimal example to valid SVG", () => {
    const config = parseConfig(MINIMAL_YAML);
    const resolved = resolveLayout(config);
    const svg = renderSvg(resolved);

    // Basic SVG structure
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("xmlns=");

    // Room label
    expect(svg).toContain("Living Room");

    // Title block
    expect(svg).toContain("Test Room");
    expect(svg).toContain("FloorScript v0.1");

    // Wall classes
    expect(svg).toContain("wall-exterior");

    // Openings
    expect(svg).toContain("opening door");
    expect(svg).toContain("opening window");

    // Dimensions (XML-escaped in SVG text)
    expect(svg).toContain("15&apos;-0&quot;");
    expect(svg).toContain("12&apos;-0&quot;");

    // Layers
    expect(svg).toContain("layer-structural");
    expect(svg).toContain("layer-labels");
    expect(svg).toContain("layer-dimensions");
  });

  it("respects render options", () => {
    const config = parseConfig(MINIMAL_YAML);
    const resolved = resolveLayout(config);

    const svg = renderSvg(resolved, {
      showDimensions: false,
      showLabels: false,
      showTitleBlock: false,
    });

    expect(svg).toContain("layer-structural");
    expect(svg).not.toContain("layer-labels");
    expect(svg).not.toContain("layer-dimensions");
    expect(svg).not.toContain("layer-title-block");
  });

  it("renders multi-room plan", () => {
    const yaml = `
version: "0.1"
project:
  title: "Multi Room"
  address: "123 Main St"
  owner: "Jane Smith"
  date: "2026-02-11"
  sheet: "A1"
  scale: "1/4in = 1ft"
units: imperial
plans:
  - id: main
    title: "Floor Plan"
    rooms:
      - id: kitchen
        label: "Kitchen"
        position: [0, 0]
        width: 12ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: interior }
          east:
            type: interior
            openings:
              - type: door
                position: 3ft
                width: 3ft
                swing: inward-left
          west: { type: exterior }
      - id: dining
        label: "Dining Room"
        adjacent_to:
          room: kitchen
          wall: east
        width: 14ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: interior }
          east: { type: exterior }
          west: { type: interior }
`;
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config);
    const svg = renderSvg(resolved);

    expect(svg).toContain("Kitchen");
    expect(svg).toContain("Dining Room");
    expect(svg).toContain("room-kitchen");
    expect(svg).toContain("room-dining");
    expect(svg).toContain("123 Main St");
    expect(svg).toContain("Jane Smith");
    expect(svg).toContain("Sheet: A1");
  });

  it("produces valid SVG structure", () => {
    const config = parseConfig(MINIMAL_YAML);
    const resolved = resolveLayout(config);
    const svg = renderSvg(resolved);

    // Check that all opened tags have corresponding closes
    // (basic well-formedness check)
    const opens = (svg.match(/<g /g) ?? []).length;
    const closes = (svg.match(/<\/g>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(opens).toBeGreaterThan(0);
  });
});
