import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/parser/config-parser.js";
import { resolveLayout } from "../src/resolver/layout-resolver.js";

describe("computePerimeter", () => {
  it("produces a 4-edge rectangle for a single room", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: room1
        label: "Room"
        position: [0, 0]
        width: 10ft
        height: 8ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: exterior }
          west: { type: exterior }
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const { perimeter } = plan.wallGraph;

    expect(perimeter).toHaveLength(1);
    const chain = perimeter[0];

    // After simplification, a rectangle should have exactly 4 edges
    expect(chain.edges).toHaveLength(4);

    // Verify it forms a closed polygon: last edge end === first edge start
    const first = chain.edges[0];
    const last = chain.edges[chain.edges.length - 1];
    expect(last.end.x).toBeCloseTo(first.start.x, 4);
    expect(last.end.y).toBeCloseTo(first.start.y, 4);

    // Bounds should cover the wall outer edges
    expect(chain.bounds.width).toBeGreaterThan(10);
    expect(chain.bounds.height).toBeGreaterThan(8);
  });

  it("excludes shared walls from perimeter", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: kitchen
        label: "Kitchen"
        position: [0, 0]
        width: 12ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: interior }
          west: { type: exterior }
      - id: dining
        label: "Dining"
        adjacent_to:
          room: kitchen
          wall: east
        width: 14ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: exterior }
          west: { type: interior }
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const { perimeter } = plan.wallGraph;

    // Should produce a single chain (one building outline)
    expect(perimeter).toHaveLength(1);
    const chain = perimeter[0];

    // Shared wall between kitchen/dining should NOT appear in perimeter
    const sharedWallIds = chain.edges.filter((e) => e.wallId.includes("|"));
    expect(sharedWallIds).toHaveLength(0);

    // Bounds should span both rooms
    const totalWidth = 12 + 14; // rooms
    expect(chain.bounds.width).toBeGreaterThan(totalWidth);
  });

  it("follows extension bump-out in perimeter", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: room1
        label: "Room"
        position: [0, 0]
        width: 12ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: exterior }
          west: { type: exterior }
        extensions:
          - id: bump
            label: "Bump Out"
            wall: north
            from: west
            offset: 3ft
            width: 4ft
            depth: 2ft
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const { perimeter } = plan.wallGraph;

    expect(perimeter).toHaveLength(1);
    const chain = perimeter[0];

    // With an extension bump-out, the perimeter should have more than 4 edges
    // (the north side has the bump-out)
    expect(chain.edges.length).toBeGreaterThan(4);

    // Bounds should extend to include the extension
    // Room is 10ft tall, extension adds 2ft depth on north
    expect(chain.bounds.height).toBeGreaterThan(12); // 10 + 2 + wall thicknesses
  });

  it("excludes enclosure walls from perimeter", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: room1
        label: "Room"
        position: [0, 0]
        width: 12ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: exterior }
          west: { type: exterior }
        enclosures:
          - id: closet
            label: "Closet"
            corner: northwest
            facing: east
            length: 6ft
            depth: 3ft
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const { perimeter } = plan.wallGraph;

    expect(perimeter).toHaveLength(1);
    const chain = perimeter[0];

    // Enclosure walls are interior partitions — should NOT appear in perimeter
    const enclosureEdges = chain.edges.filter((e) =>
      e.wallId.startsWith("closet"),
    );
    expect(enclosureEdges).toHaveLength(0);

    // Perimeter should still be a simple rectangle (4 edges)
    expect(chain.edges).toHaveLength(4);
  });
});
