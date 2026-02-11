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
    expect(() =>
      parseConfig(`version: "0.1"\nunits: imperial`),
    ).toThrow("Invalid FloorScript config");
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
});
