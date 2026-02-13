import { describe, expect, it } from "vitest";
import { buildWallGraph, resolveWallComposition } from "../src/resolver/shared-wall-resolver.js";
import { resolveWalls } from "../src/resolver/wall-resolver.js";
import { resolveOpenings } from "../src/resolver/opening-resolver.js";
import { resolveWallSegments } from "../src/resolver/segment-resolver.js";
import type { ResolvedRoom, ResolvedWall } from "../src/types/geometry.js";
import type { WallsConfig } from "../src/types/config.js";

function makeRoom(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  wallsConfig?: WallsConfig,
): ResolvedRoom {
  const bounds = { x, y, width, height };
  const walls = resolveWalls(wallsConfig, id, bounds, "imperial");
  if (wallsConfig) {
    for (const wall of walls) {
      const cfg = wallsConfig[wall.direction as keyof WallsConfig];
      if (cfg?.openings && cfg.openings.length > 0) {
        wall.openings = resolveOpenings(wall, cfg.openings, "imperial", id);
        wall.segments = resolveWallSegments(wall);
      }
    }
  }
  return {
    id,
    label: id,
    bounds,
    labelPosition: { x: x + width / 2, y: y + height / 2 },
    walls,
  };
}

describe("resolveWallComposition", () => {
  it("uses explicit thickness when provided", () => {
    const comp = resolveWallComposition(
      { type: "exterior", thickness: "6in" },
      "exterior",
      "imperial",
    );
    expect(comp.totalThickness).toBe(0.5); // 6in = 0.5ft
    expect(comp.stud).toBeNull();
  });

  it("derives thickness from stud size", () => {
    const comp = resolveWallComposition(
      { type: "interior", stud: "2x4" },
      "interior",
      "imperial",
    );
    // 2x4 = 3.5" + 0.5" × 2 = 4.5" = 0.375ft
    expect(comp.stud).toBe("2x4");
    expect(comp.totalThickness).toBeCloseTo(4.5 / 12, 4);
  });

  it("uses default exterior composition (2x6)", () => {
    const comp = resolveWallComposition(undefined, "exterior", "imperial");
    expect(comp.stud).toBe("2x6");
    // 2x6 = 5.5" + 0.5" × 2 = 6.5" = 0.5417ft
    expect(comp.totalThickness).toBeCloseTo(6.5 / 12, 4);
  });

  it("uses default interior composition (2x4)", () => {
    const comp = resolveWallComposition(undefined, "interior", "imperial");
    expect(comp.stud).toBe("2x4");
    expect(comp.totalThickness).toBeCloseTo(4.5 / 12, 4);
  });
});

