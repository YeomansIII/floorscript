import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/parser/config-parser.js";
import { resolveElectrical } from "../src/resolver/electrical-resolver.js";
import { resolveLayout } from "../src/resolver/layout-resolver.js";
import { buildWallGraph } from "../src/resolver/shared-wall-resolver.js";
import { resolveWalls } from "../src/resolver/wall-resolver.js";
import { findWallById } from "../src/resolver/wall-utils.js";
import type { ResolvedRoom, Wall, WallGraph } from "../src/types/geometry.js";

// Helper: build minimal resolved rooms and a wall graph for testing
function makeRoomsAndGraph(
  ...roomDefs: [string, number, number, number, number][]
): { rooms: ResolvedRoom[]; wallGraph: WallGraph } {
  const rooms: ResolvedRoom[] = [];
  const parentWallsByRoom = new Map<string, Wall[]>();
  for (const [id, x, y, width, height] of roomDefs) {
    const bounds = { x, y, width, height };
    const walls = resolveWalls(undefined, id, bounds, "imperial");
    rooms.push({
      id,
      label: id,
      bounds,
      labelPosition: { x: x + width / 2, y: y + height / 2 },
    });
    parentWallsByRoom.set(id, walls);
  }
  const wallGraph = buildWallGraph(rooms, parentWallsByRoom);
  return { rooms, wallGraph };
}

// Default interior thickness: 2x4 (3.5") + 0.5" x 2 = 4.5" = 0.375ft
const _INT_THICK = 4.5 / 12;

describe("electrical resolver", () => {
  const { rooms, wallGraph } = makeRoomsAndGraph(
    ["kitchen", 0, 0, 12, 10],
    ["living", 12, 0, 15, 12],
  );

  it("resolves panel position", () => {
    const result = resolveElectrical(
      { panel: { position: ["1ft", "8ft"], amps: 200, label: "Main" } },
      rooms,
      "imperial",
    );

    expect(result.panel).toBeDefined();
    expect(result.panel!.position).toEqual({ x: 1, y: 8 });
    expect(result.panel!.amps).toBe(200);
    expect(result.panel!.label).toBe("Main");
  });

  it("resolves outlet on south wall at correct centerline position", () => {
    const result = resolveElectrical(
      {
        outlets: [
          {
            type: "duplex",
            position: ["3ft", "0"],
            wall: "kitchen.south",
            circuit: 1,
          },
        ],
      },
      rooms,
      "imperial",
      wallGraph,
    );

    expect(result.outlets).toHaveLength(1);
    const outlet = result.outlets[0];
    expect(outlet.outletType).toBe("duplex");
    expect(outlet.wallDirection).toBe("south");
    expect(outlet.wallId).toBe("kitchen.south");
    // South wall extends below room: rect at y = -thickness
    // Offset 3ft along x, centerline at y = rect.y + thickness/2
    expect(outlet.position.x).toBe(3);
    const southWall = wallGraph.byRoom.get("kitchen")!.get("south")!;
    expect(outlet.position.y).toBeCloseTo(
      southWall.rect.y + southWall.thickness / 2,
      5,
    );
  });

  it("resolves outlet on east wall (vertical) at correct centerline position", () => {
    const result = resolveElectrical(
      {
        outlets: [
          {
            type: "gfci",
            position: ["5ft", "0"],
            wall: "kitchen.east",
            circuit: 2,
          },
        ],
      },
      rooms,
      "imperial",
      wallGraph,
    );

    const outlet = result.outlets[0];
    expect(outlet.wallDirection).toBe("east");
    // East wall extends right of room: rect at x = 12
    const eastWall = wallGraph.byRoom.get("kitchen")!.get("east")!;
    expect(outlet.position.y).toBe(5);
    expect(outlet.position.x).toBeCloseTo(
      eastWall.rect.x + eastWall.thickness / 2,
      5,
    );
  });

  it("resolves switch with controls", () => {
    const result = resolveElectrical(
      {
        switches: [
          {
            type: "three-way",
            position: ["2ft", "0"],
            wall: "living.west",
            controls: ["light-1"],
            circuit: 1,
          },
        ],
      },
      rooms,
      "imperial",
      wallGraph,
    );

    expect(result.switches).toHaveLength(1);
    const sw = result.switches[0];
    expect(sw.switchType).toBe("three-way");
    expect(sw.controls).toEqual(["light-1"]);
    expect(sw.circuit).toBe(1);
  });

  it("resolves light fixture to plan-absolute coordinates", () => {
    const result = resolveElectrical(
      {
        fixtures: [
          {
            id: "k-light",
            type: "recessed",
            position: ["6ft", "5ft"],
            circuit: 1,
          },
        ],
      },
      rooms,
      "imperial",
    );

    expect(result.fixtures).toHaveLength(1);
    const fixture = result.fixtures[0];
    expect(fixture.id).toBe("k-light");
    expect(fixture.fixtureType).toBe("recessed");
    expect(fixture.position).toEqual({ x: 6, y: 5 });
    expect(fixture.circuit).toBe(1);
  });

  it("resolves smoke detector", () => {
    const result = resolveElectrical(
      {
        smoke_detectors: [{ position: ["6ft", "5ft"], type: "combo" }],
      },
      rooms,
      "imperial",
    );

    expect(result.smokeDetectors).toHaveLength(1);
    expect(result.smokeDetectors[0].detectorType).toBe("combo");
    expect(result.smokeDetectors[0].position).toEqual({ x: 6, y: 5 });
  });

  it("resolves run paths correctly", () => {
    const result = resolveElectrical(
      {
        runs: [
          {
            circuit: 1,
            path: [
              ["1ft", "8ft"],
              ["1ft", "5ft"],
              ["6ft", "5ft"],
            ],
            style: "solid",
          },
        ],
      },
      rooms,
      "imperial",
    );

    expect(result.runs).toHaveLength(1);
    const run = result.runs[0];
    expect(run.circuit).toBe(1);
    expect(run.style).toBe("solid");
    expect(run.path).toEqual([
      { x: 1, y: 8 },
      { x: 1, y: 5 },
      { x: 6, y: 5 },
    ]);
  });

  it("defaults run style to solid", () => {
    const result = resolveElectrical(
      {
        runs: [
          {
            circuit: 1,
            path: [
              ["0", "0"],
              ["1ft", "1ft"],
            ],
          },
        ],
      },
      rooms,
      "imperial",
    );

    expect(result.runs[0].style).toBe("solid");
  });

  it("returns empty arrays when no elements provided", () => {
    const result = resolveElectrical({}, rooms, "imperial");
    expect(result.outlets).toEqual([]);
    expect(result.switches).toEqual([]);
    expect(result.fixtures).toEqual([]);
    expect(result.smokeDetectors).toEqual([]);
    expect(result.runs).toEqual([]);
    expect(result.panel).toBeUndefined();
  });
});

