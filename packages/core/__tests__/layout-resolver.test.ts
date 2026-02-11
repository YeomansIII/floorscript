import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/parser/config-parser.js";
import { resolveLayout } from "../src/resolver/layout-resolver.js";

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

describe("resolveLayout", () => {
  it("resolves the minimal example", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);

    expect(plan.title).toBe("Floor Plan");
    expect(plan.units).toBe("imperial");
    expect(plan.rooms).toHaveLength(1);
  });

  it("resolves room bounds correctly", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];

    expect(room.id).toBe("room1");
    expect(room.bounds).toEqual({
      x: 0,
      y: 0,
      width: 15,
      height: 12,
    });
    expect(room.labelPosition).toEqual({ x: 7.5, y: 6 });
  });

  it("resolves four walls", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];

    expect(room.walls).toHaveLength(4);

    const wallIds = room.walls.map((w) => w.id);
    expect(wallIds).toContain("room1.north");
    expect(wallIds).toContain("room1.south");
    expect(wallIds).toContain("room1.east");
    expect(wallIds).toContain("room1.west");
  });

  it("resolves exterior wall thickness (6 inches = 0.5ft)", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const northWall = room.walls.find((w) => w.direction === "north")!;

    expect(northWall.type).toBe("exterior");
    expect(northWall.thickness).toBe(0.5);
    expect(northWall.lineWeight).toBe(0.7);
  });

  it("resolves south wall geometry", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const south = room.walls.find((w) => w.direction === "south")!;

    // South wall: outer edge at y=0, thickness extends upward
    expect(south.rect).toEqual({ x: 0, y: 0, width: 15, height: 0.5 });
    expect(south.outerEdge.start).toEqual({ x: 0, y: 0 });
    expect(south.outerEdge.end).toEqual({ x: 15, y: 0 });
  });

  it("resolves north wall geometry", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const north = room.walls.find((w) => w.direction === "north")!;

    // North wall: outer edge at y=12, thickness extends downward
    expect(north.rect).toEqual({ x: 0, y: 11.5, width: 15, height: 0.5 });
  });

  it("resolves window opening on east wall", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const east = room.walls.find((w) => w.direction === "east")!;

    expect(east.openings).toHaveLength(1);
    const window = east.openings[0];
    expect(window.type).toBe("window");
    expect(window.width).toBe(6);
    expect(window.wallDirection).toBe("east");
    // Window at position 3ft from bottom on east wall (vertical)
    expect(window.gapStart.y).toBe(3);
    expect(window.gapEnd.y).toBe(9);
  });

  it("resolves door opening on west wall", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const west = room.walls.find((w) => w.direction === "west")!;

    expect(west.openings).toHaveLength(1);
    const door = west.openings[0];
    expect(door.type).toBe("door");
    expect(door.width).toBe(3);
    expect(door.style).toBe("standard");
    expect(door.swing).toBe("inward-right");
    // Door at position 4ft from bottom on west wall
    expect(door.gapStart.y).toBe(4);
    expect(door.gapEnd.y).toBe(7);
  });

  it("generates auto-dimensions", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);

    expect(plan.dimensions).toHaveLength(2);

    const hDim = plan.dimensions.find((d) => d.orientation === "horizontal")!;
    expect(hDim.label).toBe("15'-0\"");

    const vDim = plan.dimensions.find((d) => d.orientation === "vertical")!;
    expect(vDim.label).toBe("12'-0\"");
  });

  it("computes overall bounds", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);

    expect(plan.bounds).toEqual({
      x: 0,
      y: 0,
      width: 15,
      height: 12,
    });
  });

  it("resolves multi-room with adjacency", () => {
    const yaml = `
version: "0.1"
project:
  title: "Multi Room"
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
          south: { type: interior }
          east: { type: interior }
          west: { type: exterior }
      - id: dining
        label: "Dining Room"
        adjacent_to:
          room: kitchen
          wall: east
          alignment: start
        width: 14ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: interior }
          east: { type: exterior }
          west: { type: interior }
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    expect(plan.rooms).toHaveLength(2);

    const kitchen = plan.rooms.find((r) => r.id === "kitchen")!;
    const dining = plan.rooms.find((r) => r.id === "dining")!;

    // Dining should be placed to the east of kitchen
    expect(dining.bounds.x).toBe(12);
    expect(dining.bounds.y).toBe(0);
    expect(dining.bounds.width).toBe(14);

    // Overall bounds should encompass both rooms
    expect(plan.bounds.width).toBe(26); // 12 + 14
    expect(plan.bounds.height).toBe(10);
  });
});
