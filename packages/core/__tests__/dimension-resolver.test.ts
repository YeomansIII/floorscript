import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/parser/config-parser.js";
import { resolveLayout } from "../src/resolver/layout-resolver.js";
import {
  extractBuildingEdges,
  buildChainDimensions,
  deduplicateAcrossDirections,
  detectTextCollisions,
  generateUncoveredDimensions,
  computeExtensionOuterExtent,
  generateSubSpaceDimensions,
} from "../src/resolver/dimension-resolver.js";

// 3-room layout: kitchen (12ft) | dining (14ft) | living (10ft) along north edge
const THREE_ROOM_YAML = `
version: "0.1"
project:
  title: "Three Room North Edge"
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
          alignment: start
        width: 14ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: interior }
          west: { type: interior }
      - id: living
        label: "Living"
        adjacent_to:
          room: dining
          wall: east
          alignment: start
        width: 10ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: exterior }
          west: { type: interior }
`;

// Single room with all exterior walls
const SINGLE_ROOM_YAML = `
version: "0.1"
project:
  title: "Single Room"
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

describe("extractBuildingEdges", () => {
  it("groups 3-room north edge into a single edge group with 3 segments (T022)", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );

    // North edge should have groups
    const northGroups = edgeGroups.get("north");
    expect(northGroups).toBeDefined();
    expect(northGroups!.length).toBeGreaterThanOrEqual(1);

    // Find the group containing all 3 rooms (they share a collinear north edge)
    const mainGroup = northGroups!.find((g) => g.segments.length === 3);
    expect(mainGroup).toBeDefined();
    expect(mainGroup!.direction).toBe("north");

    // Segments should be ordered by start position (left to right)
    const segs = mainGroup!.segments;
    expect(segs[0].roomId).toBe("kitchen");
    expect(segs[1].roomId).toBe("dining");
    expect(segs[2].roomId).toBe("living");

    // Kitchen segment: start=0, end=12
    expect(segs[0].start).toBeCloseTo(0, 1);
    expect(segs[0].end).toBeCloseTo(12, 1);

    // Segments should be ordered: kitchen.end <= dining.start <= dining.end <= living.start
    expect(segs[0].end).toBeLessThanOrEqual(segs[1].start + 0.01);
    expect(segs[1].end).toBeLessThanOrEqual(segs[2].start + 0.01);

    // Living room segment width should be ~10ft
    expect(segs[2].end - segs[2].start).toBeCloseTo(10, 1);
  });

  it("south edge also has 3 segments for the 3-room layout", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );

    const southGroups = edgeGroups.get("south");
    expect(southGroups).toBeDefined();

    const mainGroup = southGroups!.find((g) => g.segments.length === 3);
    expect(mainGroup).toBeDefined();
    expect(mainGroup!.segments[0].roomId).toBe("kitchen");
    expect(mainGroup!.segments[1].roomId).toBe("dining");
    expect(mainGroup!.segments[2].roomId).toBe("living");
  });

  it("east and west edges have single-room segments", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );

    // West edge: only kitchen
    const westGroups = edgeGroups.get("west");
    expect(westGroups).toBeDefined();
    expect(westGroups!.length).toBe(1);
    expect(westGroups![0].segments).toHaveLength(1);
    expect(westGroups![0].segments[0].roomId).toBe("kitchen");

    // East edge: only living
    const eastGroups = edgeGroups.get("east");
    expect(eastGroups).toBeDefined();
    expect(eastGroups!.length).toBe(1);
    expect(eastGroups![0].segments).toHaveLength(1);
    expect(eastGroups![0].segments[0].roomId).toBe("living");
  });
});

describe("buildChainDimensions — lane generation and suppression", () => {
  it("generates lane 0 and lane 1 for multi-room edges (T023)", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );
    const chains = buildChainDimensions(edgeGroups, "imperial");

    // North edge has 3 rooms → should have lane 0 AND lane 1
    const northChains = chains.filter((c) => c.direction === "north");
    const northLane0 = northChains.find((c) => c.lane === 0);
    const northLane1 = northChains.find((c) => c.lane === 1);

    expect(northLane0).toBeDefined();
    // 3 rooms + 2 wall-gap segments = 5 (no leading/trailing without wallGraph)
    expect(northLane0!.segments).toHaveLength(5);
    expect(northLane0!.orientation).toBe("horizontal");
    // Room segments
    const roomSegs = northLane0!.segments.filter((s) => s.segmentType === "room");
    expect(roomSegs).toHaveLength(3);
    // Wall gap segments
    const wallSegs = northLane0!.segments.filter((s) => s.segmentType === "wall");
    expect(wallSegs).toHaveLength(2);

    expect(northLane1).toBeDefined();
    expect(northLane1!.segments).toHaveLength(1);
    expect(northLane1!.orientation).toBe("horizontal");

    // Lane 1 overall dimension should span the full building width
    const overallSeg = northLane1!.segments[0];
    expect(overallSeg.roomId).toBe("overall");
    expect(overallSeg.segmentType).toBe("overall");

    // Lane 1 offset should be further from building than lane 0
    expect(Math.abs(northLane1!.offset)).toBeGreaterThan(
      Math.abs(northLane0!.offset),
    );
  });

  it("suppresses lane 1 for single-room edges (FR-003)", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );
    const chains = buildChainDimensions(edgeGroups, "imperial");

    // West edge has only kitchen → should have lane 0, NO lane 1
    const westChains = chains.filter((c) => c.direction === "west");
    const westLane0 = westChains.find((c) => c.lane === 0);
    const westLane1 = westChains.find((c) => c.lane === 1);

    expect(westLane0).toBeDefined();
    expect(westLane0!.segments).toHaveLength(1);
    expect(westLane1).toBeUndefined();

    // East edge has only living → should have lane 0, NO lane 1
    const eastChains = chains.filter((c) => c.direction === "east");
    const eastLane0 = eastChains.find((c) => c.lane === 0);
    const eastLane1 = eastChains.find((c) => c.lane === 1);

    expect(eastLane0).toBeDefined();
    expect(eastLane0!.segments).toHaveLength(1);
    expect(eastLane1).toBeUndefined();
  });

  it("single-room plan has no lane 1 on any edge", () => {
    const config = parseConfig(SINGLE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );
    const chains = buildChainDimensions(edgeGroups, "imperial");

    // All chains should be lane 0
    expect(chains.every((c) => c.lane === 0)).toBe(true);
    // 4 edges, each with 1 chain
    expect(chains).toHaveLength(4);
  });

  it("lane 0 segments have correct labels for room widths", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );
    const chains = buildChainDimensions(edgeGroups, "imperial");

    const northLane0 = chains.find(
      (c) => c.direction === "north" && c.lane === 0,
    )!;
    const labels = northLane0.segments.map((s) => s.label);

    // Kitchen=12ft, Dining=14ft, Living=10ft
    expect(labels).toContain("12'-0\"");
    expect(labels).toContain("14'-0\"");
    expect(labels).toContain("10'-0\"");
  });

  it("dimension offset signs are correct per direction", () => {
    const config = parseConfig(SINGLE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );
    const chains = buildChainDimensions(edgeGroups, "imperial");

    const north = chains.find((c) => c.direction === "north")!;
    const south = chains.find((c) => c.direction === "south")!;
    const east = chains.find((c) => c.direction === "east")!;
    const west = chains.find((c) => c.direction === "west")!;

    // North: positive offset (above building)
    expect(north.offset).toBeGreaterThan(0);
    // South: negative offset (below building)
    expect(south.offset).toBeLessThan(0);
    // East: positive offset (right of building)
    expect(east.offset).toBeGreaterThan(0);
    // West: negative offset (left of building)
    expect(west.offset).toBeLessThan(0);
  });
});

describe("buildChainDimensions — multi-segment chains (US2)", () => {
  it("3-room north edge produces chain with room + wall segments (T029)", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );
    const chains = buildChainDimensions(edgeGroups, "imperial");

    const northLane0 = chains.find(
      (c) => c.direction === "north" && c.lane === 0,
    )!;

    // 3 rooms + 2 wall-gap segments = 5 (no leading/trailing without wallGraph)
    expect(northLane0.segments).toHaveLength(5);

    // Room segments at indices 0, 2, 4; wall segments at 1, 3
    const roomSegs = northLane0.segments.filter((s) => s.segmentType === "room");
    const wallSegs = northLane0.segments.filter((s) => s.segmentType === "wall");
    expect(roomSegs).toHaveLength(3);
    expect(wallSegs).toHaveLength(2);

    // All adjacent segments share endpoint coordinates (continuous chain)
    for (let i = 0; i < northLane0.segments.length - 1; i++) {
      const curr = northLane0.segments[i];
      const next = northLane0.segments[i + 1];
      expect(curr.to.x).toBeCloseTo(next.from.x, 4);
      expect(curr.to.y).toBeCloseTo(next.from.y, 4);
    }

    // All segments share the same Y coordinate (horizontal baseline)
    for (const seg of northLane0.segments) {
      expect(seg.from.y).toBeCloseTo(seg.to.y, 4);
    }

    // Room labels reflect exact interior widths
    expect(roomSegs[0].label).toBe("12'-0\"");
    expect(roomSegs[1].label).toBe("14'-0\"");
    expect(roomSegs[2].label).toBe("10'-0\"");

    // Room IDs are correct
    expect(roomSegs[0].roomId).toBe("kitchen");
    expect(roomSegs[1].roomId).toBe("dining");
    expect(roomSegs[2].roomId).toBe("living");

    // Wall segments have empty roomId
    for (const ws of wallSegs) {
      expect(ws.roomId).toBe("");
    }

    // Chain is continuous: first segment starts at room1 start, last ends at room3 end
    expect(northLane0.segments[0].from.x).toBeCloseTo(0, 1);
    expect(northLane0.segments[4].to.x).toBeGreaterThan(36);
  });

  it("narrow segment gets textFits: false (T030)", () => {
    // Create a layout with a very narrow room to trigger textFits: false
    const narrowRoomYaml = `
