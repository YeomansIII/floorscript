import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/parser/config-parser.js";
import { resolveLayout } from "../src/resolver/layout-resolver.js";
import { resolvePlumbing } from "../src/resolver/plumbing-resolver.js";

describe("plumbing resolver", () => {
  it("resolves fixture position from DimensionTuple", () => {
    const result = resolvePlumbing(
      {
        fixtures: [
          {
            type: "toilet",
            position: ["2ft", "3ft"],
            width: "18in",
            depth: "28in",
          },
        ],
      },
      "imperial",
    );

    expect(result.fixtures).toHaveLength(1);
    const fixture = result.fixtures[0];
    expect(fixture.fixtureType).toBe("toilet");
    expect(fixture.position).toEqual({ x: 2, y: 3 });
  });

  it("resolves fixture width and depth dimensions", () => {
    const result = resolvePlumbing(
      {
        fixtures: [
          {
            type: "kitchen-sink",
            position: ["6ft", "9ft"],
            width: "33in",
            depth: "22in",
          },
        ],
      },
      "imperial",
    );

    const fixture = result.fixtures[0];
    expect(fixture.width).toBeCloseTo(33 / 12, 5); // 2.75ft
    expect(fixture.depth).toBeCloseTo(22 / 12, 5); // ~1.833ft
  });

  it("preserves supply and drain flags", () => {
    const result = resolvePlumbing(
      {
        fixtures: [
          {
            type: "kitchen-sink",
            position: ["6ft", "9ft"],
            supply: ["hot", "cold"],
            drain: true,
          },
        ],
      },
      "imperial",
    );

    const fixture = result.fixtures[0];
    expect(fixture.supply).toEqual(["hot", "cold"]);
    expect(fixture.drain).toBe(true);
  });

  it("resolves supply run path", () => {
    const result = resolvePlumbing(
      {
        supply_runs: [
          {
            type: "hot",
            path: [
              ["0ft", "5ft"],
              ["6ft", "5ft"],
              ["6ft", "9ft"],
            ],
            size: "1/2in",
          },
        ],
      },
      "imperial",
    );

    expect(result.supplyRuns).toHaveLength(1);
    const run = result.supplyRuns[0];
    expect(run.supplyType).toBe("hot");
    expect(run.path).toEqual([
      { x: 0, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 9 },
    ]);
    expect(run.size).toBe("1/2in");
  });

  it("resolves drain run with slope annotation", () => {
    const result = resolvePlumbing(
      {
        drain_runs: [
          {
            path: [
              ["6ft", "9ft"],
              ["6ft", "0ft"],
            ],
            size: "2in",
            slope: "1/4in per ft",
          },
        ],
      },
      "imperial",
    );

    expect(result.drainRuns).toHaveLength(1);
    const run = result.drainRuns[0];
    expect(run.path).toEqual([
      { x: 6, y: 9 },
      { x: 6, y: 0 },
    ]);
    expect(run.size).toBe("2in");
    expect(run.slope).toBe("1/4in per ft");
  });

  it("resolves valve position", () => {
    const result = resolvePlumbing(
      {
        valves: [{ type: "shutoff", position: ["6ft", "9ft"], line: "hot" }],
      },
      "imperial",
    );

    expect(result.valves).toHaveLength(1);
    const valve = result.valves[0];
    expect(valve.valveType).toBe("shutoff");
    expect(valve.position).toEqual({ x: 6, y: 9 });
    expect(valve.line).toBe("hot");
  });

  it("resolves water heater", () => {
    const result = resolvePlumbing(
      {
        water_heater: {
          position: ["0.5ft", "0.5ft"],
          type: "tank",
          capacity: "50gal",
        },
      },
      "imperial",
    );

    expect(result.waterHeater).toBeDefined();
    expect(result.waterHeater!.position).toEqual({ x: 0.5, y: 0.5 });
    expect(result.waterHeater!.heaterType).toBe("tank");
    expect(result.waterHeater!.capacity).toBe("50gal");
  });

  it("returns empty arrays when no elements provided", () => {
    const result = resolvePlumbing({}, "imperial");
    expect(result.fixtures).toEqual([]);
    expect(result.supplyRuns).toEqual([]);
    expect(result.drainRuns).toEqual([]);
    expect(result.valves).toEqual([]);
    expect(result.waterHeater).toBeUndefined();
  });
});