describe("buildWallGraph", () => {
  it("detects shared boundary between adjacent rooms (east/west)", () => {
    const rooms = [
      makeRoom("living", 0, 0, 15, 12),
      makeRoom("kitchen", 15, 0, 12, 10),
    ];

    const graph = buildWallGraph(rooms);
    expect(graph.walls.length).toBeGreaterThan(0);

    // Should have a shared wall between living.east and kitchen.west
    const shared = graph.walls.find((w) => w.shared);
    expect(shared).toBeDefined();
    expect(shared!.roomA).toBe("living");
    expect(shared!.roomB).toBe("kitchen");
    expect(shared!.directionInA).toBe("east");
    expect(shared!.directionInB).toBe("west");
  });

  it("detects shared boundary between adjacent rooms (north/south)", () => {
    const rooms = [
      makeRoom("living", 0, 0, 15, 12),
      makeRoom("bathroom", 0, -6, 8, 6),
    ];

    const graph = buildWallGraph(rooms);
    const shared = graph.walls.find((w) => w.shared);
    expect(shared).toBeDefined();
    expect(shared!.directionInA).toBe("south");
    expect(shared!.directionInB).toBe("north");
  });

  it("creates non-shared walls for exterior edges", () => {
    const rooms = [makeRoom("room1", 0, 0, 10, 8)];
    const graph = buildWallGraph(rooms);

    // All 4 walls should be non-shared
    expect(graph.walls).toHaveLength(4);
    expect(graph.walls.every((w) => !w.shared)).toBe(true);
  });

  it("applies thicker-wins rule for shared walls", () => {
    const rooms = [
      makeRoom("a", 0, 0, 10, 8, {
        east: { type: "exterior" }, // thicker (2x6 default)
      }),
      makeRoom("b", 10, 0, 10, 8, {
        west: { type: "interior" }, // thinner (2x4 default)
      }),
    ];

    const graph = buildWallGraph(rooms);
    const shared = graph.walls.find((w) => w.shared);
    expect(shared).toBeDefined();
    // Thicker wins: exterior 2x6 = 6.5" = 0.5417ft
    expect(shared!.thickness).toBeCloseTo(6.5 / 12, 4);
  });

  it("merges openings from both rooms on shared wall", () => {
    const rooms = [
      makeRoom("living", 0, 0, 15, 12, {
        east: {
          type: "interior",
          openings: [{ type: "door", position: "2ft", width: "3ft", swing: "inward-left" }],
        },
      }),
      makeRoom("kitchen", 15, 0, 12, 10, {
        west: {
          type: "interior",
          openings: [{ type: "window", position: "7ft", width: "4ft" }],
        },
      }),
    ];

    const graph = buildWallGraph(rooms);
    const shared = graph.walls.find((w) => w.shared);
    expect(shared).toBeDefined();
    expect(shared!.openings).toHaveLength(2);
    expect(shared!.openings[0].ownerRoomId).toBe("living");
    expect(shared!.openings[1].ownerRoomId).toBe("kitchen");
  });

  it("provides O(1) lookup via byRoom index", () => {
    const rooms = [
      makeRoom("living", 0, 0, 15, 12),
      makeRoom("kitchen", 15, 0, 12, 10),
    ];

    const graph = buildWallGraph(rooms);

    // Can look up living's east wall
    const livingEast = graph.byRoom.get("living")?.get("east");
    expect(livingEast).toBeDefined();
    expect(livingEast!.shared).toBe(true);

    // Same PlanWall from kitchen's west
    const kitchenWest = graph.byRoom.get("kitchen")?.get("west");
    expect(kitchenWest).toBe(livingEast);
  });

  it("handles partial overlap (rooms of different heights)", () => {
    const rooms = [
      makeRoom("living", 0, 0, 15, 12),
      makeRoom("kitchen", 15, 2, 12, 8), // Offset vertically
    ];

    const graph = buildWallGraph(rooms);
    const shared = graph.walls.find((w) => w.shared);
    expect(shared).toBeDefined();
    // Shared wall height should be the overlap: min(12, 2+8) - max(0, 2) = 10 - 2 = 8
    expect(shared!.rect.height).toBeCloseTo(8, 1);
  });

  it("realigns opening coordinates to shared wall position (vertical)", () => {
    const rooms = [
      makeRoom("living", 0, 0, 15, 12, {
        east: {
          type: "interior",
          openings: [{ type: "door", position: "3ft", width: "3ft", swing: "inward-left" as const }],
        },
      }),
      makeRoom("kitchen", 15, 0, 12, 10),
    ];

    const graph = buildWallGraph(rooms);
    const shared = graph.walls.find((w) => w.shared);
    expect(shared).toBeDefined();
    expect(shared!.openings).toHaveLength(1);

    const opening = shared!.openings[0];
    // Opening's gapStart.x should align with the shared wall rect.x, not the original room wall
    expect(opening.gapStart.x).toBeCloseTo(shared!.rect.x, 4);
    expect(opening.gapEnd.x).toBeCloseTo(shared!.rect.x, 4);
    // Centerline x should be at wall midpoint
    expect(opening.position.x).toBeCloseTo(shared!.rect.x + shared!.thickness / 2, 4);
    // wallThickness should match shared wall
    expect(opening.wallThickness).toBeCloseTo(shared!.thickness, 4);
  });

  it("realigns opening coordinates to shared wall position (horizontal)", () => {
    const rooms = [
      makeRoom("living", 0, 0, 15, 12),
      makeRoom("bathroom", 0, -6, 8, 6, {
        north: {
          type: "interior",
          openings: [{ type: "door", position: "2ft", width: "2.5ft", swing: "inward-left" as const }],
        },
      }),
    ];

    const graph = buildWallGraph(rooms);
    const shared = graph.walls.find((w) => w.shared);
    expect(shared).toBeDefined();
    expect(shared!.openings).toHaveLength(1);

    const opening = shared!.openings[0];
    // Opening's gapStart.y should align with the shared wall rect.y
    expect(opening.gapStart.y).toBeCloseTo(shared!.rect.y, 4);
    expect(opening.gapEnd.y).toBeCloseTo(shared!.rect.y, 4);
  });

  it("forces shared wall type to interior even when sides declare exterior", () => {
    const rooms = [
      makeRoom("a", 0, 0, 10, 8, {
        east: { type: "exterior" },
      }),
      makeRoom("b", 10, 0, 10, 8, {
        west: { type: "exterior" },
      }),
    ];

    const graph = buildWallGraph(rooms);
    const shared = graph.walls.find((w) => w.shared);
    expect(shared).toBeDefined();
    expect(shared!.type).toBe("interior");
  });

  it("creates remainder walls when rooms have different widths (north/south shared)", () => {
    const rooms = [
      makeRoom("living", 0, 0, 15, 12, {
        south: { type: "exterior" },
      }),
      makeRoom("bathroom", 0, -6, 8, 6),
    ];

    const graph = buildWallGraph(rooms);

    // Should have a shared wall for the overlap region (x=0 to x=8)
    const shared = graph.walls.find((w) => w.shared && w.roomA === "living" && w.roomB === "bathroom");
    expect(shared).toBeDefined();
    expect(shared!.rect.width).toBeCloseTo(8, 1);

    // Should have a remainder wall for x=8 to x=15
    const remainder = graph.walls.find((w) => w.id.includes("living.south.remainder"));
    expect(remainder).toBeDefined();
    expect(remainder!.rect.x).toBeCloseTo(8, 1);
    expect(remainder!.rect.width).toBeCloseTo(7, 1);
    // Remainder keeps original wall type (exterior)
    expect(remainder!.type).toBe("exterior");
    expect(remainder!.shared).toBe(false);
  });

  it("creates remainder walls when rooms have different heights (east/west shared)", () => {
    const rooms = [
      makeRoom("living", 0, 0, 15, 12),
      makeRoom("kitchen", 15, 2, 12, 8), // Offset: y=2, height=8 → overlap y=2 to y=10
    ];

    const graph = buildWallGraph(rooms);

    // Remainders for living.east (y=0 to y=2 and y=10 to y=12)
    const remainders = graph.walls.filter((w) => w.id.includes("living.east.remainder"));
    expect(remainders).toHaveLength(2);
  });

  it("preserves load-bearing type on shared walls", () => {
    const rooms = [
      makeRoom("a", 0, 0, 10, 8, {
        east: { type: "load-bearing" },
      }),
      makeRoom("b", 10, 0, 10, 8, {
        west: { type: "interior" },
      }),
    ];

    const graph = buildWallGraph(rooms);
    const shared = graph.walls.find((w) => w.shared);
    expect(shared).toBeDefined();
    expect(shared!.type).toBe("load-bearing");
  });
});