version: "0.1"
project:
  title: "Narrow Room Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: wide
        label: "Wide Room"
        position: [0, 0]
        width: 12ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: interior }
          west: { type: exterior }
      - id: narrow
        label: "Narrow"
        adjacent_to:
          room: wide
          wall: east
          alignment: start
        width: 1ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: exterior }
          west: { type: interior }
`;
    const config = parseConfig(narrowRoomYaml);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );
    const chains = buildChainDimensions(edgeGroups, "imperial");

    // Find north edge lane 0 — 2 rooms + 1 wall gap = 3 segments
    const northLane0 = chains.find(
      (c) => c.direction === "north" && c.lane === 0,
    )!;
    expect(northLane0).toBeDefined();
    expect(northLane0.segments).toHaveLength(3);
    expect(northLane0.segments.filter((s) => s.segmentType === "room")).toHaveLength(2);
    expect(northLane0.segments.filter((s) => s.segmentType === "wall")).toHaveLength(1);

    // Find the narrow room's segment
    const narrowSeg = northLane0.segments.find((s) => s.roomId === "narrow");
    expect(narrowSeg).toBeDefined();

    // 1ft room width — label "1'-0\"" (5 chars) needs ~1.05ft text width
    // plus padding = ~1.26ft. 1ft < 1.26ft → textFits should be false
    expect(narrowSeg!.textFits).toBe(false);

    // Wide room segment should still fit
    const wideSeg = northLane0.segments.find((s) => s.roomId === "wide");
    expect(wideSeg).toBeDefined();
    expect(wideSeg!.textFits).toBe(true);
  });
});

// ---- US3: Collision Detection (T034 — deferred) ----
// TODO: Implement collision detection tests when US3 is implemented.
// Contract: detectTextCollisions(chains) accepts DimensionChain[] and returns
// DimensionChain[] with repositioned text for overlapping labels.
// See TextBoundingBox type in geometry.ts for bounding box representation.

describe("detectTextCollisions — US3 stub (T034)", () => {
  it("passthrough returns chains unchanged", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const chains = plan.dimensions;

    const result = detectTextCollisions(chains);
    expect(result).toBe(chains);
    expect(result).toHaveLength(chains.length);
  });
});

describe("generateUncoveredDimensions — US4 deduplication", () => {
  it("room width covered by north-edge chain does NOT generate duplicate (T038)", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );
    const chains = buildChainDimensions(edgeGroups, "imperial");

    // Kitchen width (12ft) is covered by both north and south edge chains
    // Kitchen height (10ft) is covered by west edge chain
    // So kitchen should have NO uncovered dimensions
    const uncovered = generateUncoveredDimensions(
      plan.rooms,
      "imperial",
      chains,
    );

    // No room in a 3-room row should have uncovered width (north+south cover all)
    // No room should have uncovered height (west covers kitchen, east covers living,
    // but dining has no exterior vertical wall — dining height IS uncovered)
    const kitchenUncovered = uncovered.filter(
      (c) => c.segments[0].roomId === "kitchen",
    );
    expect(kitchenUncovered).toHaveLength(0);

    // Living room: width covered by north+south, height covered by east
    const livingUncovered = uncovered.filter(
      (c) => c.segments[0].roomId === "living",
    );
    expect(livingUncovered).toHaveLength(0);
  });

  it("room edge NOT on perimeter generates single-segment chain (T039)", () => {
    // Dining room has interior east+west walls (no exterior vertical walls)
    // so its height (10ft) is NOT covered by any perimeter chain.
    // It should get an uncovered vertical dimension.
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );
    const chains = buildChainDimensions(edgeGroups, "imperial");
    const uncovered = generateUncoveredDimensions(
      plan.rooms,
      "imperial",
      chains,
    );

    // Dining room height should be uncovered (no exterior east/west wall)
    const diningUncovered = uncovered.filter(
      (c) => c.segments[0].roomId === "dining",
    );
    expect(diningUncovered).toHaveLength(1);
    expect(diningUncovered[0].orientation).toBe("vertical");
    expect(diningUncovered[0].segments[0].label).toBe("10'-0\"");
  });

  it("full pipeline has no duplicate dimensions for covered edges", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);

    // Count how many horizontal dimensions reference kitchen
    const kitchenHorizontal = plan.dimensions.filter(
      (c) =>
        c.orientation === "horizontal" &&
        c.segments.some((s) => s.roomId === "kitchen"),
    );

    // Kitchen width should appear in exactly one lane 0 chain per edge (north + south)
    // No additional uncovered horizontal dimension for kitchen
    const lane0Kitchen = kitchenHorizontal.filter((c) => c.lane === 0);
    for (const chain of lane0Kitchen) {
      // Each chain should have kitchen as just one segment among others
      const kitchenSeg = chain.segments.find((s) => s.roomId === "kitchen");
      expect(kitchenSeg).toBeDefined();
      expect(kitchenSeg!.label).toBe("12'-0\"");
    }

    // No uncovered chain should have kitchen width
    const uncoveredKitchen = plan.dimensions.filter(
      (c) =>
        c.id.startsWith("uncovered-") &&
        c.segments.some((s) => s.roomId === "kitchen"),
    );
    expect(uncoveredKitchen).toHaveLength(0);
  });
});

describe("edge cases — Phase 7", () => {
  it("single-room plan: R1 dedup + wall segments (T043)", () => {
    const config = parseConfig(SINGLE_ROOM_YAML);
    const plan = resolveLayout(config);

    // All dimensions should be lane 0
    expect(plan.dimensions.every((c) => c.lane === 0)).toBe(true);

    // No lane 1 chains
    const lane1 = plan.dimensions.filter((c) => c.lane === 1);
    expect(lane1).toHaveLength(0);

    // R1: north + west preferred → 2 chains (south + east removed)
    expect(plan.dimensions).toHaveLength(2);

    // Each chain has 3 segments: leading wall + room + trailing wall (R2/R3)
    for (const chain of plan.dimensions) {
      expect(chain.segments).toHaveLength(3);
      expect(chain.segments.filter((s) => s.segmentType === "room")).toHaveLength(1);
      expect(chain.segments.filter((s) => s.segmentType === "wall")).toHaveLength(2);
    }

    // Width (10ft) on horizontal chain (north), height (8ft) on vertical chain (west)
    const hChain = plan.dimensions.find((c) => c.orientation === "horizontal")!;
    expect(hChain.direction).toBe("north");
    const hRoom = hChain.segments.find((s) => s.segmentType === "room")!;
    expect(hRoom.label).toBe("10'-0\"");

    const vChain = plan.dimensions.find((c) => c.orientation === "vertical")!;
    expect(vChain.direction).toBe("west");
    const vRoom = vChain.segments.find((s) => s.segmentType === "room")!;
    expect(vRoom.label).toBe("8'-0\"");
  });

  it("L-shaped building produces separate chains per collinear segment (T044)", () => {
    // Create an L-shape: large room + smaller room adjacent to only the bottom part
    // kitchen (12x10) with dining (8x6) adjacent to east, aligned to start (south)
    // This creates an L-shape because dining is shorter than kitchen
    const lShapeYaml = `