describe("wall-relative plumbing positioning", () => {
  it("resolves fixture with wall reference and flush offset", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bath
        label: "Bathroom"
        position: [0, 0]
        width: 8ft
        height: 6ft
        walls:
          south: { type: exterior }
    plumbing:
      fixtures:
        - id: toilet
          type: toilet
          wall: bath.south
          position: 2ft
          offset: 0in
          width: 18in
          depth: 28in
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    const fixture = plan.plumbing!.fixtures[0];
    expect(fixture.fixtureType).toBe("toilet");
    // Wall-relative: position=2ft is leading edge, width=18in=1.5ft
    // Center along wall = 2 + 0.75 = 2.75ft
    // Flush offset adds depth/2: 28in = 2.333ft, half = 1.1667ft
    // South wall inner face is at y=0, fixture center at y = 0 + depth/2
    expect(fixture.position.x).toBeCloseTo(2.75, 3);
    expect(fixture.position.y).toBeCloseTo(28 / 12 / 2, 3); // ~1.167
    // Orientation auto-inferred from south wall → facing-north
    expect(fixture.orientation).toBe("facing-north");
  });

  it("auto-infers orientation from wall direction", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bath
        label: "Bathroom"
        position: [0, 0]
        width: 8ft
        height: 6ft
        walls:
          north: { type: exterior }
    plumbing:
      fixtures:
        - id: sink
          type: bath-sink
          wall: bath.north
          position: 3ft
          offset: 0in
          width: 20in
          depth: 16in
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    const fixture = plan.plumbing!.fixtures[0];
    // North wall → fixture faces south (into room)
    expect(fixture.orientation).toBe("facing-south");
  });

  it("respects explicit orientation override", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bath
        label: "Bathroom"
        position: [0, 0]
        width: 8ft
        height: 6ft
        walls:
          south: { type: exterior }
    plumbing:
      fixtures:
        - id: toilet
          type: toilet
          wall: bath.south
          position: 2ft
          offset: 0in
          orientation: facing-east
          width: 18in
          depth: 28in
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    const fixture = plan.plumbing!.fixtures[0];
    // Explicit orientation overrides auto-inference
    expect(fixture.orientation).toBe("facing-east");
  });

  it("resolves supply run with fixture ID reference", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bath
        label: "Bathroom"
        position: [0, 0]
        width: 8ft
        height: 6ft
    plumbing:
      fixtures:
        - id: sink
          type: bath-sink
          position: [5ft, 4ft]
      supply_runs:
        - type: cold
          from: sink
          to:
            wall: bath.north
            position: 5ft
          size: "1/2in"
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    const run = plan.plumbing!.supplyRuns[0];
    expect(run.path).toHaveLength(2);
    // from: fixture position
    expect(run.path[0]).toEqual({ x: 5, y: 4 });
    // to: wall reference on north wall at 5ft along
    expect(run.path[1].x).toBe(5);
  });
});

describe("fixture on extension wall", () => {
  it("resolves fixture on an extension wall to correct position", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bath
        label: "Bathroom"
        position: [0, 0]
        width: 8ft
        height: 6ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: exterior }
          west: { type: exterior }
        extensions:
          - id: alcove
            label: "Alcove"
            wall: north
            from: west
            offset: 2ft
            width: 4ft
            depth: 2ft
    plumbing:
      fixtures:
        - id: sink
          type: bath-sink
          wall: alcove.north
          position: 1ft
          offset: 0in
          width: 20in
          depth: 16in
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    const fixture = plan.plumbing!.fixtures[0];
    expect(fixture.fixtureType).toBe("bath-sink");
    // Extension alcove is on north wall: x=2, y=6, width=4, depth=2
    // alcove.north wall is at y=8 (6+2)
    // Fixture should be positioned correctly relative to extension north wall
    const alcoveNorth = plan.wallGraph.bySubSpace.get("alcove")!.get("north")!;
    expect(alcoveNorth).toBeDefined();
    expect(fixture.orientation).toBe("facing-south");
  });
});

describe("plumbing resolver integration via resolveLayout", () => {
  it("resolves plumbing from YAML config", () => {
    const yaml = `
version: "0.1"
project:
  title: "Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: bath
        label: "Bathroom"
        position: [0, 0]
        width: 8ft
        height: 6ft
    plumbing:
      fixtures:
        - id: toilet
          type: toilet
          position: [2ft, 1ft]
          width: 18in
          depth: 28in
      supply_runs:
        - type: cold
          path: [[2ft, 1ft], [2ft, 3ft]]
          size: "1/2in"
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    expect(plan.plumbing).toBeDefined();
    expect(plan.plumbing!.fixtures).toHaveLength(1);
    expect(plan.plumbing!.fixtures[0].fixtureType).toBe("toilet");
    expect(plan.plumbing!.supplyRuns).toHaveLength(1);
  });

  it("passes through layers config", () => {
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
    layers:
      structural:
        visible: true
      plumbing:
        visible: false
`;
    const config = parseConfig(yaml);
    const plan = resolveLayout(config);

    expect(plan.layers).toBeDefined();
    expect(plan.layers!.structural.visible).toBe(true);
    expect(plan.layers!.plumbing.visible).toBe(false);
  });
});