describe("findWallById", () => {
  const { rooms, wallGraph } = makeRoomsAndGraph(
    ["kitchen", 0, 0, 12, 10],
    ["living", 12, 0, 15, 12],
  );

  it("finds wall by roomId.direction", () => {
    const { room, wall } = findWallById("kitchen.south", rooms, wallGraph);
    expect(room.id).toBe("kitchen");
    expect(wall.direction).toBe("south");
  });

  it("throws on invalid format (no dot)", () => {
    expect(() => findWallById("kitchen", rooms, wallGraph)).toThrow(
      'expected format "roomId.direction"',
    );
  });

  it("throws on invalid direction", () => {
    expect(() => findWallById("kitchen.up", rooms, wallGraph)).toThrow(
      'Invalid wall direction "up"',
    );
  });

  it("throws on unknown room", () => {
    expect(() => findWallById("garage.south", rooms, wallGraph)).toThrow(
      'Room "garage" not found',
    );
  });

  it("finds enclosure wall by subSpaceId.direction", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bedroom
        label: "Bedroom"
        position: [0, 0]
        width: 12ft
        height: 10ft
        enclosures:
          - id: closet
            label: "Closet"
            corner: northwest
            facing: east
            length: 6ft
            depth: 3ft
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
    const { room, wall, direction } = findWallById(
      "closet.east",
      plan.rooms,
      plan.wallGraph,
    );
    expect(room.id).toBe("bedroom"); // returns parent room
    expect(wall.source).toBe("enclosure");
    expect(wall.subSpaceId).toBe("closet");
    expect(direction).toBe("east");
  });

  it("finds extension wall by subSpaceId.direction", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bedroom
        label: "Bedroom"
        position: [0, 0]
        width: 12ft
        height: 10ft
        extensions:
          - id: nook
            label: "Window Nook"
            wall: north
            from: west
            offset: 3ft
            width: 4ft
            depth: 2ft
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);
    const { room, wall, direction } = findWallById(
      "nook.north",
      plan.rooms,
      plan.wallGraph,
    );
    expect(room.id).toBe("bedroom"); // returns parent room
    expect(wall.source).toBe("extension");
    expect(wall.subSpaceId).toBe("nook");
    expect(direction).toBe("north");
  });
});

describe("outlet on enclosure wall", () => {
  it("resolves outlet on an enclosure wall to correct position", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bedroom
        label: "Bedroom"
        position: [0, 0]
        width: 12ft
        height: 10ft
        enclosures:
          - id: closet
            label: "Closet"
            corner: northwest
            facing: east
            length: 6ft
            depth: 3ft
            walls:
              east:
                type: interior
                openings:
                  - type: door
                    position: 1ft
                    width: 2ft 6in
                    style: bifold
    electrical:
      outlets:
        - type: duplex
          position: [1ft, 0]
          wall: closet.east
          circuit: 1
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    expect(plan.electrical).toBeDefined();
    expect(plan.electrical!.outlets).toHaveLength(1);
    const outlet = plan.electrical!.outlets[0];
    expect(outlet.wallId).toBe("closet.east");
    expect(outlet.wallDirection).toBe("east");
    // Closet is in NW corner: x=0, depth=3ft, so east wall at x=3
    const closetEast = plan.wallGraph.bySubSpace.get("closet")!.get("east")!;
    expect(outlet.position.x).toBeCloseTo(
      closetEast.rect.x + closetEast.thickness / 2,
      3,
    );
  });
});

describe("electrical resolver integration via resolveLayout", () => {
  it("resolves electrical from YAML config", () => {
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
    electrical:
      panel:
        position: [0.5ft, 9ft]
        amps: 100
      outlets:
        - type: duplex
          position: [4ft, 0]
          wall: room1.south
          circuit: 1
      fixtures:
        - id: light1
          type: recessed
          position: [6ft, 5ft]
          circuit: 1
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    expect(plan.electrical).toBeDefined();
    expect(plan.electrical!.panel!.amps).toBe(100);
    expect(plan.electrical!.outlets).toHaveLength(1);
    expect(plan.electrical!.fixtures).toHaveLength(1);
    expect(plan.electrical!.fixtures[0].position).toEqual({ x: 6, y: 5 });
  });
});