version: "0.1"
project:
  title: "L-Shape Test"
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
          alignment: start
        width: 8ft
        height: 6ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: exterior }
          west: { type: interior }
`;
    const config = parseConfig(lShapeYaml);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );

    // North edge: kitchen goes to y=10, dining only to y=6
    // So the north edges are NOT collinear — kitchen.north is at y≈10.54,
    // dining.north is at y≈6.54. They should be in separate groups.
    const northGroups = edgeGroups.get("north");
    expect(northGroups).toBeDefined();

    // There should be 2 separate north edge groups (different perpendicular coords)
    // because the rooms have different heights
    expect(northGroups!.length).toBe(2);

    // Each group should have exactly 1 segment
    expect(northGroups![0].segments).toHaveLength(1);
    expect(northGroups![1].segments).toHaveLength(1);

    // The groups should have different perpendicular coordinates
    expect(
      Math.abs(
        northGroups![0].perpendicularCoord -
          northGroups![1].perpendicularCoord,
      ),
    ).toBeGreaterThan(1);

    // Each generates its own lane 0 chain (separate dimension lines)
    const chains = buildChainDimensions(edgeGroups, "imperial");
    const northLane0 = chains.filter(
      (c) => c.direction === "north" && c.lane === 0,
    );
    expect(northLane0).toHaveLength(2);
  });

  it("plan with extension includes bump-out in dimension span (T045)", () => {
    const extensionYaml = `
