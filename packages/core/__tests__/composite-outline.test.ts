import { describe, expect, it } from "vitest";
import {
  computeCompositeOutline,
} from "../src/resolver/composite-outline.js";
import type { Rect } from "../src/types/geometry.js";

describe("computeCompositeOutline", () => {
  it("simple rectangle → 4 vertices (CCW)", () => {
    const parent: Rect = { x: 0, y: 0, width: 10, height: 8 };
    const outline = computeCompositeOutline(parent, [], []);
    expect(outline).toHaveLength(4);
    // CCW starting from bottom-left
    expect(outline).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]);
  });

  it("rectangle + NW corner enclosure → 6 vertices (L-shape)", () => {
    const parent: Rect = { x: 0, y: 0, width: 12, height: 10 };
    // NW enclosure occupies (0, 4) to (3, 10) — 3ft deep × 6ft tall
    const enclosure: Rect = { x: 0, y: 4, width: 3, height: 6 };
    const outline = computeCompositeOutline(parent, [], [enclosure]);
    expect(outline).toHaveLength(6);
    // L-shape CCW: bottom-left → bottom-right → top-right → enclosure step → step left → left edge up
    expect(outline).toEqual([
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 10 },
      { x: 3, y: 10 },
      { x: 3, y: 4 },
      { x: 0, y: 4 },
    ]);
  });

  it("rectangle + north extension → 8 vertices", () => {
    const parent: Rect = { x: 0, y: 0, width: 12, height: 10 };
    // Extension on north wall: x=3, projecting 5ft outward
    const extension: Rect = { x: 3, y: 10, width: 4, height: 5 };
    const outline = computeCompositeOutline(parent, [extension], []);
    expect(outline).toHaveLength(8);
    expect(outline).toEqual([
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 10 },
      { x: 7, y: 10 },
      { x: 7, y: 15 },
      { x: 3, y: 15 },
      { x: 3, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it("rectangle + NW enclosure + north extension → correct vertex count", () => {
    const parent: Rect = { x: 0, y: 0, width: 12, height: 10 };
    const enclosure: Rect = { x: 0, y: 4, width: 3, height: 6 };
    const extension: Rect = { x: 5, y: 10, width: 4, height: 5 };
    const outline = computeCompositeOutline(parent, [extension], [enclosure]);
    // L-shape (6 vertices) + extension bump-out adds 4 vertices
    // but enclosure and extension don't interact, so: 10 vertices
    expect(outline).toHaveLength(10);
    // Verify it starts from the lowest, leftmost point
    expect(outline[0]).toEqual({ x: 0, y: 0 });
  });

  it("collinear vertex removal", () => {
    const parent: Rect = { x: 0, y: 0, width: 12, height: 10 };
    // Two adjacent extensions that share an edge on the north wall
    // Together they span x=2..8, each is 3 wide
    const ext1: Rect = { x: 2, y: 10, width: 3, height: 5 };
    const ext2: Rect = { x: 5, y: 10, width: 3, height: 5 };
    const outline = computeCompositeOutline(parent, [ext1, ext2], []);
    // Without collinear removal: (0,0),(12,0),(12,10),(8,10),(8,15),(5,15),(5,15)...
    // But (5,15) is collinear between (8,15) and (2,15)? No — (8,15),(5,15),(2,15) ARE collinear.
    // The two extensions form a single bump-out from x=2 to x=8, so it should be 8 vertices
    expect(outline).toHaveLength(8);
    expect(outline).toEqual([
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 10 },
      { x: 8, y: 10 },
      { x: 8, y: 15 },
      { x: 2, y: 15 },
      { x: 2, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it("SE corner enclosure → 6 vertices", () => {
    const parent: Rect = { x: 0, y: 0, width: 12, height: 10 };
    // SE enclosure occupies (9, 0) to (12, 4) — 3ft wide × 4ft tall
    const enclosure: Rect = { x: 9, y: 0, width: 3, height: 4 };
    const outline = computeCompositeOutline(parent, [], [enclosure]);
    expect(outline).toHaveLength(6);
    expect(outline).toEqual([
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 9, y: 4 },
      { x: 12, y: 4 },
      { x: 12, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it("returns empty array when no parent rect dimensions", () => {
    const parent: Rect = { x: 0, y: 0, width: 0, height: 0 };
    const outline = computeCompositeOutline(parent, [], []);
    expect(outline).toHaveLength(0);
  });
});
