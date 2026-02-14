import { describe, expect, it } from "vitest";
import { resolveExtensions } from "../src/resolver/extension-resolver.js";
import type { ExtensionConfig } from "../src/types/config.js";
import type { Rect } from "../src/types/geometry.js";

const parentBounds: Rect = { x: 0, y: 0, width: 12, height: 10 };

function makeExtension(
  overrides: Partial<ExtensionConfig> & { id: string; label: string },
): ExtensionConfig {
  return {
    wall: "north",
    from: "east",
    offset: "4ft",
    width: "3ft",
    depth: "5ft",
    ...overrides,
  } as ExtensionConfig;
}

describe("resolveExtensions", () => {
  it("north wall extension with from:east, offset:4ft8in, width:3ft9in, depth:5ft4in", () => {
    const configs: ExtensionConfig[] = [
      makeExtension({
        id: "nook",
        label: "Window Nook",
        wall: "north",
        from: "east",
        offset: "4ft 8in",
        width: "3ft 9in",
        depth: "5ft 4in",
      }),
    ];

    const result = resolveExtensions(
      configs,
      parentBounds,
      "imperial",
      "room1",
    );
    expect(result.extensions).toHaveLength(1);

    const ext = result.extensions[0];
    expect(ext.id).toBe("nook");
    expect(ext.parentWall).toBe("north");

    // from:east, offset:4ft 8in = 4.667ft
    // width: 3ft 9in = 3.75ft
    // position along wall = 12 - 4.667 - 3.75 = 3.583ft
    // bounds: x = 0 + 3.583, y = 10 (north of parent), width = 3.75, height = 5.333
    expect(ext.bounds.x).toBeCloseTo(12 - (4 + 8 / 12) - (3 + 9 / 12), 2);
    expect(ext.bounds.y).toBeCloseTo(10, 3);
    expect(ext.bounds.width).toBeCloseTo(3 + 9 / 12, 3);
    expect(ext.bounds.height).toBeCloseTo(5 + 4 / 12, 3);
  });

  it("extension flush with corner at offset:0", () => {
    const configs: ExtensionConfig[] = [
      makeExtension({
        id: "nook",
        label: "Nook",
        wall: "north",
        from: "west",
        offset: "0",
        width: "4ft",
        depth: "3ft",
      }),
    ];

    const result = resolveExtensions(
      configs,
      parentBounds,
      "imperial",
      "room1",
    );
    const ext = result.extensions[0];

    // from:west, offset:0 → position = 0 (flush with west edge)
    expect(ext.bounds.x).toBeCloseTo(0, 3);
    expect(ext.bounds.y).toBeCloseTo(10, 3);
    expect(ext.bounds.width).toBeCloseTo(4, 3);
    expect(ext.bounds.height).toBeCloseTo(3, 3);
  });

  it("extension has 3 exterior walls (open toward parent)", () => {
    const configs: ExtensionConfig[] = [
      makeExtension({
        id: "nook",
        label: "Nook",
        wall: "north",
        from: "west",
        offset: "2ft",
        width: "4ft",
        depth: "3ft",
      }),
    ];

    const result = resolveExtensions(
      configs,
      parentBounds,
      "imperial",
      "room1",
    );

    // North extension: open side is south (facing parent), so 3 walls: north, east, west
    const nookWalls = result.walls.filter((w) => w.subSpaceId === "nook");
    expect(nookWalls).toHaveLength(3);
    const wallDirs = nookWalls.map((w) => w.direction);
    expect(wallDirs).toContain("north");
    expect(wallDirs).toContain("east");
    expect(wallDirs).toContain("west");
    expect(wallDirs).not.toContain("south"); // open side
  });

  it("parent wall gap matches extension width at correct offset", () => {
    const configs: ExtensionConfig[] = [
      makeExtension({
        id: "nook",
        label: "Nook",
        wall: "north",
        from: "west",
        offset: "3ft",
        width: "4ft",
        depth: "2ft",
      }),
    ];

    const result = resolveExtensions(
      configs,
      parentBounds,
      "imperial",
      "room1",
    );

    expect(result.wallGaps.has("north")).toBe(true);
    const gaps = result.wallGaps.get("north")!;
    expect(gaps).toHaveLength(1);
    // Gap should be at x = parent.x + 3 = 3 to x = 3 + 4 = 7
    expect(gaps[0].gapStart).toBeCloseTo(3, 3);
    expect(gaps[0].gapEnd).toBeCloseTo(7, 3);
  });

  it("rejects extension exceeding parent wall length", () => {
    const configs: ExtensionConfig[] = [
      makeExtension({
        id: "nook",
        label: "Nook",
        wall: "north",
        from: "west",
        offset: "10ft",
        width: "4ft",
        depth: "2ft",
      }),
    ];

    expect(() =>
      resolveExtensions(configs, parentBounds, "imperial", "room1"),
    ).toThrow(/exceeds/i);
  });

  it("window on extension north wall resolves correctly", () => {
    const configs: ExtensionConfig[] = [
      makeExtension({
        id: "nook",
        label: "Nook",
        wall: "north",
        from: "west",
        offset: "2ft",
        width: "4ft",
        depth: "3ft",
        walls: {
          north: {
            type: "exterior",
            openings: [
              { type: "window", position: "6in", width: "3ft" },
            ],
          },
        },
      }),
    ];

    const result = resolveExtensions(
      configs,
      parentBounds,
      "imperial",
      "room1",
    );
    const nookWalls = result.walls.filter((w) => w.subSpaceId === "nook");
    const northWall = nookWalls.find((w) => w.direction === "north");
    expect(northWall).toBeDefined();
    expect(northWall!.openings).toHaveLength(1);
    expect(northWall!.openings[0].type).toBe("window");
    expect(northWall!.openings[0].width).toBe(3);
  });

  it("rejects duplicate extension ID within same room", () => {
    const configs: ExtensionConfig[] = [
      makeExtension({
        id: "nook",
        label: "Nook 1",
        wall: "north",
        from: "west",
        offset: "0",
        width: "3ft",
        depth: "2ft",
      }),
      makeExtension({
        id: "nook",
        label: "Nook 2",
        wall: "south",
        from: "west",
        offset: "0",
        width: "3ft",
        depth: "2ft",
      }),
    ];

    expect(() =>
      resolveExtensions(configs, parentBounds, "imperial", "room1"),
    ).toThrow(/duplicate.*id/i);
  });

  it("east wall extension resolves correctly", () => {
    const configs: ExtensionConfig[] = [
      makeExtension({
        id: "bay",
        label: "Bay Window",
        wall: "east",
        from: "south",
        offset: "2ft",
        width: "4ft",
        depth: "2ft",
      }),
    ];

    const result = resolveExtensions(
      configs,
      parentBounds,
      "imperial",
      "room1",
    );
    const ext = result.extensions[0];

    // East wall extension: projects east from parent
    // bounds: x = parent.x + parent.width = 12, y = parent.y + 2 = 2, width = 2 (depth), height = 4
    expect(ext.bounds.x).toBeCloseTo(12, 3);
    expect(ext.bounds.y).toBeCloseTo(2, 3);
    expect(ext.bounds.width).toBeCloseTo(2, 3); // depth becomes width
    expect(ext.bounds.height).toBeCloseTo(4, 3); // ext width becomes height

    // 3 walls: north, south, east (open side = west, facing parent)
    const bayWalls = result.walls.filter((w) => w.subSpaceId === "bay");
    const wallDirs = bayWalls.map((w) => w.direction);
    expect(wallDirs).toContain("north");
    expect(wallDirs).toContain("south");
    expect(wallDirs).toContain("east");
    expect(wallDirs).not.toContain("west");
  });

  it("two extensions on the same parent wall produce independent walls", () => {
    const configs: ExtensionConfig[] = [
      makeExtension({
        id: "nook1",
        label: "Nook 1",
        wall: "north",
        from: "west",
        offset: "1ft",
        width: "3ft",
        depth: "2ft",
      }),
      makeExtension({
        id: "nook2",
        label: "Nook 2",
        wall: "north",
        from: "west",
        offset: "7ft",
        width: "3ft",
        depth: "2ft",
      }),
    ];

    const result = resolveExtensions(
      configs,
      parentBounds,
      "imperial",
      "room1",
    );

    expect(result.extensions).toHaveLength(2);

    // Each extension should have its own set of walls
    const nook1Walls = result.walls.filter((w) => w.subSpaceId === "nook1");
    const nook2Walls = result.walls.filter((w) => w.subSpaceId === "nook2");
    expect(nook1Walls.length).toBe(3); // north, east, west
    expect(nook2Walls.length).toBe(3);

    // Wall gaps should have two entries for the north wall
    const northGaps = result.wallGaps.get("north");
    expect(northGaps).toHaveLength(2);
  });
});
