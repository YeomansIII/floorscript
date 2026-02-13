import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/parser/config-parser.js";

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

describe("parseConfig", () => {
  it("parses the minimal YAML example from the spec", () => {
    const config = parseConfig(MINIMAL_YAML);
    expect(config.version).toBe("0.1");
    expect(config.project.title).toBe("Test Room");
    expect(config.units).toBe("imperial");
    expect(config.plans).toHaveLength(1);

    const plan = config.plans[0];
    expect(plan.id).toBe("main");
    expect(plan.rooms).toHaveLength(1);

    const room = plan.rooms[0];
    expect(room.id).toBe("room1");
    expect(room.label).toBe("Living Room");
    expect(room.position).toEqual([0, 0]);
    expect(room.width).toBe("15ft");
    expect(room.height).toBe("12ft");
  });

  it("parses walls with openings", () => {
    const config = parseConfig(MINIMAL_YAML);
    const room = config.plans[0].rooms[0];

    expect(room.walls?.north?.type).toBe("exterior");
    expect(room.walls?.south?.type).toBe("exterior");

    const eastWall = room.walls?.east;
    expect(eastWall?.type).toBe("exterior");
    expect(eastWall?.openings).toHaveLength(1);
    expect(eastWall?.openings?.[0].type).toBe("window");
    expect(eastWall?.openings?.[0].width).toBe("6ft");

    const westWall = room.walls?.west;
    expect(westWall?.openings).toHaveLength(1);
    expect(westWall?.openings?.[0].type).toBe("door");
    expect(westWall?.openings?.[0].swing).toBe("inward-right");
  });

  it("parses equivalent JSON", () => {
    const json = JSON.stringify({
      version: "0.1",
      project: { title: "JSON Test" },
      units: "imperial",
      plans: [
        {
          id: "main",
          title: "Plan",
          rooms: [
            {
              id: "r1",
              label: "Room",
              position: [0, 0],
              width: 10,
              height: 8,
            },
          ],
        },
      ],
    });

    const config = parseConfig(json);
    expect(config.project.title).toBe("JSON Test");
    expect(config.plans[0].rooms[0].width).toBe(10);
  });

  it("throws on missing required fields", () => {
    expect(() => parseConfig(`{}`)).toThrow("Invalid FloorScript config");
    expect(() => parseConfig(`version: "0.1"\nunits: imperial`)).toThrow(
      "Invalid FloorScript config",
    );
  });

  it("throws on invalid YAML/JSON", () => {
    expect(() => parseConfig("}{invalid")).toThrow();
  });

  it("accepts metric units", () => {
    const yaml = `
version: "0.1"
project:
  title: "Metric Test"
units: metric
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
        label: "Room"
        position: [0, 0]
        width: 5m
        height: 4m
`;
    const config = parseConfig(yaml);
    expect(config.units).toBe("metric");
    expect(config.plans[0].rooms[0].width).toBe("5m");
  });

  it("parses valid electrical config", () => {
    const yaml = `
version: "0.1"
project:
  title: "Electrical Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
        label: "Room"
        position: [0, 0]
        width: 12ft
        height: 10ft
    electrical:
      panel:
        position: [0.5ft, 9ft]
        amps: 200
        label: "Main Panel"
      outlets:
        - type: duplex
          position: [3ft, 0]
          wall: r1.south
          circuit: 1
        - type: gfci
          position: [4ft, 0]
          wall: r1.south
          circuit: 2
      switches:
        - type: single
          position: [1ft, 0]
          wall: r1.west
          controls: [light-1]
          circuit: 1
      fixtures:
        - id: light-1
          type: recessed
          position: [6ft, 5ft]
          circuit: 1
      smoke_detectors:
        - position: [6ft, 5ft]
          type: combo
      runs:
        - circuit: 1
          path: [[0.5ft, 9ft], [6ft, 5ft]]
          style: solid
`;
    const config = parseConfig(yaml);
    expect(config.plans[0].electrical).toBeDefined();
    expect(config.plans[0].electrical!.panel!.amps).toBe(200);
    expect(config.plans[0].electrical!.outlets).toHaveLength(2);
    expect(config.plans[0].electrical!.switches).toHaveLength(1);
    expect(config.plans[0].electrical!.fixtures).toHaveLength(1);
    expect(config.plans[0].electrical!.smoke_detectors).toHaveLength(1);
    expect(config.plans[0].electrical!.runs).toHaveLength(1);
  });

  it("rejects invalid outlet type", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
        label: "Room"
        position: [0, 0]
        width: 10ft
        height: 8ft
    electrical:
      outlets:
        - type: invalid-outlet
          position: [1ft, 0]
          wall: r1.south
`;
    expect(() => parseConfig(yaml)).toThrow("Invalid FloorScript config");
  });

  it("parses valid plumbing config", () => {
    const yaml = `
version: "0.1"
project:
  title: "Plumbing Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
        label: "Room"
        position: [0, 0]
        width: 8ft
        height: 6ft
    plumbing:
      fixtures:
        - id: sink
          type: kitchen-sink
          position: [3ft, 5ft]
          width: 33in
          depth: 22in
          supply: [hot, cold]
          drain: true
      supply_runs:
        - type: hot
          path: [[0ft, 3ft], [3ft, 5ft]]
          size: "1/2in"
      drain_runs:
        - path: [[3ft, 5ft], [3ft, 0ft]]
          size: "2in"
          slope: "1/4in per ft"
      valves:
        - type: shutoff
          position: [3ft, 4ft]
          line: hot
      water_heater:
        position: [0.5ft, 0.5ft]
        type: tank
        capacity: "50gal"
`;
    const config = parseConfig(yaml);
    expect(config.plans[0].plumbing).toBeDefined();
    expect(config.plans[0].plumbing!.fixtures).toHaveLength(1);
    expect(config.plans[0].plumbing!.supply_runs).toHaveLength(1);
    expect(config.plans[0].plumbing!.drain_runs).toHaveLength(1);
    expect(config.plans[0].plumbing!.valves).toHaveLength(1);
    expect(config.plans[0].plumbing!.water_heater!.type).toBe("tank");
  });

  it("rejects invalid plumbing fixture type", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
        label: "Room"
        position: [0, 0]
        width: 10ft
        height: 8ft
    plumbing:
      fixtures:
        - type: hot-tub
          position: [1ft, 1ft]
`;
    expect(() => parseConfig(yaml)).toThrow("Invalid FloorScript config");
  });

  it("parses layer visibility config", () => {
    const yaml = `
version: "0.1"
project:
  title: "Layer Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
        label: "Room"
        position: [0, 0]
        width: 10ft
        height: 8ft
    layers:
      structural:
        visible: true
      electrical:
        visible: true
        color_override: null
      plumbing:
        visible: false
`;
    const config = parseConfig(yaml);
    const layers = config.plans[0].layers;
    expect(layers).toBeDefined();
    expect(layers!.structural.visible).toBe(true);
    expect(layers!.electrical.visible).toBe(true);
    expect(layers!.plumbing.visible).toBe(false);
  });

  it("parses wall stud config", () => {
    const yaml = `
version: "0.1"
project:
  title: "Stud Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
        label: "Room"
        position: [0, 0]
        width: 10ft
        height: 8ft
        walls:
          north: { type: exterior, stud: 2x6 }
          south: { type: interior, stud: 2x4 }
          east: { type: exterior, stud: 2x8, finish: 0.75in }
          west: { type: interior }
`;
    const config = parseConfig(yaml);
    const walls = config.plans[0].rooms[0].walls!;
    expect(walls.north!.stud).toBe("2x6");
    expect(walls.south!.stud).toBe("2x4");
    expect(walls.east!.stud).toBe("2x8");
    expect(walls.east!.finish).toBe("0.75in");
    expect(walls.west!.stud).toBeUndefined();
  });

  it("rejects invalid stud size", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
        label: "Room"
        position: [0, 0]
        width: 10ft
        height: 8ft
        walls:
          north: { type: exterior, stud: 2x12 }
`;
    expect(() => parseConfig(yaml)).toThrow("Invalid FloorScript config");
  });

  it("parses shared_walls config", () => {
    const yaml = `
version: "0.1"
project:
  title: "Shared Walls Test"
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
      - id: kitchen
        label: "Kitchen"
        position: [15ft, 0]
        width: 12ft
        height: 10ft
    shared_walls:
      - rooms: [living, kitchen]
        wall: east/west
        thickness: 4.5in
        openings:
          - type: door
            style: cased-opening
            position: 1ft
            width: 6ft
`;
    const config = parseConfig(yaml);
    const shared = config.plans[0].shared_walls;
    expect(shared).toHaveLength(1);
    expect(shared![0].rooms).toEqual(["living", "kitchen"]);
    expect(shared![0].wall).toBe("east/west");
    expect(shared![0].thickness).toBe("4.5in");
    expect(shared![0].openings).toHaveLength(1);
    expect(shared![0].openings![0].style).toBe("cased-opening");
  });

  it("parses room with enclosures", () => {
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
    const room = config.plans[0].rooms[0];
    expect(room.enclosures).toHaveLength(1);
    expect(room.enclosures![0].id).toBe("closet");
    expect(room.enclosures![0].label).toBe("Closet");
    expect(room.enclosures![0].corner).toBe("northwest");
    expect(room.enclosures![0].facing).toBe("east");
    expect(room.enclosures![0].length).toBe("6ft");
    expect(room.enclosures![0].depth).toBe("2ft 4in");
    expect(room.enclosures![0].walls?.east?.openings).toHaveLength(1);
  });

  it("parses room with extensions", () => {
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
        extensions:
          - id: window-nook
            label: "Window Nook"
            wall: north
            from: east
            offset: 4ft 8in
            width: 3ft 9in
            depth: 5ft 4in
            walls:
              north:
                type: exterior
                openings:
                  - type: window
                    position: 6in
                    width: 2ft 9in
`;
    const config = parseConfig(yaml);
    const room = config.plans[0].rooms[0];
    expect(room.extensions).toHaveLength(1);
    expect(room.extensions![0].id).toBe("window-nook");
    expect(room.extensions![0].wall).toBe("north");
    expect(room.extensions![0].from).toBe("east");
    expect(room.extensions![0].offset).toBe("4ft 8in");
    expect(room.extensions![0].width).toBe("3ft 9in");
    expect(room.extensions![0].depth).toBe("5ft 4in");
  });

  it("parses openings with from/offset", () => {
    const yaml = `
version: "0.1"
project:
  title: "From/Offset Test"
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
    const opening = config.plans[0].rooms[0].walls?.west?.openings?.[0];
    expect(opening?.from).toBe("south");
    expect(opening?.offset).toBe("2ft 7in");
    expect(opening?.position).toBeUndefined();
    expect(opening?.width).toBe("3ft");
  });

  it("rejects enclosure with both corner and wall", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
        label: "Room"
        position: [0, 0]
        width: 10ft
        height: 8ft
        enclosures:
          - id: closet
            label: "Closet"
            corner: northwest
            wall: north
            length: 6ft
            depth: 2ft
`;
    expect(() => parseConfig(yaml)).toThrow("Invalid FloorScript config");
  });

  it("rejects opening with neither position nor from/offset", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
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

  it("parses opening with position: center", () => {
    const yaml = `
version: "0.1"
project:
  title: "Center Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
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
    const opening = config.plans[0].rooms[0].walls?.north?.openings?.[0];
    expect(opening?.position).toBe("center");
  });

  it("parses enclosure with length: full", () => {
    const yaml = `
version: "0.1"
project:
  title: "Full Length Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: r1
        label: "Room"
        position: [0, 0]
        width: 10ft
        height: 8ft
        enclosures:
          - id: closet
            label: "Closet"
            wall: north
            length: full
            depth: 2ft
`;
    const config = parseConfig(yaml);
    const enc = config.plans[0].rooms[0].enclosures![0];
    expect(enc.length).toBe("full");
    expect(enc.wall).toBe("north");
  });
});
