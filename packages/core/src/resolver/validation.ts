import type {
  Point,
  Rect,
  ResolvedPlan,
  ValidationIssue,
  ValidationResult,
} from "../types/geometry.js";

/**
 * Linter-style validation pass on a fully resolved plan.
 * Checks for geometry errors and warnings.
 */
export function validatePlan(plan: ResolvedPlan): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  checkOverlappingOpenings(plan, errors);
  checkOpeningExceedsWall(plan, errors);
  checkSealedRooms(plan, warnings);
  checkFixtureOutOfBounds(plan, warnings);
  checkRunsThroughWalls(plan, warnings);
  checkOpeningInExtensionGap(plan, warnings);
  checkSealedEnclosures(plan, warnings);
  checkSealedExtensions(plan, warnings);

  return { errors, warnings };
}

/**
 * Check for overlapping openings on the same wall.
 */
function checkOverlappingOpenings(
  plan: ResolvedPlan,
  errors: ValidationIssue[],
): void {

  for (const wall of plan.wallGraph.walls) {
    const openings = wall.openings;
    if (openings.length < 2) continue;

    // Sort by position along wall
    const sorted = [...openings].sort((a, b) => {
      const dir = wall.direction;
      if (dir === "south" || dir === "north") {
        return a.gapStart.x - b.gapStart.x;
      }
      return a.gapStart.y - b.gapStart.y;
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const dir = wall.direction;

      let aEnd: number, bStart: number;
      if (dir === "south" || dir === "north") {
        aEnd = a.gapEnd.x;
        bStart = b.gapStart.x;
      } else {
        aEnd = a.gapEnd.y;
        bStart = b.gapStart.y;
      }

      if (aEnd > bStart + 0.001) {
        errors.push({
          code: "overlapping-openings",
          severity: "error",
          message: `Two openings overlap on wall "${wall.id}"`,
          roomId: wall.roomId,
          wallId: wall.id,
          elementId: null,
          suggestion: "Move or resize one of the overlapping openings",
        });
      }
    }
  }
}

/**
 * Check if any opening is wider than its wall segment.
 */
function checkOpeningExceedsWall(
  plan: ResolvedPlan,
  errors: ValidationIssue[],
): void {

  for (const wall of plan.wallGraph.walls) {
    const dir = wall.direction;
    const wallLength =
      dir === "south" || dir === "north" ? wall.rect.width : wall.rect.height;

    for (const opening of wall.openings) {
      if (opening.width > wallLength + 0.001) {
        errors.push({
          code: "opening-exceeds-wall",
          severity: "error",
          message: `Opening (${opening.width.toFixed(2)}ft) exceeds wall length (${wallLength.toFixed(2)}ft) on wall "${wall.id}"`,
          roomId: wall.roomId,
          wallId: wall.id,
          elementId: null,
          suggestion: "Reduce opening width or increase room size",
        });
      }
    }
  }
}

/**
 * Check for rooms with no openings (sealed rooms).
 */
function checkSealedRooms(
  plan: ResolvedPlan,
  warnings: ValidationIssue[],
): void {
  for (const room of plan.rooms) {
    let hasOpening = false;

    const roomWalls = plan.wallGraph.byRoom.get(room.id);
    if (roomWalls) {
      for (const [, wall] of roomWalls) {
        if (wall.openings.length > 0) {
          hasOpening = true;
          break;
        }
      }
    }

    if (!hasOpening) {
      warnings.push({
        code: "sealed-room",
        severity: "warning",
        message: `Room "${room.id}" has no openings (doors or windows)`,
        roomId: room.id,
        wallId: null,
        elementId: null,
        suggestion: "Add at least one door or window to the room",
      });
    }
  }
}

/**
 * Check for plumbing fixtures outside their room bounds.
 */
function checkFixtureOutOfBounds(
  plan: ResolvedPlan,
  warnings: ValidationIssue[],
): void {
  if (!plan.plumbing) return;

  for (const fixture of plan.plumbing.fixtures) {
    const pos = fixture.position;
    let insideAny = false;

    for (const room of plan.rooms) {
      const b = room.bounds;
      if (
        pos.x >= b.x - 0.01 &&
        pos.x <= b.x + b.width + 0.01 &&
        pos.y >= b.y - 0.01 &&
        pos.y <= b.y + b.height + 0.01
      ) {
        insideAny = true;
        break;
      }
    }

    if (!insideAny) {
      warnings.push({
        code: "fixture-out-of-bounds",
        severity: "warning",
        message: `Plumbing fixture "${fixture.id ?? fixture.fixtureType}" is outside all room bounds`,
        roomId: null,
        wallId: null,
        elementId: fixture.id ?? null,
        suggestion:
          "Move the fixture inside a room or use wall-relative positioning",
      });
    }
  }
}

/**
 * Check for supply/drain runs that pass through a wall without an opening.
 */
function checkRunsThroughWalls(
  plan: ResolvedPlan,
  warnings: ValidationIssue[],
): void {
  if (!plan.plumbing) return;

  const allRuns = [
    ...plan.plumbing.supplyRuns.map((r) => ({
      path: r.path,
      label: `supply run (${r.supplyType})`,
    })),
    ...plan.plumbing.drainRuns.map((r) => ({
      path: r.path,
      label: "drain run",
    })),
  ];

  for (const run of allRuns) {
    if (run.path.length < 2) continue;

    for (let i = 0; i < run.path.length - 1; i++) {
      const segStart = run.path[i];
      const segEnd = run.path[i + 1];

      for (const wall of plan.wallGraph.walls) {
        if (!segmentIntersectsRect(segStart, segEnd, wall.rect)) continue;

        // Check if crossing is through an opening
        const crossesThroughOpening = wall.openings.some((opening) => {
          const dir = wall.direction;
          if (dir === "south" || dir === "north") {
            // Horizontal wall: check if segment's x range overlaps opening gap x range
            const segMinX = Math.min(segStart.x, segEnd.x);
            const segMaxX = Math.max(segStart.x, segEnd.x);
            return (
              segMaxX > opening.gapStart.x + 0.001 &&
              segMinX < opening.gapEnd.x - 0.001
            );
          } else {
            // Vertical wall: check if segment's y range overlaps opening gap y range
            const segMinY = Math.min(segStart.y, segEnd.y);
            const segMaxY = Math.max(segStart.y, segEnd.y);
            return (
              segMaxY > opening.gapStart.y + 0.001 &&
              segMinY < opening.gapEnd.y - 0.001
            );
          }
        });

        if (!crossesThroughOpening) {
          warnings.push({
            code: "run-through-wall",
            severity: "warning",
            message: `Plumbing ${run.label} passes through wall "${wall.id}" without an opening`,
            roomId: wall.roomId,
            wallId: wall.id,
            elementId: null,
            suggestion:
              "Route the run through an opening or add a wall penetration",
          });
        }
      }
    }
  }
}

/**
 * Check for openings on parent walls that overlap with extension gaps.
 * FR-030: An opening placed on a wall segment removed by an extension gap is invalid.
 */
function checkOpeningInExtensionGap(
  plan: ResolvedPlan,
  warnings: ValidationIssue[],
): void {
  for (const room of plan.rooms) {
    if (!room.extensions || room.extensions.length === 0) continue;

    const roomWalls = plan.wallGraph.byRoom.get(room.id);
    if (!roomWalls) continue;

    for (const [, wall] of roomWalls) {
      // Find extensions on this wall
      const wallExts = room.extensions.filter(
        (ext) => ext.parentWall === wall.direction,
      );
      if (wallExts.length === 0) continue;

      for (const opening of wall.openings) {
        const isHorizontal =
          wall.direction === "north" || wall.direction === "south";

        for (const ext of wallExts) {
          const gapStart = isHorizontal ? ext.bounds.x : ext.bounds.y;
          const gapEnd = isHorizontal
            ? ext.bounds.x + ext.bounds.width
            : ext.bounds.y + ext.bounds.height;

          const openStart = isHorizontal
            ? opening.gapStart.x
            : opening.gapStart.y;
          const openEnd = isHorizontal
            ? opening.gapEnd.x
            : opening.gapEnd.y;

          // Check overlap between opening and extension gap
          if (openEnd > gapStart + 0.001 && openStart < gapEnd - 0.001) {
            warnings.push({
              code: "opening-in-extension-gap",
              severity: "warning",
              message:
                `Opening on wall "${wall.id}" overlaps with extension "${ext.id}" gap ` +
                `on room "${room.id}". The opening falls within the wall segment removed by the extension.`,
              roomId: room.id,
              wallId: wall.id,
              elementId: ext.id,
              suggestion:
                `Move the opening away from the extension gap, or place it on the extension's own walls instead.`,
            });
          }
        }
      }
    }
  }
}

/**
 * Check that enclosures have at least one opening (door) for accessibility.
 */
function checkSealedEnclosures(
  plan: ResolvedPlan,
  warnings: ValidationIssue[],
): void {
  for (const room of plan.rooms) {
    if (!room.enclosures) continue;

    for (const enc of room.enclosures) {
      let hasOpening = false;
      const encWalls = plan.wallGraph.bySubSpace.get(enc.id);
      if (encWalls) {
        for (const [, w] of encWalls) {
          if (w.openings.length > 0) {
            hasOpening = true;
            break;
          }
        }
      }
      if (!hasOpening) {
        warnings.push({
          code: "sealed-enclosure",
          severity: "warning",
          message: `Enclosure "${enc.id}" in room "${room.id}" has no door or opening`,
          roomId: room.id,
          wallId: null,
          elementId: enc.id,
          suggestion:
            `Add a door to one of the enclosure's interior walls (e.g., the "${enc.facing}" wall)`,
        });
      }
    }
  }
}

/**
 * Check that extensions have at least one opening.
 * Extensions without openings emit a "sealed-extension" warning (distinct from "sealed-room").
 */
function checkSealedExtensions(
  plan: ResolvedPlan,
  warnings: ValidationIssue[],
): void {
  for (const room of plan.rooms) {
    if (!room.extensions) continue;

    for (const ext of room.extensions) {
      let hasOpening = false;
      const extWalls = plan.wallGraph.bySubSpace.get(ext.id);
      if (extWalls) {
        for (const [, w] of extWalls) {
          if (w.openings.length > 0) {
            hasOpening = true;
            break;
          }
        }
      }
      if (!hasOpening) {
        warnings.push({
          code: "sealed-extension",
          severity: "warning",
          message: `Extension "${ext.id}" in room "${room.id}" has no openings`,
          roomId: room.id,
          wallId: null,
          elementId: ext.id,
          suggestion: "Add a door or window to one of the extension's walls",
        });
      }
    }
  }
}

/**
 * Test if a line segment from p1 to p2 intersects a rectangle.
 * Uses separating axis test on the segment vs rect edges.
 */
function segmentIntersectsRect(p1: Point, p2: Point, rect: Rect): boolean {
  const rx = rect.x;
  const ry = rect.y;
  const rw = rect.width;
  const rh = rect.height;

  // Quick AABB test: does the segment's bounding box overlap the rect?
  const segMinX = Math.min(p1.x, p2.x);
  const segMaxX = Math.max(p1.x, p2.x);
  const segMinY = Math.min(p1.y, p2.y);
  const segMaxY = Math.max(p1.y, p2.y);

  if (segMaxX < rx - 0.001 || segMinX > rx + rw + 0.001) return false;
  if (segMaxY < ry - 0.001 || segMinY > ry + rh + 0.001) return false;

  // Check if segment crosses the rect using line-side tests.
  // A segment intersects a rect if any rect corner is on different sides
  // of the segment line, AND the segment endpoints are on different sides
  // of at least one rect edge.
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  // Cross product to determine side: (point - p1) × (p2 - p1)
  const cross = (px: number, py: number) => (px - p1.x) * dy - (py - p1.y) * dx;

  const c1 = cross(rx, ry);
  const c2 = cross(rx + rw, ry);
  const c3 = cross(rx + rw, ry + rh);
  const c4 = cross(rx, ry + rh);

  // If all corners on same side, no intersection
  if (c1 > 0 && c2 > 0 && c3 > 0 && c4 > 0) return false;
  if (c1 < 0 && c2 < 0 && c3 < 0 && c4 < 0) return false;

  return true;
}
