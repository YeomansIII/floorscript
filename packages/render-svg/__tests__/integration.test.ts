import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseConfig, resolveLayout } from "@floorscript/core";
import { describe, expect, it } from "vitest";
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

    // Wall inline styles
    expect(svg).toContain('fill="#000"');

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
    expect(svg).toContain('class="walls"');
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

  it("renders electrical and plumbing layers from multi-room example", () => {
    const yaml = readFileSync(
      resolve(__dirname, "../../../examples/multi-room.yaml"),
      "utf-8",
    );
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config);
    const svg = renderSvg(resolved);

    // Electrical layer present
    expect(svg).toContain('class="layer-electrical"');
    expect(svg).toContain('class="electrical"');

    // Plumbing layer present
    expect(svg).toContain('class="layer-plumbing"');
    expect(svg).toContain('class="plumbing"');

    // Specific electrical elements
    expect(svg).toContain("outlet outlet-duplex");
    expect(svg).toContain("outlet outlet-gfci");
    expect(svg).toContain("switch switch-single");
    expect(svg).toContain("switch switch-three-way");
    expect(svg).toContain("light-fixture light-recessed");
    expect(svg).toContain("light-fixture light-surface");
    expect(svg).toContain("smoke-detector");
    expect(svg).toContain("electrical-panel");

    // Plumbing elements
    expect(svg).toContain("fixture-toilet");
    expect(svg).toContain("fixture-bath-sink");

    // Polylines for runs
    expect(svg).toContain("<polyline");

    // Well-formed
    const opens = (svg.match(/<g /g) ?? []).length;
    const closes = (svg.match(/<\/g>/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it("hides electrical layer when layer visibility is false", () => {
    const yaml = readFileSync(
      resolve(__dirname, "../../../examples/multi-room.yaml"),
      "utf-8",
    );
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config);
    const svg = renderSvg(resolved, {
      layers: { electrical: { visible: false } },
    });

    expect(svg).not.toContain('class="layer-electrical"');
    // Plumbing should still be visible
    expect(svg).toContain('class="layer-plumbing"');
  });

  it("renders door on shared wall with correct swing direction", () => {
    const yaml = `
version: "0.1"
project:
  title: "Door Swing Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: living
        label: "Living"
        position: [0, 0]
        width: 15ft
        height: 12ft
        walls:
          south:
            type: interior
            openings:
              - type: door
                position: 4ft
                width: 3ft
                swing: inward-right
      - id: bathroom
        label: "Bathroom"
        adjacent_to:
          room: living
          wall: south
        width: 8ft
        height: 6ft
        walls:
          north:
            type: interior
            openings:
              - type: door
                position: 2ft
                width: 2ft 6in
                swing: inward-left
`;
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config);
    const svg = renderSvg(resolved);

    // Both doors render as opening groups
    const doorMatches = svg.match(/class="opening door"/g);
    expect(doorMatches).not.toBeNull();
    expect(doorMatches!.length).toBe(2);

    // Door arcs present (quarter-circle swings)
    expect(svg).toContain("<path");
  });

  it("renders enclosure interior walls and sub-space labels", () => {
    const yaml = readFileSync(
      resolve(__dirname, "../../../examples/bedroom-closet.yaml"),
      "utf-8",
    );
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config);
    const svg = renderSvg(resolved);

    // Enclosure interior walls present
    expect(svg).toContain("enclosure-walls");
    expect(svg).toContain('id="enclosure-closet"');

    // Sub-space label
    expect(svg).toContain("Walk-in Closet");
    // Parent room label
    expect(svg).toContain("Primary Bedroom");

    // Door on enclosure wall
    expect(svg).toContain("opening door");
  });

  it("renders extension exterior walls and sub-space labels", () => {
    const yaml = readFileSync(
      resolve(__dirname, "../../../examples/bedroom-nook.yaml"),
      "utf-8",
    );
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config);
    const svg = renderSvg(resolved);

    // Extension exterior walls present
    expect(svg).toContain("extension-walls");
    expect(svg).toContain('id="extension-window-nook"');

    // Sub-space labels
    expect(svg).toContain("Window Nook");
    expect(svg).toContain("Walk-in Closet");
    expect(svg).toContain("Primary Bedroom");

    // Window on extension wall
    expect(svg).toContain("opening window");

    // Enclosure also present
    expect(svg).toContain("enclosure-walls");
  });

  it("hides plumbing layer when layer visibility is false", () => {
    const yaml = readFileSync(
      resolve(__dirname, "../../../examples/multi-room.yaml"),
      "utf-8",
    );
    const config = parseConfig(yaml);
    const resolved = resolveLayout(config);
    const svg = renderSvg(resolved, {
      layers: { plumbing: { visible: false } },
    });

    expect(svg).not.toContain('class="layer-plumbing"');
    // Electrical should still be visible
    expect(svg).toContain('class="layer-electrical"');
  });
});
