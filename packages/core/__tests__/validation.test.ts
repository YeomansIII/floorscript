import { describe, expect, it } from "vitest";
import { validatePlan } from "../src/resolver/validation.js";
import type {
  PlanWall,
  ResolvedOpening,
  ResolvedPlan,
  ResolvedRoom,
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
    ...overrides,
  };
}

function makeRoom(id: string, x: number, y: number, w: number, h: number): ResolvedRoom {
  return {
    id,
    label: id,
    bounds: { x, y, width: w, height: h },
    labelPosition: { x: x + w / 2, y: y + h / 2 },
    walls: [],
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

function makePlanWall(
  id: string,
  roomA: string | null,
  roomB: string | null,
  dirA: "north" | "south" | "east" | "west" | null,
  dirB: "north" | "south" | "east" | "west" | null,
  rect: { x: number; y: number; width: number; height: number },
  openings: ResolvedOpening[] = [],
): PlanWall {
  return {
    id,
    roomA,
    roomB,
    directionInA: dirA,
    directionInB: dirB,
    type: "interior",
    composition: { stud: null, studWidthFt: 0.2917, finishA: 0.0417, finishB: 0.0417, totalThickness: 0.375 },
    thickness: 0.375,
    lineWeight: 0.5,
    centerline: { start: { x: rect.x, y: rect.y }, end: { x: rect.x + rect.width, y: rect.y } },
    outerEdge: { start: { x: rect.x, y: rect.y }, end: { x: rect.x + rect.width, y: rect.y } },
    innerEdge: { start: { x: rect.x, y: rect.y + rect.height }, end: { x: rect.x + rect.width, y: rect.y + rect.height } },
    rect,
    openings,
    segments: [rect],
    shared: roomA !== null && roomB !== null,
  };
}

function makeWallGraph(walls: PlanWall[]): WallGraph {
  const byRoom = new Map<string, Map<string, PlanWall>>();
  for (const wall of walls) {
    if (wall.roomA && wall.directionInA) {
      if (!byRoom.has(wall.roomA)) byRoom.set(wall.roomA, new Map());
      byRoom.get(wall.roomA)!.set(wall.directionInA, wall);
    }
    if (wall.roomB && wall.directionInB) {
      if (!byRoom.has(wall.roomB)) byRoom.set(wall.roomB, new Map());
      byRoom.get(wall.roomB)!.set(wall.directionInB, wall);
    }
  }
  return { walls, byRoom } as WallGraph;
}

describe("validatePlan", () => {
  describe("overlapping-openings", () => {
    it("reports error when two openings overlap on the same wall", () => {
      // Two openings on the south wall that overlap in the x range
      const opening1 = makeOpening(2, 0, 5, 0, 3); // x: 2-5
      const opening2 = makeOpening(4, 0, 7, 0, 3); // x: 4-7, overlaps at 4-5

      const wall = makePlanWall(
        "room1.south", "room1", null, "south", null,
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

      const wall = makePlanWall(
        "room1.south", "room1", null, "south", null,
        { x: 0, y: -0.375, width: 15, height: 0.375 },
        [opening1, opening2],
      );

      const room = makeRoom("room1", 0, 0, 15, 12);
      const plan = makePlan({
        rooms: [room],
        wallGraph: makeWallGraph([wall]),
      });

      const result = validatePlan(plan);
      const overlaps = result.errors.filter((e) => e.code === "overlapping-openings");
      expect(overlaps).toHaveLength(0);
    });
  });

  describe("opening-exceeds-wall", () => {
    it("reports error when opening is wider than wall", () => {
      // Wall is 10ft wide, opening is 12ft
      const opening = makeOpening(0, 0, 12, 0, 12);

      const wall = makePlanWall(
        "room1.south", "room1", null, "south", null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [opening],
      );

      const room = makeRoom("room1", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        wallGraph: makeWallGraph([wall]),
      });

      const result = validatePlan(plan);
      const exceeds = result.errors.filter((e) => e.code === "opening-exceeds-wall");
      expect(exceeds).toHaveLength(1);
      expect(exceeds[0].wallId).toBe("room1.south");
    });

    it("does not report error when opening fits in wall", () => {
      const opening = makeOpening(2, 0, 5, 0, 3);

      const wall = makePlanWall(
        "room1.south", "room1", null, "south", null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [opening],
      );

      const room = makeRoom("room1", 0, 0, 10, 10);
      const plan = makePlan({
        rooms: [room],
        wallGraph: makeWallGraph([wall]),
      });

      const result = validatePlan(plan);
      const exceeds = result.errors.filter((e) => e.code === "opening-exceeds-wall");
      expect(exceeds).toHaveLength(0);
    });
  });

  describe("sealed-room", () => {
    it("warns when a room has no openings", () => {
      const wall = makePlanWall(
        "sealed.south", "sealed", null, "south", null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [], // no openings
      );
      const wallN = makePlanWall(
        "sealed.north", "sealed", null, "north", null,
        { x: 0, y: 10, width: 10, height: 0.375 },
      );
      const wallE = makePlanWall(
        "sealed.east", "sealed", null, "east", null,
        { x: 10, y: 0, width: 0.375, height: 10 },
      );
      const wallW = makePlanWall(
        "sealed.west", "sealed", null, "west", null,
        { x: -0.375, y: 0, width: 0.375, height: 10 },
      );

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
      const wall = makePlanWall(
        "room1.south", "room1", null, "south", null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [opening],
      );
      const wallN = makePlanWall(
        "room1.north", "room1", null, "north", null,
        { x: 0, y: 10, width: 10, height: 0.375 },
      );
      const wallE = makePlanWall(
        "room1.east", "room1", null, "east", null,
        { x: 10, y: 0, width: 0.375, height: 10 },
      );
      const wallW = makePlanWall(
        "room1.west", "room1", null, "west", null,
        { x: -0.375, y: 0, width: 0.375, height: 10 },
      );

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
      const oob = result.warnings.filter((w) => w.code === "fixture-out-of-bounds");
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
      const oob = result.warnings.filter((w) => w.code === "fixture-out-of-bounds");
      expect(oob).toHaveLength(0);
    });
  });

  describe("run-through-wall", () => {
    it("warns when a supply run crosses a wall without an opening", () => {
      // Vertical wall at x=10 (between rooms), no openings
      const wall = makePlanWall(
        "room1.east|room2.west", "room1", "room2", "east", "west",
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

      const wall = makePlanWall(
        "room1.east|room2.west", "room1", "room2", "east", "west",
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
      const wall = makePlanWall(
        "room1.east|room2.west", "room1", "room2", "east", "west",
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
      const wall = makePlanWall(
        "room1.south", "room1", null, "south", null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [opening],
      );
      const wallN = makePlanWall(
        "room1.north", "room1", null, "north", null,
        { x: 0, y: 10, width: 10, height: 0.375 },
      );
      const wallE = makePlanWall(
        "room1.east", "room1", null, "east", null,
        { x: 10, y: 0, width: 0.375, height: 10 },
      );
      const wallW = makePlanWall(
        "room1.west", "room1", null, "west", null,
        { x: -0.375, y: 0, width: 0.375, height: 10 },
      );

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
      const wall = makePlanWall(
        "room1.south", "room1", null, "south", null,
        { x: 0, y: -0.375, width: 10, height: 0.375 },
        [], // no openings → sealed
      );
      const wallN = makePlanWall(
        "room1.north", "room1", null, "north", null,
        { x: 0, y: 10, width: 10, height: 0.375 },
      );
      const wallE = makePlanWall(
        "room1.east", "room1", null, "east", null,
        { x: 10, y: 0, width: 0.375, height: 10 },
      );
      const wallW = makePlanWall(
        "room1.west", "room1", null, "west", null,
        { x: -0.375, y: 0, width: 0.375, height: 10 },
      );

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
});