version: "0.1"
project:
  title: "Extension Dimension Test"
units: imperial
plans:
  - id: main
    title: "Plan"
    rooms:
      - id: living
        label: "Living Room"
        position: [0, 0]
        width: 14ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: interior }
          west: { type: exterior }
        extensions:
          - id: bay
            label: "Bay Window"
            wall: north
            from: west
            offset: 4ft
            width: 6ft
            depth: 2ft
            walls:
              north: { type: exterior }
              east: { type: exterior }
              west: { type: exterior }
      - id: dining
        label: "Dining"
        adjacent_to:
          room: living
          wall: east
          alignment: start
        width: 10ft
        height: 10ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: exterior }
          west: { type: interior }
`;
    const config = parseConfig(extensionYaml);
    const plan = resolveLayout(config);

    // The extension (bay window) adds 2ft depth on the north side of living room
    // The north edge of the bay is at y = 10 + 2 = 12 (plus wall thickness)
    // This creates a bump-out in the building outline

    // Check that the perimeter includes the extension
    const { perimeter } = plan.wallGraph;
    expect(perimeter).toHaveLength(1);
    // More than 4 edges (the bump-out adds extra edges)
    expect(perimeter[0].edges.length).toBeGreaterThan(4);

    // The north edge groups should include the bay window's north wall
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );

    // There should be north edge groups at different Y levels:
    // - Main north edge (living room top + dining room top at y≈10.54)
    // - Bay window north edge (at y≈12.54)
    const northGroups = edgeGroups.get("north");
    expect(northGroups).toBeDefined();
    expect(northGroups!.length).toBeGreaterThanOrEqual(1);

    // Plan bounds should extend to include the extension
    expect(plan.bounds.y + plan.bounds.height).toBeGreaterThan(12);

    // The dimensions should include chains covering the extension area
    const chains = buildChainDimensions(edgeGroups, "imperial");
    const northChains = chains.filter((c) => c.direction === "north");
    expect(northChains.length).toBeGreaterThanOrEqual(1);
  });
});

describe("R1: deduplicateAcrossDirections", () => {
  it("removes south edge groups when rooms overlap with north", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );

    // Before dedup: both north and south have groups
    expect(edgeGroups.has("north")).toBe(true);
    expect(edgeGroups.has("south")).toBe(true);

    deduplicateAcrossDirections(edgeGroups);

    // After dedup: south is removed (all rooms also in north)
    expect(edgeGroups.has("north")).toBe(true);
    expect(edgeGroups.has("south")).toBe(false);
  });

  it("keeps east edge when rooms differ from west", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );

    deduplicateAcrossDirections(edgeGroups);

    // West has kitchen, east has living → both kept (different rooms)
    expect(edgeGroups.has("west")).toBe(true);
    expect(edgeGroups.has("east")).toBe(true);
    expect(edgeGroups.get("west")![0].segments[0].roomId).toBe("kitchen");
    expect(edgeGroups.get("east")![0].segments[0].roomId).toBe("living");
  });

  it("removes east for single-room plan (room appears in west)", () => {
    const config = parseConfig(SINGLE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );

    deduplicateAcrossDirections(edgeGroups);

    // Single room → north + west preferred, south + east removed
    expect(edgeGroups.has("north")).toBe(true);
    expect(edgeGroups.has("south")).toBe(false);
    expect(edgeGroups.has("west")).toBe(true);
    expect(edgeGroups.has("east")).toBe(false);
  });
});

describe("R2+R3: wall-thickness and exterior segments", () => {
  it("3-room chain with wallGraph has 7 segments (leading + 3 rooms + 2 walls + trailing)", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );

    // Pass wallGraph to get leading/trailing exterior wall segments
    const chains = buildChainDimensions(edgeGroups, "imperial", plan.wallGraph);
    const northLane0 = chains.find(
      (c) => c.direction === "north" && c.lane === 0,
    )!;

    // Leading wall (kitchen west) + kitchen + wall + dining + wall + living + trailing wall (living east)
    expect(northLane0.segments).toHaveLength(7);
    expect(northLane0.segments.filter((s) => s.segmentType === "room")).toHaveLength(3);
    expect(northLane0.segments.filter((s) => s.segmentType === "wall")).toHaveLength(4);

    // First and last segments are exterior wall segments
    expect(northLane0.segments[0].segmentType).toBe("wall");
    expect(northLane0.segments[6].segmentType).toBe("wall");

    // Chain spans exterior-to-exterior (wider than interior bounds)
    const chainStart = northLane0.segments[0].from.x;
    const chainEnd = northLane0.segments[6].to.x;
    expect(chainStart).toBeLessThan(0); // exterior face is left of interior
    expect(chainEnd).toBeGreaterThan(36); // wider than sum of room widths
  });

  it("lane-1 overall spans exterior-to-exterior with wallGraph", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );

    const chains = buildChainDimensions(edgeGroups, "imperial", plan.wallGraph);
    const northLane1 = chains.find(
      (c) => c.direction === "north" && c.lane === 1,
    )!;

    expect(northLane1).toBeDefined();
    const overallSeg = northLane1.segments[0];
    expect(overallSeg.segmentType).toBe("overall");

    // Overall should span from exterior west face to exterior east face
    expect(overallSeg.from.x).toBeLessThan(0);
    // Interior total = 12 + 14 + 10 + walls ≈ 37+, exterior adds more
    expect(overallSeg.to.x).toBeGreaterThan(37);
  });

  it("wall segments have empty roomId", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter,
      plan.wallGraph,
      plan.rooms,
    );

    const chains = buildChainDimensions(edgeGroups, "imperial", plan.wallGraph);
    const northLane0 = chains.find(
      (c) => c.direction === "north" && c.lane === 0,
    )!;

    const wallSegs = northLane0.segments.filter((s) => s.segmentType === "wall");
    for (const ws of wallSegs) {
      expect(ws.roomId).toBe("");
      expect(ws.textFits).toBe(false); // Wall thickness too narrow for text
    }
  });

  it("wall segments do not count as coverage for uncovered dimensions", () => {
    const config = parseConfig(THREE_ROOM_YAML);
    const plan = resolveLayout(config);

    // Dining room has no exterior vertical walls → should get uncovered vertical
    const diningUncovered = plan.dimensions.filter(
      (c) =>
        c.id.startsWith("uncovered-") &&
        c.segments.some((s) => s.roomId === "dining"),
    );
    expect(diningUncovered).toHaveLength(1);
    expect(diningUncovered[0].orientation).toBe("vertical");
  });
});

// ---- Sub-space dimensions (extension + enclosure) ----

const BEDROOM_NOOK_YAML = `
version: "0.1"
project:
  title: "Bedroom with Closet and Window Nook"
