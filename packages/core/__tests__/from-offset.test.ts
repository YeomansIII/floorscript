import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/parser/config-parser.js";
import { resolveLayout } from "../src/resolver/layout-resolver.js";
import { resolveFromOffset } from "../src/resolver/opening-resolver.js";

describe("resolveFromOffset", () => {
  it("computes position from start end of vertical wall (west wall, from:south)", () => {
    // West wall runs south→north; "south" is the start end
    // offset: 2ft 7in = 2 + 7/12 = 2.5833ft → position = offset
    const position = resolveFromOffset("south", 2 + 7 / 12, "west", 10, 3);
    expect(position).toBeCloseTo(2 + 7 / 12, 4);
  });

  it("computes position from end of horizontal wall (north wall, from:east)", () => {
    // North wall runs west→east; "east" is the end
    // offset: 4ft, openingWidth: 4ft, wallInteriorLength: 12ft
    // position = 12 - 4 - 4 = 4ft
    const position = resolveFromOffset("east", 4, "north", 12, 4);
    expect(position).toBeCloseTo(4, 4);
  });

  it("computes position from start end of horizontal wall (south wall, from:west)", () => {
    // South wall runs west→east; "west" is the start end
    // offset: 3ft → position = 3ft
    const position = resolveFromOffset("west", 3, "south", 15, 3);
    expect(position).toBeCloseTo(3, 4);
  });

  it("computes position from end of vertical wall (east wall, from:north)", () => {
    // East wall runs south→north; "north" is the end
    // offset: 2ft, openingWidth: 6ft, wallInteriorLength: 10ft
    // position = 10 - 2 - 6 = 2ft
    const position = resolveFromOffset("north", 2, "east", 10, 6);
    expect(position).toBeCloseTo(2, 4);
  });
});

describe("from/offset opening placement via resolveLayout", () => {
  it("resolves door on west wall with from:south, offset:2ft 7in", () => {
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
          west:
            type: exterior
            openings:
              - type: door
                from: south
                offset: 2ft 7in
                width: 3ft
                swing: inward-right
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const west = room.walls.find((w) => w.direction === "west")!;

    expect(west.openings).toHaveLength(1);
    const door = west.openings[0];
    expect(door.type).toBe("door");
    expect(door.width).toBe(3);
    // Position = offset = 2ft 7in = 2.5833ft from wall start (south)
    // gapStart.y = wallRect.y + interiorStartOffset + position = 0 + 0 + 2.5833
    expect(door.gapStart.y).toBeCloseTo(2 + 7 / 12, 3);
    expect(door.gapEnd.y).toBeCloseTo(2 + 7 / 12 + 3, 3);
  });

  it("resolves window on north wall with from:east, offset:4ft", () => {
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
          north:
            type: exterior
            openings:
              - type: window
                from: east
                offset: 4ft
                width: 4ft
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const north = room.walls.find((w) => w.direction === "north")!;

    expect(north.openings).toHaveLength(1);
    const window = north.openings[0];
    // position = wallInteriorLength - offset - width = 12 - 4 - 4 = 4ft from start (west)
    // gapStart.x = wallRect.x + interiorStartOffset + position
    const westThickness = room.walls.find((w) => w.direction === "west")!
      .thickness;
    expect(window.gapStart.x).toBeCloseTo(
      north.rect.x + westThickness + 4,
      3,
    );
    expect(window.gapEnd.x).toBeCloseTo(north.rect.x + westThickness + 8, 3);
  });

  it("resolves opening with position: center", () => {
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
          north:
            type: exterior
            openings:
              - type: window
                position: center
                width: 4ft
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const north = room.walls.find((w) => w.direction === "north")!;

    expect(north.openings).toHaveLength(1);
    const window = north.openings[0];
    // center = (wallInteriorLength - openingWidth) / 2 = (10 - 4) / 2 = 3ft
    const westThickness = room.walls.find((w) => w.direction === "west")!
      .thickness;
    expect(window.gapStart.x).toBeCloseTo(
      north.rect.x + westThickness + 3,
      3,
    );
    expect(window.gapEnd.x).toBeCloseTo(north.rect.x + westThickness + 7, 3);
  });

  it("existing numeric position is unchanged", () => {
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
          west:
            type: exterior
            openings:
              - type: door
                position: 4ft
                width: 3ft
                swing: inward-right
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const room = plan.rooms[0];
    const west = room.walls.find((w) => w.direction === "west")!;

    expect(west.openings).toHaveLength(1);
    const door = west.openings[0];
    expect(door.gapStart.y).toBe(4);
    expect(door.gapEnd.y).toBe(7);
  });

  it("throws error when neither position nor from/offset provided", () => {
    // This is caught at parse time by Zod refine, but also at resolver level
    // The Zod schema rejects this at parse time
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
          north:
            type: exterior
            openings:
              - type: door
                width: 3ft
`;
    expect(() => parseConfig(yaml)).toThrow("Invalid FloorScript config");
  });
});
