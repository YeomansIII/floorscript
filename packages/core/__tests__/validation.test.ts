import { describe, expect, it } from "vitest";
import { validatePlan } from "../src/resolver/validation.js";
import type {
  ResolvedExtension,
  ResolvedOpening,
  ResolvedPlan,
  ResolvedRoom,
  Wall,
  WallGraph,
} from "../src/types/geometry.js";

/**
 * Helper to build a minimal ResolvedPlan for testing.
 */
function makePlan(overrides: Partial<ResolvedPlan> = {}): ResolvedPlan {
  return {
    project: { title: "Test", scale: "1/4in = 1ft" },
    units: "imperial",
    title: "Test Plan",
    rooms: [],
    dimensions: [],
    bounds: { x: 0, y: 0, width: 20, height: 20 },
    wallGraph: { walls: [], byRoom: new Map(), bySubSpace: new Map(), perimeter: [] },
    ...overrides,
  };
}

function makeRoom(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
): ResolvedRoom {
  return {
    id,
    label: id,
    bounds: { x, y, width: w, height: h },
    labelPosition: { x: x + w / 2, y: y + h / 2 },
  };
}

function makeOpening(
  gapStartX: number,
  gapStartY: number,
  gapEndX: number,
  gapEndY: number,
  width: number,
): ResolvedOpening {
  return {
    type: "door",
    position: { x: (gapStartX + gapEndX) / 2, y: (gapStartY + gapEndY) / 2 },
    width,
    wallDirection: "south",
    wallThickness: 0.375,
    gapStart: { x: gapStartX, y: gapStartY },
    gapEnd: { x: gapEndX, y: gapEndY },
    centerline: {
      start: { x: gapStartX, y: gapStartY },
      end: { x: gapEndX, y: gapEndY },
    },
  };
}

function makeWall(
  id: string,
  roomId: string | null,
  roomIdB: string | null,
  direction: "north" | "south" | "east" | "west" | null,
  directionInB: "north" | "south" | "east" | "west" | null,
  rect: { x: number; y: number; width: number; height: number },
  openings: ResolvedOpening[] = [],
): Wall {
  return {
    id,
    roomId: roomId ?? "",
    roomIdB,
    direction: direction ?? "south",
    directionInB,
    type: "interior",
    composition: {
      stud: null,
      studWidthFt: 0.2917,
      finishA: 0.0417,
      finishB: 0.0417,
      totalThickness: 0.375,
    },
    thickness: 0.375,
    lineWeight: 0.5,
    centerline: {
      start: { x: rect.x, y: rect.y },
      end: { x: rect.x + rect.width, y: rect.y },
    },
    outerEdge: {
      start: { x: rect.x, y: rect.y },
      end: { x: rect.x + rect.width, y: rect.y },
    },
    innerEdge: {
      start: { x: rect.x, y: rect.y + rect.height },
      end: { x: rect.x + rect.width, y: rect.y + rect.height },
    },
    rect,
    openings,
    segments: [rect],
    shared: roomId !== null && roomIdB !== null,
    interiorStartOffset: 0,
    subSpaceId: null,
    source: "parent",
  };
}

function makeWallGraph(walls: Wall[]): WallGraph {
  const byRoom = new Map<string, Map<string, Wall>>();
  for (const wall of walls) {
    if (wall.roomId && wall.direction) {
      if (!byRoom.has(wall.roomId)) byRoom.set(wall.roomId, new Map());
      byRoom.get(wall.roomId)!.set(wall.direction, wall);
    }
    if (wall.roomIdB && wall.directionInB) {
      if (!byRoom.has(wall.roomIdB)) byRoom.set(wall.roomIdB, new Map());
      byRoom.get(wall.roomIdB)!.set(wall.directionInB, wall);
    }
  }
  return { walls, byRoom, bySubSpace: new Map(), perimeter: [] } as WallGraph;
}