units: imperial
plans:
  - id: main
    title: "Bedroom Floor Plan"
    rooms:
      - id: bedroom
        label: "Primary Bedroom"
        position: [0, 0]
        width: 14ft
        height: 12ft
        walls:
          north: { type: exterior }
          south: { type: exterior }
          east: { type: exterior }
          west: { type: exterior }
        enclosures:
          - id: closet
            label: "Walk-in Closet"
            corner: northwest
            facing: east
            length: 6ft
            depth: 4ft
            walls:
              east: { type: interior }
        extensions:
          - id: window-nook
            label: "Window Nook"
            wall: north
            from: east
            offset: 2ft
            width: 5ft
            depth: 3ft
            walls:
              north: { type: exterior }
              east: { type: exterior }
              west: { type: exterior }
`;

describe("computeExtensionOuterExtent", () => {
  it("returns far wall coord for north extension", () => {
    const config = parseConfig(BEDROOM_NOOK_YAML);
    const plan = resolveLayout(config);
    const extents = computeExtensionOuterExtent(plan.rooms, plan.wallGraph);

    // The nook extends north — the north extent should be beyond the bedroom's north wall
    const northExtent = extents.get("north");
    expect(northExtent).toBeDefined();

    // Bedroom north wall outer edge is at y ≈ 12 + wallThickness
    // Nook far wall is at y ≈ 12 + 3 + wallThickness (3ft deeper)
    const bedroomNorthWall = plan.wallGraph.byRoom.get("bedroom")?.get("north");
    expect(northExtent).toBeGreaterThan(bedroomNorthWall!.outerEdge.start.y);
  });

  it("has no extent for directions without extensions", () => {
    const config = parseConfig(BEDROOM_NOOK_YAML);
    const plan = resolveLayout(config);
    const extents = computeExtensionOuterExtent(plan.rooms, plan.wallGraph);

    // No extensions on south, east, or west
    expect(extents.has("south")).toBe(false);
    expect(extents.has("east")).toBe(false);
    expect(extents.has("west")).toBe(false);
  });
});

describe("buildChainDimensions — baseline pushed past extensions", () => {
  it("north baseline is beyond the nook far wall, not the bedroom north wall", () => {
    const config = parseConfig(BEDROOM_NOOK_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter, plan.wallGraph, plan.rooms,
    );
    deduplicateAcrossDirections(edgeGroups);

    // Without rooms (no push): baseline relative to bedroom north wall
    const chainsNoPush = buildChainDimensions(edgeGroups, "imperial", plan.wallGraph);
    const northNoPush = chainsNoPush.find(
      (c) => c.direction === "north" && c.lane === 0,
    );

    // With rooms (push past nook): baseline should be further out
    const chainsWithPush = buildChainDimensions(
      edgeGroups, "imperial", plan.wallGraph, plan.rooms,
    );
    const northWithPush = chainsWithPush.find(
      (c) => c.direction === "north" && c.lane === 0,
    );

    expect(northNoPush).toBeDefined();
    expect(northWithPush).toBeDefined();

    // The pushed baseline Y should be >= the un-pushed baseline Y
    // (north = positive direction, so pushed should be larger)
    const noPushY = northNoPush!.segments[0].from.y;
    const withPushY = northWithPush!.segments[0].from.y;
    expect(withPushY).toBeGreaterThanOrEqual(noPushY);
  });
});

describe("generateSubSpaceDimensions — extension dims", () => {
  it("generates width and depth chains for the window nook", () => {
    const config = parseConfig(BEDROOM_NOOK_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter, plan.wallGraph, plan.rooms,
    );
    deduplicateAcrossDirections(edgeGroups);
    const perimeterChains = buildChainDimensions(
      edgeGroups, "imperial", plan.wallGraph, plan.rooms,
    );
    const uncovered = generateUncoveredDimensions(
      plan.rooms, "imperial", perimeterChains,
    );
    const allChains = [...perimeterChains, ...uncovered];

    const subSpaceChains = generateSubSpaceDimensions(
      plan.rooms, "imperial", plan.wallGraph, allChains,
    );

    // Should have chains for window-nook
    const nookChains = subSpaceChains.filter((c) =>
      c.segments.some((s) => s.roomId === "window-nook"),
    );
    expect(nookChains.length).toBeGreaterThanOrEqual(2);

    // Width chain: 5ft nook width (horizontal, north direction)
    const widthChain = nookChains.find((c) => c.orientation === "horizontal");
    expect(widthChain).toBeDefined();
    expect(widthChain!.segments[0].label).toBe("5'-0\"");

    // Depth chain: 3ft nook depth (vertical, east direction)
    const depthChain = nookChains.find((c) => c.orientation === "vertical");
    expect(depthChain).toBeDefined();
    expect(depthChain!.segments[0].label).toBe("3'-0\"");
  });
});

describe("generateSubSpaceDimensions — enclosure dims", () => {
  it("generates length and depth chains for the walk-in closet", () => {
    const config = parseConfig(BEDROOM_NOOK_YAML);
    const plan = resolveLayout(config);
    const edgeGroups = extractBuildingEdges(
      plan.wallGraph.perimeter, plan.wallGraph, plan.rooms,
    );
    deduplicateAcrossDirections(edgeGroups);
    const perimeterChains = buildChainDimensions(
      edgeGroups, "imperial", plan.wallGraph, plan.rooms,
    );
    const uncovered = generateUncoveredDimensions(
      plan.rooms, "imperial", perimeterChains,
    );
    const allChains = [...perimeterChains, ...uncovered];

    const subSpaceChains = generateSubSpaceDimensions(
      plan.rooms, "imperial", plan.wallGraph, allChains,
    );

    // Should have chains for closet
    const closetChains = subSpaceChains.filter((c) =>
      c.segments.some((s) => s.roomId === "closet"),
    );
    expect(closetChains.length).toBeGreaterThanOrEqual(1);

    // Length chain (along facing wall = east): vertical, 6ft
    const lengthChain = closetChains.find((c) => c.orientation === "vertical");
    expect(lengthChain).toBeDefined();
    expect(lengthChain!.segments[0].label).toBe("6'-0\"");
  });
});

describe("full pipeline — bedroom-nook sub-space dimensions", () => {
  it("plan.dimensions includes sub-space dimension chains", () => {
    const config = parseConfig(BEDROOM_NOOK_YAML);
    const plan = resolveLayout(config);

    // Should have sub-space dimension chains
    const nookDims = plan.dimensions.filter((c) =>
      c.segments.some((s) => s.roomId === "window-nook"),
    );
    expect(nookDims.length).toBeGreaterThanOrEqual(2);

    const closetDims = plan.dimensions.filter((c) =>
      c.segments.some((s) => s.roomId === "closet"),
    );
    expect(closetDims.length).toBeGreaterThanOrEqual(1);
  });

  it("no duplicate coverage between perimeter and sub-space dims", () => {
    const config = parseConfig(BEDROOM_NOOK_YAML);
    const plan = resolveLayout(config);

    // Check that no roomId+orientation pair appears in more than the expected chains
    const coverageCount = new Map<string, number>();
    for (const chain of plan.dimensions) {
      for (const seg of chain.segments) {
        if (seg.roomId && seg.segmentType !== "wall" && seg.segmentType !== "overall") {
          const key = `${seg.roomId}:${chain.orientation}`;
          coverageCount.set(key, (coverageCount.get(key) ?? 0) + 1);
        }
      }
    }

    // Each sub-space id should appear at most once per orientation
    for (const [key, count] of coverageCount) {
      if (key.startsWith("window-nook:") || key.startsWith("closet:")) {
        expect(count).toBe(1);
      }
    }
  });
});
