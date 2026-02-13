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

// Default exterior thickness: 2x6 (5.5") + 0.5" drywall × 2 = 6.5" = 0.5417ft
const EXT_THICK = 6.5 / 12;

describe("resolveLayout", () => {
  it("resolves the minimal example", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);

    expect(plan.title).toBe("Floor Plan");
    expect(plan.units).toBe("imperial");
    expect(plan.rooms).toHaveLength(1);
  });

  it("resolves room bounds as interior clear space", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];

    expect(room.id).toBe("room1");
    // Room bounds = interior space, unchanged by walls
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

  it("resolves exterior wall thickness from composition (2x6 default)", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const northWall = room.walls.find((w) => w.direction === "north")!;

    expect(northWall.type).toBe("exterior");
    expect(northWall.thickness).toBeCloseTo(EXT_THICK, 4);
    expect(northWall.lineWeight).toBe(0.7);
  });

  it("resolves south wall geometry (extends below room, includes corners)", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const south = room.walls.find((w) => w.direction === "south")!;
    const west = room.walls.find((w) => w.direction === "west")!;
    const east = room.walls.find((w) => w.direction === "east")!;

    // South wall extends below room and through corners
    expect(south.rect.x).toBeCloseTo(-west.thickness, 4);
    expect(south.rect.y).toBeCloseTo(-EXT_THICK, 4);
    expect(south.rect.width).toBeCloseTo(
      15 + west.thickness + east.thickness,
      4,
    );
    expect(south.rect.height).toBeCloseTo(EXT_THICK, 4);
    expect(south.interiorStartOffset).toBeCloseTo(west.thickness, 4);
    // Outer edge at y = -thickness, inner edge at y = 0
    expect(south.outerEdge.start.y).toBeCloseTo(-EXT_THICK, 4);
    expect(south.innerEdge.start.y).toBe(0);
  });

  it("resolves north wall geometry (extends above room, includes corners)", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const north = room.walls.find((w) => w.direction === "north")!;
    const west = room.walls.find((w) => w.direction === "west")!;
    const east = room.walls.find((w) => w.direction === "east")!;

    // North wall extends above room and through corners
    expect(north.rect.x).toBeCloseTo(-west.thickness, 4);
    expect(north.rect.y).toBe(12);
    expect(north.rect.width).toBeCloseTo(
      15 + west.thickness + east.thickness,
      4,
    );
    expect(north.rect.height).toBeCloseTo(EXT_THICK, 4);
    expect(north.interiorStartOffset).toBeCloseTo(west.thickness, 4);
  });

  it("vertical walls do not extend through corners", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const east = room.walls.find((w) => w.direction === "east")!;
    const west = room.walls.find((w) => w.direction === "west")!;

    expect(east.rect.y).toBe(0);
    expect(east.rect.height).toBe(12);
    expect(east.interiorStartOffset).toBe(0);
    expect(west.rect.y).toBe(0);
    expect(west.rect.height).toBe(12);
    expect(west.interiorStartOffset).toBe(0);
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
    // East wall rect starts at x=15, position 3ft from bottom
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
    // West wall rect starts at x = -thickness, position 4ft from bottom
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

  it("computes overall bounds including wall extents", () => {
    const config = parseConfig(MINIMAL_YAML);
    const plan = resolveLayout(config);

    // Bounds include walls extending outside rooms
    expect(plan.bounds.x).toBeCloseTo(-EXT_THICK, 4);
    expect(plan.bounds.y).toBeCloseTo(-EXT_THICK, 4);
    expect(plan.bounds.width).toBeCloseTo(15 + 2 * EXT_THICK, 4);
    expect(plan.bounds.height).toBeCloseTo(12 + 2 * EXT_THICK, 4);
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

    const _kitchen = plan.rooms.find((r) => r.id === "kitchen")!;
    const dining = plan.rooms.find((r) => r.id === "dining")!;

    // Dining placed to the east of kitchen with a gap for the shared wall
    // Both interior walls are 2x4 → 4.5" = 0.375ft. Gap = max(0.375, 0.375) = 0.375ft
    const INT_THICK = 4.5 / 12;
    expect(dining.bounds.x).toBeCloseTo(12 + INT_THICK, 4);
    expect(dining.bounds.y).toBe(0);
    expect(dining.bounds.width).toBe(14);

    // Overall bounds = total width including gap + exterior walls
    expect(plan.bounds.width).toBeCloseTo(26 + INT_THICK + 2 * EXT_THICK, 4);
  });
});
