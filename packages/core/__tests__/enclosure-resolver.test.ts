import { describe, expect, it } from "vitest";
import {
  resolveEnclosures,
  type WallModification,
} from "../src/resolver/enclosure-resolver.js";
import type { EnclosureConfig } from "../src/types/config.js";
import type { Rect } from "../src/types/geometry.js";

const parentBounds: Rect = { x: 0, y: 0, width: 12, height: 10 };

function makeEnclosure(
  overrides: Partial<EnclosureConfig> & { id: string; label: string },
): EnclosureConfig {
  return {
    corner: "northwest",
    length: "6ft",
    depth: "2ft 4in",
    ...overrides,
  } as EnclosureConfig;
}

describe("resolveEnclosures — corner placement", () => {
  it("NW corner, facing:east, length:6ft, depth:2ft4in → correct bounds", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: "northwest",
        facing: "east",
        length: "6ft",
        depth: "2ft 4in",
      }),
    ];

    const result = resolveEnclosures(configs, parentBounds, "imperial", "room1");
    expect(result.enclosures).toHaveLength(1);

    const enc = result.enclosures[0];
    expect(enc.id).toBe("closet");
    expect(enc.label).toBe("Closet");
    expect(enc.facing).toBe("east");

    // NW corner, facing east:
    // "length" = perpendicular to facing = along north/south axis = 6ft
    // "depth" = in facing direction (east) = 2ft 4in = 2.333ft
    // Position: x = parent.x (west edge) = 0, y = parent.y + parent.height - length = 10 - 6 = 4
    // Bounds: { x: 0, y: 4, width: 2.333, height: 6 }
    expect(enc.bounds.x).toBeCloseTo(0, 3);
    expect(enc.bounds.y).toBeCloseTo(4, 3);
    expect(enc.bounds.width).toBeCloseTo(2 + 4 / 12, 3);
    expect(enc.bounds.height).toBeCloseTo(6, 3);
  });

  it("NE corner, facing:west → correct bounds", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: "northeast",
        facing: "west",
        length: "6ft",
        depth: "2ft 4in",
      }),
    ];

    const result = resolveEnclosures(configs, parentBounds, "imperial", "room1");
    const enc = result.enclosures[0];

    // NE corner, facing west:
    // depth in west direction from east edge: x = 12 - 2.333 = 9.667
    // length along N-S: y = 10 - 6 = 4
    expect(enc.bounds.x).toBeCloseTo(12 - (2 + 4 / 12), 3);
    expect(enc.bounds.y).toBeCloseTo(4, 3);
    expect(enc.bounds.width).toBeCloseTo(2 + 4 / 12, 3);
    expect(enc.bounds.height).toBeCloseTo(6, 3);
  });

  it("SW corner, facing:east → correct bounds", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: "southwest",
        facing: "east",
        length: "6ft",
        depth: "2ft 4in",
      }),
    ];

    const result = resolveEnclosures(configs, parentBounds, "imperial", "room1");
    const enc = result.enclosures[0];

    // SW corner, facing east:
    // x = 0 (west edge), y = 0 (south edge)
    expect(enc.bounds.x).toBeCloseTo(0, 3);
    expect(enc.bounds.y).toBeCloseTo(0, 3);
    expect(enc.bounds.width).toBeCloseTo(2 + 4 / 12, 3);
    expect(enc.bounds.height).toBeCloseTo(6, 3);
  });

  it("SE corner, facing:west → correct bounds", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: "southeast",
        facing: "west",
        length: "6ft",
        depth: "2ft 4in",
      }),
    ];

    const result = resolveEnclosures(configs, parentBounds, "imperial", "room1");
    const enc = result.enclosures[0];

    // SE corner, facing west:
    // x = 12 - 2.333, y = 0
    expect(enc.bounds.x).toBeCloseTo(12 - (2 + 4 / 12), 3);
    expect(enc.bounds.y).toBeCloseTo(0, 3);
    expect(enc.bounds.width).toBeCloseTo(2 + 4 / 12, 3);
    expect(enc.bounds.height).toBeCloseTo(6, 3);
  });

  it("infers facing from single door on east wall", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: "northwest",
        length: "6ft",
        depth: "2ft 4in",
        walls: {
          east: {
            type: "interior",
            openings: [{ type: "door", position: "1ft", width: "2ft 6in" }],
          },
        },
      }),
    ];

    const result = resolveEnclosures(configs, parentBounds, "imperial", "room1");
    expect(result.enclosures[0].facing).toBe("east");
  });

  it("defaults facing to shorter dimension when no door and no facing field", () => {
    // NW corner, length=6, depth=2.33 → depth is shorter → facing along depth axis
    // For NW: east/west is the depth axis when length > depth, so facing = east
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: "northwest",
        length: "6ft",
        depth: "2ft 4in",
      }),
    ];

    const result = resolveEnclosures(configs, parentBounds, "imperial", "room1");
    expect(result.enclosures[0].facing).toBe("east");
  });

  it("generates 2 interior walls for corner enclosure", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: "northwest",
        facing: "east",
        length: "6ft",
        depth: "2ft 4in",
      }),
    ];

    const result = resolveEnclosures(configs, parentBounds, "imperial", "room1");
    const enc = result.enclosures[0];

    // NW corner enclosure has 2 exposed edges: east and south (facing room interior)
    expect(enc.walls).toHaveLength(2);
    const wallDirs = enc.walls.map((w) => w.direction);
    expect(wallDirs).toContain("east");
    expect(wallDirs).toContain("south");
  });

  it("returns empty wall modifications for corner enclosures (parent walls stay full length)", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: "northwest",
        facing: "east",
        length: "6ft",
        depth: "2ft 4in",
      }),
    ];

    const result = resolveEnclosures(configs, parentBounds, "imperial", "room1");

    // Corner enclosures sit inside the room — parent exterior walls remain
    // at full length (they ARE the closet's backing walls). No modifications needed.
    expect(result.wallModifications.size).toBe(0);
  });

  it("rejects enclosure exceeding parent dimensions", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: "northwest",
        facing: "east",
        length: "15ft", // exceeds parent height of 10ft
        depth: "2ft",
      }),
    ];

    expect(() =>
      resolveEnclosures(configs, parentBounds, "imperial", "room1"),
    ).toThrow(/exceeds/i);
  });

  it("rejects overlapping enclosures", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet1",
        label: "Closet 1",
        corner: "northwest",
        facing: "east",
        length: "8ft",
        depth: "3ft",
      }),
      makeEnclosure({
        id: "closet2",
        label: "Closet 2",
        corner: "northeast",
        facing: "west",
        length: "8ft",
        depth: "10ft", // overlaps with closet1
      }),
    ];

    expect(() =>
      resolveEnclosures(configs, parentBounds, "imperial", "room1"),
    ).toThrow(/overlap/i);
  });

  it("wall:north, length:full, depth:2ft spans entire north wall", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: undefined,
        wall: "north",
        length: "full",
        depth: "2ft",
      }) as EnclosureConfig,
    ];

    const result = resolveEnclosures(configs, parentBounds, "imperial", "room1");
    const enc = result.enclosures[0];

    // Full north wall: x=0, y=10-2=8, width=12 (full), height=2
    expect(enc.bounds.x).toBeCloseTo(0, 3);
    expect(enc.bounds.y).toBeCloseTo(8, 3);
    expect(enc.bounds.width).toBeCloseTo(12, 3);
    expect(enc.bounds.height).toBeCloseTo(2, 3);
    expect(enc.facing).toBe("south"); // faces into room
  });

  it("wall:north, from:east, offset:3ft, length:6ft, depth:2ft4in positioned correctly", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: undefined,
        wall: "north",
        length: "6ft",
        depth: "2ft 4in",
        from: "east",
        offset: "3ft",
      }) as EnclosureConfig,
    ];

    const result = resolveEnclosures(configs, parentBounds, "imperial", "room1");
    const enc = result.enclosures[0];

    // from:east, offset:3ft on north wall (length 12)
    // position = 12 - 3 - 6 = 3ft from west
    // bounds: x = 0+3 = 3, y = 10-2.333 = 7.667, width = 6, height = 2.333
    expect(enc.bounds.x).toBeCloseTo(3, 3);
    expect(enc.bounds.y).toBeCloseTo(10 - (2 + 4 / 12), 3);
    expect(enc.bounds.width).toBeCloseTo(6, 3);
    expect(enc.bounds.height).toBeCloseTo(2 + 4 / 12, 3);
  });

  it("mid-wall enclosure generates correct interior walls on exposed sides", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet",
        corner: undefined,
        wall: "north",
        length: "6ft",
        depth: "2ft",
        from: "west",
        offset: "3ft",
      }) as EnclosureConfig,
    ];

    const result = resolveEnclosures(configs, parentBounds, "imperial", "room1");
    const enc = result.enclosures[0];

    // Mid-wall enclosure: not at either corner → 3 exposed edges: south (facing), west, east
    const wallDirs = enc.walls.map((w) => w.direction);
    expect(wallDirs).toContain("south"); // facing direction
    expect(wallDirs).toContain("west"); // not flush with west corner
    expect(wallDirs).toContain("east"); // not flush with east corner
    expect(wallDirs).not.toContain("north"); // against parent wall
  });

  it("rejects duplicate enclosure ID within same room", () => {
    const configs: EnclosureConfig[] = [
      makeEnclosure({
        id: "closet",
        label: "Closet 1",
        corner: "northwest",
        facing: "east",
        length: "4ft",
        depth: "2ft",
      }),
      makeEnclosure({
        id: "closet",
        label: "Closet 2",
        corner: "southeast",
        facing: "west",
        length: "4ft",
        depth: "2ft",
      }),
    ];

    expect(() =>
      resolveEnclosures(configs, parentBounds, "imperial", "room1"),
    ).toThrow(/duplicate.*id/i);
  });
});