describe("validatePlan", () => {
  describe("overlapping-openings", () => {
    it("reports error when two openings overlap on the same wall", () => {
      // Two openings on the south wall that overlap in the x range
      const opening1 = makeOpening(2, 0, 5, 0, 3); // x: 2-5
      const opening2 = makeOpening(4, 0, 7, 0, 3); // x: 4-7, overlaps at 4-5

      const wall = makeWall(
        "room1.south",
        "room1",
        null,
        "south",
        null,
        { x: 0, y: -0.375, width: 15, height: 0.375 },
        [opening1, opening2],
      );

      const room = makeRoom("room1", 0, 0, 15, 12);
      const plan = makePlan({
        rooms: [room],
        wallGraph: makeWallGraph([wall]),
      });

      const result = validatePlan(plan);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe("overlapping-openings");
    });

    it("does not report error when openings do not overlap", () => {
      const opening1 = makeOpening(2, 0, 5, 0, 3); // x: 2-5
      const opening2 = makeOpening(7, 0, 10, 0, 3); // x: 7-10, no overlap

      const wall = makeWall(
        "room1.south",
        "room1",
        null,
        "south",
        null,
        { x: 0, y: -0.375, width: 15, height: 0.375 },
        [opening1, opening2],
      );

      const room = makeRoom("room1", 0, 0, 15, 12);
      const plan = makePlan({
        rooms: [room],
        wallGraph: makeWallGraph([wall]),
      });

      const result = validatePlan(plan);
      const overlaps = result.errors.filter(
        (e) => e.code === "overlapping-openings",
      );
      expect(overlaps).toHaveLength(0);
    });
  });

  describe("opening-exceeds-wall", () => {
    it("reports error when opening is wider than wall", () => {
      // Wall is 10ft wide, opening is 12ft
      const opening = makeOpening(0, 0, 12, 0, 12);

      const wall = makeWall(
        "room1.south",
        "room1",
        null,
        "south",
        null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [opening],
      );

      const room = makeRoom("room1", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        wallGraph: makeWallGraph([wall]),
      });

      const result = validatePlan(plan);
      const exceeds = result.errors.filter(
        (e) => e.code === "opening-exceeds-wall",
      );
      expect(exceeds).toHaveLength(1);
      expect(exceeds[0].wallId).toBe("room1.south");
    });

    it("does not report error when opening fits in wall", () => {
      const opening = makeOpening(2, 0, 5, 0, 3);

      const wall = makeWall(
        "room1.south",
        "room1",
        null,
        "south",
        null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [opening],
      );

      const room = makeRoom("room1", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        wallGraph: makeWallGraph([wall]),
      });

      const result = validatePlan(plan);
      const exceeds = result.errors.filter(
        (e) => e.code === "opening-exceeds-wall",
      );
      expect(exceeds).toHaveLength(0);
    });
  });

  describe("sealed-room", () => {
    it("warns when a room has no openings", () => {
      const wall = makeWall(
        "sealed.south",
        "sealed",
        null,
        "south",
        null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [], // no openings
      );
      const wallN = makeWall(
        "sealed.north",
        "sealed",
        null,
        "north",
        null,
        { x: 0, y: 10, width: 10, height: 0.375 },
      );
      const wallE = makeWall("sealed.east", "sealed", null, "east", null, {
        x: 10,
        y: 0,
        width: 0.375,
        height: 10,
      });
      const wallW = makeWall("sealed.west", "sealed", null, "west", null, {
        x: -0.375,
        y: 0,
        width: 0.375,
        height: 10,
      });

      const room = makeRoom("sealed", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        wallGraph: makeWallGraph([wall, wallN, wallE, wallW]),
      });

      const result = validatePlan(plan);
      const sealed = result.warnings.filter((w) => w.code === "sealed-room");
      expect(sealed).toHaveLength(1);
      expect(sealed[0].roomId).toBe("sealed");
    });

    it("does not warn when room has an opening", () => {
      const opening = makeOpening(2, 0, 5, 0, 3);
      const wall = makeWall(
        "room1.south",
        "room1",
        null,
        "south",
        null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [opening],
      );
      const wallN = makeWall("room1.north", "room1", null, "north", null, {
        x: 0,
        y: 10,
        width: 10,
        height: 0.375,
      });
      const wallE = makeWall("room1.east", "room1", null, "east", null, {
        x: 10,
        y: 0,
        width: 0.375,
        height: 10,
      });
      const wallW = makeWall("room1.west", "room1", null, "west", null, {
        x: -0.375,
        y: 0,
        width: 0.375,
        height: 10,
      });

      const room = makeRoom("room1", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        wallGraph: makeWallGraph([wall, wallN, wallE, wallW]),
      });

      const result = validatePlan(plan);
      const sealed = result.warnings.filter((w) => w.code === "sealed-room");
      expect(sealed).toHaveLength(0);
    });
  });

  describe("fixture-out-of-bounds", () => {
    it("warns when plumbing fixture is outside all room bounds", () => {
      const room = makeRoom("room1", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        plumbing: {
          fixtures: [
            {
              fixtureType: "toilet",
              position: { x: 50, y: 50 }, // far outside
            },
          ],
          supplyRuns: [],
          drainRuns: [],
          valves: [],
        },
      });

      const result = validatePlan(plan);
      const oob = result.warnings.filter(
        (w) => w.code === "fixture-out-of-bounds",
      );
      expect(oob).toHaveLength(1);
    });

    it("does not warn when fixture is inside room bounds", () => {
      const room = makeRoom("room1", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        plumbing: {
          fixtures: [
            {
              fixtureType: "toilet",
              position: { x: 5, y: 5 }, // inside
            },
          ],
          supplyRuns: [],
          drainRuns: [],
          valves: [],
        },
      });

      const result = validatePlan(plan);
      const oob = result.warnings.filter(
        (w) => w.code === "fixture-out-of-bounds",
      );
      expect(oob).toHaveLength(0);
    });
  });

  describe("run-through-wall", () => {
    it("warns when a supply run crosses a wall without an opening", () => {
      // Vertical wall at x=10 (between rooms), no openings
      const wall = makeWall(
        "room1.east|room2.west",
        "room1",
        "room2",
        "east",
        "west",
        { x: 10, y: 0, width: 0.375, height: 10 },
        [], // no openings
      );

      const room1 = makeRoom("room1", 0, 0, 10, 10);
      const room2 = makeRoom("room2", 10.375, 0, 10, 10);

      const plan = makePlan({
        rooms: [room1, room2],
        wallGraph: makeWallGraph([wall]),
        plumbing: {
          fixtures: [],
          supplyRuns: [
            {
              supplyType: "cold",
              path: [
                { x: 5, y: 5 },
                { x: 15, y: 5 }, // crosses wall at x=10
              ],
            },
          ],
          drainRuns: [],
          valves: [],
        },
      });

      const result = validatePlan(plan);
      const rtw = result.warnings.filter((w) => w.code === "run-through-wall");
      expect(rtw).toHaveLength(1);
      expect(rtw[0].wallId).toBe("room1.east|room2.west");
    });

    it("does not warn when run crosses through an opening in the wall", () => {
      // Opening in the wall at y: 3-7
      const opening = makeOpening(10, 3, 10, 7, 4);
      // Override wallDirection to east for proper gap checking
      opening.wallDirection = "east";

      const wall = makeWall(
        "room1.east|room2.west",
        "room1",
        "room2",
        "east",
        "west",
        { x: 10, y: 0, width: 0.375, height: 10 },
        [opening],
      );

      const room1 = makeRoom("room1", 0, 0, 10, 10);
      const room2 = makeRoom("room2", 10.375, 0, 10, 10);

      const plan = makePlan({
        rooms: [room1, room2],
        wallGraph: makeWallGraph([wall]),
        plumbing: {
          fixtures: [],
          supplyRuns: [
            {
              supplyType: "cold",
              path: [
                { x: 5, y: 5 },
                { x: 15, y: 5 }, // crosses wall at y=5, within opening gap 3-7
              ],
            },
          ],
          drainRuns: [],
          valves: [],
        },
      });

      const result = validatePlan(plan);
      const rtw = result.warnings.filter((w) => w.code === "run-through-wall");
      expect(rtw).toHaveLength(0);
    });

    it("does not warn when run does not cross any wall", () => {
      const wall = makeWall(
        "room1.east|room2.west",
        "room1",
        "room2",
        "east",
        "west",
        { x: 10, y: 0, width: 0.375, height: 10 },
      );

      const room1 = makeRoom("room1", 0, 0, 10, 10);
      const room2 = makeRoom("room2", 10.375, 0, 10, 10);

      const plan = makePlan({
        rooms: [room1, room2],
        wallGraph: makeWallGraph([wall]),
        plumbing: {
          fixtures: [],
          supplyRuns: [
            {
              supplyType: "cold",
              path: [
                { x: 2, y: 5 },
                { x: 8, y: 5 }, // stays within room1
              ],
            },
          ],
          drainRuns: [],
          valves: [],
        },
      });

      const result = validatePlan(plan);
      const rtw = result.warnings.filter((w) => w.code === "run-through-wall");
      expect(rtw).toHaveLength(0);
    });
  });

  describe("combined validation", () => {
    it("returns empty results for a valid plan with no plumbing", () => {
      const opening = makeOpening(2, 0, 5, 0, 3);
      const wall = makeWall(
        "room1.south",
        "room1",
        null,
        "south",
        null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [opening],
      );
      const wallN = makeWall("room1.north", "room1", null, "north", null, {
        x: 0,
        y: 10,
        width: 10,
        height: 0.375,
      });
      const wallE = makeWall("room1.east", "room1", null, "east", null, {
        x: 10,
        y: 0,
        width: 0.375,
        height: 10,
      });
      const wallW = makeWall("room1.west", "room1", null, "west", null, {
        x: -0.375,
        y: 0,
        width: 0.375,
        height: 10,
      });

      const room = makeRoom("room1", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        wallGraph: makeWallGraph([wall, wallN, wallE, wallW]),
      });

      const result = validatePlan(plan);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("reports multiple issues in one pass", () => {
      // Sealed room + fixture out of bounds
      const wall = makeWall(
        "room1.south",
        "room1",
        null,
        "south",
        null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [], // no openings -> sealed
      );
      const wallN = makeWall("room1.north", "room1", null, "north", null, {
        x: 0,
        y: 10,
        width: 10,
        height: 0.375,
      });
      const wallE = makeWall("room1.east", "room1", null, "east", null, {
        x: 10,
        y: 0,
        width: 0.375,
        height: 10,
      });
      const wallW = makeWall("room1.west", "room1", null, "west", null, {
        x: -0.375,
        y: 0,
        width: 0.375,
        height: 10,
      });

      const room = makeRoom("room1", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        wallGraph: makeWallGraph([wall, wallN, wallE, wallW]),
        plumbing: {
          fixtures: [
            {
              fixtureType: "sink",
              position: { x: 100, y: 100 }, // out of bounds
            },
          ],
          supplyRuns: [],
          drainRuns: [],
          valves: [],
        },
      });

      const result = validatePlan(plan);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
      const codes = result.warnings.map((w) => w.code);
      expect(codes).toContain("sealed-room");
      expect(codes).toContain("fixture-out-of-bounds");
    });
  });

  describe("sealed-extension", () => {
    it("warns when an extension has no openings", () => {
      const wall = makeWall(
        "room1.south",
        "room1",
        null,
        "south",
        null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [makeOpening(2, 0, 5, 0, 3)],
      );
      const wallN = makeWall("room1.north", "room1", null, "north", null, {
        x: 0,
        y: 10,
        width: 10,
        height: 0.375,
      });
      const wallE = makeWall("room1.east", "room1", null, "east", null, {
        x: 10,
        y: 0,
        width: 0.375,
        height: 10,
      });
      const wallW = makeWall("room1.west", "room1", null, "west", null, {
        x: -0.375,
        y: 0,
        width: 0.375,
        height: 10,
      });

      // Extension wall with no openings
      const extNorth: Wall = {
        ...makeWall("nook.north", "room1", null, "north", null, {
          x: 3,
          y: 12,
          width: 4,
          height: 0.375,
        }),
        source: "extension",
        subSpaceId: "nook",
      };

      const graph = makeWallGraph([wall, wallN, wallE, wallW, extNorth]);
      // Add extension wall to bySubSpace
      graph.bySubSpace.set("nook", new Map([["north", extNorth]]) as Map<string, Wall>);

      const room = makeRoom("room1", 0, 0, 10, 10);
      room.extensions = [
        {
          id: "nook",
          label: "Nook",
          parentRoomId: "room1",
          bounds: { x: 3, y: 10, width: 4, height: 2 },
          parentWall: "north",
        },
      ];

      const plan = makePlan({
        rooms: [room],
        wallGraph: graph,
      });

      const result = validatePlan(plan);
      const sealed = result.warnings.filter(
        (w) => w.code === "sealed-extension",
      );
      expect(sealed).toHaveLength(1);
      expect(sealed[0].elementId).toBe("nook");
    });
  });

  describe("overlapping openings on enclosure wall", () => {
    it("reports error when enclosure wall has overlapping openings", () => {
      // Vertical wall (east): overlap is checked on y-axis
      const opening1 = makeOpening(0, 1, 0, 3, 2);
      opening1.wallDirection = "east";
      const opening2 = makeOpening(0, 2, 0, 4, 2); // overlaps at y=2-3
      opening2.wallDirection = "east";

      const encWall: Wall = {
        ...makeWall(
          "closet.east",
          "room1",
          null,
          "east",
          null,
          { x: 3, y: 4, width: 0.375, height: 6 },
          [opening1, opening2],
        ),
        source: "enclosure",
        subSpaceId: "closet",
      };

      const parentWall = makeWall(
        "room1.south",
        "room1",
        null,
        "south",
        null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [makeOpening(2, 0, 5, 0, 3)],
      );

      const graph = makeWallGraph([parentWall, encWall]);
      graph.bySubSpace.set("closet", new Map([["east", encWall]]) as Map<string, Wall>);

      const room = makeRoom("room1", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        wallGraph: graph,
      });

      const result = validatePlan(plan);
      const overlaps = result.errors.filter(
        (e) => e.code === "overlapping-openings",
      );
      expect(overlaps).toHaveLength(1);
      expect(overlaps[0].wallId).toBe("closet.east");
    });
  });

  describe("run through enclosure wall", () => {
    it("warns when supply run crosses enclosure wall without opening", () => {
      const encWall: Wall = {
        ...makeWall(
          "closet.east",
          "room1",
          null,
          "east",
          null,
          { x: 3, y: 4, width: 0.375, height: 6 },
          [], // no openings
        ),
        source: "enclosure",
        subSpaceId: "closet",
      };

      const graph = makeWallGraph([encWall]);

      const room = makeRoom("room1", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        wallGraph: graph,
        plumbing: {
          fixtures: [],
          supplyRuns: [
            {
              supplyType: "cold",
              path: [
                { x: 1, y: 7 },
                { x: 5, y: 7 }, // crosses enclosure wall at x=3
              ],
            },
          ],
          drainRuns: [],
          valves: [],
        },
      });

      const result = validatePlan(plan);
      const rtw = result.warnings.filter((w) => w.code === "run-through-wall");
      expect(rtw).toHaveLength(1);
      expect(rtw[0].wallId).toBe("closet.east");
    });
  });
});
