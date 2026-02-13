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

  it("resolves room with NW corner enclosure", () => {
    const yaml = `
version: "0.1"
project:
  title: "Enclosure Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bedroom1
        label: "Bedroom"
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
            depth: 2ft 4in
            walls:
              east:
                type: interior
                openings:
                  - type: door
                    position: 1ft
                    width: 2ft 6in
                    style: bifold
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];

    expect(room.enclosures).toHaveLength(1);
    const closet = room.enclosures![0];
    expect(closet.id).toBe("closet");
    expect(closet.facing).toBe("east");

    // Enclosure bounds: NW corner, facing east
    // depth (E-W) = 2ft 4in = 2.333ft → width = 2.333
    // length (N-S) = 6ft → height = 6
    // Position: x=0, y=10-6=4
    expect(closet.bounds.x).toBeCloseTo(0, 3);
    expect(closet.bounds.y).toBeCloseTo(4, 3);
    expect(closet.bounds.width).toBeCloseTo(2 + 4 / 12, 3);
    expect(closet.bounds.height).toBeCloseTo(6, 3);

    // Closet should have 2 interior walls (east and south)
    expect(closet.walls).toHaveLength(2);
    const eastWall = closet.walls.find((w) => w.direction === "east");
    expect(eastWall).toBeDefined();
    expect(eastWall!.openings).toHaveLength(1);
    expect(eastWall!.openings[0].type).toBe("door");

    // Parent walls should NOT be shortened — exterior walls stay full length
    // (they ARE the closet's backing walls)
    const northWall = room.walls.find((w) => w.direction === "north")!;
    const westWall = room.walls.find((w) => w.direction === "west")!;

    // North wall starts at x - westThickness (full length, no shortening)
    expect(northWall.rect.x).toBeCloseTo(-westWall.thickness, 3);

    // West wall stays full height (10ft room height)
    expect(westWall.rect.height).toBeCloseTo(10, 1);
  });

  it("resolves room with north wall extension", () => {
    const yaml = `
version: "0.1"
project:
  title: "Extension Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bedroom1
        label: "Bedroom"
        position: [0, 0]
        width: 12ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: exterior }
          west: { type: exterior }
        extensions:
          - id: nook
            label: "Window Nook"
            wall: north
            from: west
            offset: 3ft
            width: 4ft
            depth: 2ft
            walls:
              north:
                type: exterior
                openings:
                  - type: window
                    position: 6in
                    width: 3ft
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];

    expect(room.extensions).toHaveLength(1);
    const nook = room.extensions![0];
    expect(nook.id).toBe("nook");
    expect(nook.parentWall).toBe("north");

    // Extension bounds: north wall, from:west, offset:3ft, width:4ft, depth:2ft
    // x = 0 + 3 = 3, y = 10, width = 4, height = 2
    expect(nook.bounds.x).toBeCloseTo(3, 3);
    expect(nook.bounds.y).toBeCloseTo(10, 3);
    expect(nook.bounds.width).toBeCloseTo(4, 3);
    expect(nook.bounds.height).toBeCloseTo(2, 3);

    // Extension has 3 exterior walls and a window on the north wall
    expect(nook.walls).toHaveLength(3);
    const northWall = nook.walls.find((w) => w.direction === "north");
    expect(northWall).toBeDefined();
    expect(northWall!.openings).toHaveLength(1);
    expect(northWall!.openings[0].type).toBe("window");

    // Parent north wall should have segments split by the extension gap
    const parentNorth = room.walls.find((w) => w.direction === "north")!;
    // Gap from x=3 to x=7. Wall should be split into 2 segments.
    expect(parentNorth.segments.length).toBeGreaterThanOrEqual(2);
  });

  it("resolves room with mid-wall enclosure", () => {
    const yaml = `
version: "0.1"
project:
  title: "Wall Enclosure Test"
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
        enclosures:
          - id: closet
            label: "Closet"
            wall: north
            from: west
            offset: 3ft
            length: 6ft
            depth: 2ft
            walls:
              south:
                type: interior
                openings:
                  - type: door
                    position: 1ft
                    width: 2ft 6in
                    style: bifold
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];

    expect(room.enclosures).toHaveLength(1);
    const closet = room.enclosures![0];
    expect(closet.id).toBe("closet");
    expect(closet.facing).toBe("south");

    // Bounds: x=3, y=8, width=6, height=2
    expect(closet.bounds.x).toBeCloseTo(3, 3);
    expect(closet.bounds.y).toBeCloseTo(8, 3);
    expect(closet.bounds.width).toBeCloseTo(6, 3);
    expect(closet.bounds.height).toBeCloseTo(2, 3);

    // Door on south wall (facing)
    const southWall = closet.walls.find((w) => w.direction === "south");
    expect(southWall).toBeDefined();
    expect(southWall!.openings).toHaveLength(1);
  });

  it("resolves room with from/offset door in enclosure", () => {
    const yaml = `
version: "0.1"
project:
  title: "From/Offset Enclosure Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bedroom1
        label: "Bedroom"
        position: [0, 0]
        width: 12ft
        height: 10ft
        walls:
          west:
            type: exterior
            openings:
              - type: door
                from: south
                offset: 1ft
                width: 3ft
                swing: inward-right
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const west = room.walls.find((w) => w.direction === "west")!;

    expect(west.openings).toHaveLength(1);
    // from:south means position = offset = 1ft
    expect(west.openings[0].gapStart.y).toBeCloseTo(1, 3);
    expect(west.openings[0].gapEnd.y).toBeCloseTo(4, 3);
  });

  it("adjacent room shares wall with enclosure-shortened wall", () => {
    const yaml = `
version: "0.1"
project:
  title: "Shared Wall Enclosure Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bedroom
        label: "Bedroom"
        position: [0, 0]
        width: 14ft
        height: 12ft
        walls:
          east:
            type: interior
            openings:
              - type: door
                position: 3ft
                width: 3ft
                swing: inward-right
        enclosures:
          - id: closet
            label: "Closet"
            corner: northeast
            facing: west
            length: 6ft
            depth: 4ft
      - id: hallway
        label: "Hallway"
        adjacent_to:
          room: bedroom
          wall: east
        width: 4ft
        height: 12ft
        walls:
          west: { type: interior }
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    expect(plan.rooms).toHaveLength(2);
    const bedroom = plan.rooms.find((r) => r.id === "bedroom")!;
    const hallway = plan.rooms.find((r) => r.id === "hallway")!;

    // Bedroom has a closet in the NE corner
    expect(bedroom.enclosures).toHaveLength(1);
    expect(bedroom.enclosures![0].id).toBe("closet");

    // Hallway is positioned east of bedroom, sharing the east wall
    // Corner enclosures no longer shorten parent walls — exterior walls stay full length
    const bedroomEast = bedroom.walls.find((w) => w.direction === "east")!;
    expect(bedroomEast.rect.height).toBeCloseTo(12, 1);

    // Hallway should still be adjacent and properly positioned
    expect(hallway.bounds.x).toBeGreaterThan(bedroom.bounds.x + bedroom.bounds.width - 0.01);
  });

  it("adjacent room attaches to wall with extension gap", () => {
    const yaml = `
version: "0.1"
project:
  title: "Shared Wall Extension Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: living
        label: "Living Room"
        position: [0, 0]
        width: 14ft
        height: 12ft
        walls:
          south:
            type: interior
            openings:
              - type: door
                position: 5ft
                width: 3ft
        extensions:
          - id: nook
            label: "Nook"
            wall: north
            from: west
            offset: 3ft
            width: 4ft
            depth: 3ft
      - id: dining
        label: "Dining"
        adjacent_to:
          room: living
          wall: south
        width: 14ft
        height: 10ft
        walls:
          north: { type: interior }
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    expect(plan.rooms).toHaveLength(2);
    const living = plan.rooms.find((r) => r.id === "living")!;
    const dining = plan.rooms.find((r) => r.id === "dining")!;

    // Living room has the extension on north wall
    expect(living.extensions).toHaveLength(1);

    // The north wall should be split by the extension gap
    const northWall = living.walls.find((w) => w.direction === "north")!;
    expect(northWall.segments.length).toBeGreaterThanOrEqual(2);

    // Dining room attaches to south wall (unaffected by north extension)
    // and should be positioned correctly
    expect(dining.bounds.y).toBeLessThan(living.bounds.y);
  });

  it("composite outline is computed for rooms with enclosures/extensions", () => {
    const yaml = `
version: "0.1"
project:
  title: "Composite Outline Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bedroom
        label: "Bedroom"
        position: [0, 0]
        width: 14ft
        height: 12ft
        enclosures:
          - id: closet
            label: "Closet"
            corner: northwest
            facing: east
            length: 6ft
            depth: 4ft
        extensions:
          - id: nook
            label: "Nook"
            wall: north
            from: east
            offset: 2ft
            width: 5ft
            depth: 3ft
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];

    // Should have a composite outline
    expect(room.compositeOutline).toBeDefined();
    expect(room.compositeOutline!.length).toBeGreaterThan(4);

    // Label position should be computed (not the simple center)
    expect(room.labelPosition).toBeDefined();
  });

  it("sealed enclosure generates validation warning", () => {
    const yaml = `
version: "0.1"
project:
  title: "Sealed Enclosure Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bedroom
        label: "Bedroom"
        position: [0, 0]
        width: 14ft
        height: 12ft
        walls:
          south:
            type: exterior
            openings:
              - type: door
                position: 5ft
                width: 3ft
        enclosures:
          - id: closet
            label: "Closet"
            corner: northwest
            facing: east
            length: 6ft
            depth: 4ft
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    // Closet has no door → should generate a warning
    expect(plan.validation).toBeDefined();
    const sealedWarning = plan.validation!.warnings.find(
      (w) => w.code === "sealed-enclosure",
    );
    expect(sealedWarning).toBeDefined();
    expect(sealedWarning!.elementId).toBe("closet");
  });
});
