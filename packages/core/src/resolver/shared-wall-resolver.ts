import { parseDimension } from "../parser/dimension.js";
import type {
  CardinalDirection,
  SharedWallConfig,
  StudSize,
  UnitSystem,
  WallComposition,
  WallConfig,
  WallType,
} from "../types/config.js";
import type {
  LineSegment,
  PlanWall,
  Rect,
  ResolvedOpening,
  ResolvedRoom,
  WallGraph,
} from "../types/geometry.js";
import { resolveWallSegments } from "./segment-resolver.js";

// Stud nominal widths in inches
const STUD_WIDTH_INCHES: Record<StudSize, number> = {
  "2x4": 3.5,
  "2x6": 5.5,
  "2x8": 7.25,
};

const DEFAULT_FINISH_INCHES = 0.5; // 0.5" drywall per side

const LINE_WEIGHTS: Record<string, number> = {
  exterior: 0.7,
  interior: 0.5,
  "load-bearing": 0.5,
};

/**
 * Resolve wall composition from config fields.
 * Priority: explicit thickness > stud + finish > defaults by wall type.
 */
export function resolveWallComposition(
  wallConfig: WallConfig | undefined,
  wallType: WallType,
  units: UnitSystem,
): WallComposition {
  // If explicit thickness specified, use directly (no stud info)
  if (wallConfig?.thickness !== undefined) {
    const totalThickness = parseDimension(wallConfig.thickness, units);
    return {
      stud: null,
      studWidthFt: 0,
      finishA: 0,
      finishB: 0,
      totalThickness,
    };
  }

  // If stud specified, derive thickness
  if (wallConfig?.stud) {
    const studWidthInches = STUD_WIDTH_INCHES[wallConfig.stud];
    const studWidthFt = studWidthInches / 12;
    const finishPerSide = wallConfig?.finish
      ? parseDimension(wallConfig.finish, units)
      : DEFAULT_FINISH_INCHES / 12;
    return {
      stud: wallConfig.stud,
      studWidthFt,
      finishA: finishPerSide,
      finishB: finishPerSide,
      totalThickness: studWidthFt + finishPerSide * 2,
    };
  }

  // Default based on wall type
  const defaultStud: StudSize =
    wallType === "exterior" || wallType === "load-bearing" ? "2x6" : "2x4";
  const studWidthInches = STUD_WIDTH_INCHES[defaultStud];
  const studWidthFt = studWidthInches / 12;
  const finishPerSide = DEFAULT_FINISH_INCHES / 12;

  if (units === "metric") {
    // Convert defaults to metric
    const studWidthM = studWidthFt * 0.3048;
    const finishM = finishPerSide * 0.3048;
    return {
      stud: defaultStud,
      studWidthFt: studWidthM, // In metric, this is in meters
      finishA: finishM,
      finishB: finishM,
      totalThickness: studWidthM + finishM * 2,
    };
  }

  return {
    stud: defaultStud,
    studWidthFt,
    finishA: finishPerSide,
    finishB: finishPerSide,
    totalThickness: studWidthFt + finishPerSide * 2,
  };
}

const EPSILON = 0.001;

/**
 * Detect which direction is the opposite of a given cardinal direction.
 */
function _oppositeDirection(dir: CardinalDirection): CardinalDirection {
  switch (dir) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    case "west":
      return "east";
  }
}

/**
 * Build a plan-level wall graph from resolved rooms.
 * Detects shared boundaries between adjacent rooms and merges walls.
 */
export function buildWallGraph(
  rooms: ResolvedRoom[],
  sharedWalls?: SharedWallConfig[],
  units: UnitSystem = "imperial",
): WallGraph {
  const walls: PlanWall[] = [];
  const byRoom = new Map<string, Map<CardinalDirection, PlanWall>>();

  // Initialize byRoom maps
  for (const room of rooms) {
    byRoom.set(room.id, new Map());
  }

  // Track consumed ranges per room wall (along-wall coordinate ranges).
  // This allows a single wall edge to be shared with multiple rooms
  // (e.g., living.east shared with kitchen from y=2..12 AND hallway from y=0..2).
  const consumedRanges = new Map<string, [number, number][]>();

  function addConsumed(wallKey: string, start: number, end: number): void {
    if (!consumedRanges.has(wallKey)) consumedRanges.set(wallKey, []);
    consumedRanges.get(wallKey)!.push([start, end]);
  }

  function isOverlapConsumed(
    wallKey: string,
    start: number,
    end: number,
  ): boolean {
    const ranges = consumedRanges.get(wallKey);
    if (!ranges) return false;
    for (const [s, e] of ranges) {
      if (s <= start + EPSILON && e >= end - EPSILON) return true;
    }
    return false;
  }

  // Step 1: Detect shared boundaries between room pairs
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const roomA = rooms[i];
      const roomB = rooms[j];
      const shared = detectSharedBoundary(roomA, roomB);
      if (!shared) continue;

      const { dirInA, dirInB } = shared;
      const wallKeyA = `${roomA.id}.${dirInA}`;
      const wallKeyB = `${roomB.id}.${dirInB}`;

      // Compute overlap range along the wall axis
      const [overlapStart, overlapEnd] = getOverlapRange(roomA, roomB, dirInA);

      // Skip if this specific overlap range is already consumed
      if (
        isOverlapConsumed(wallKeyA, overlapStart, overlapEnd) ||
        isOverlapConsumed(wallKeyB, overlapStart, overlapEnd)
      ) {
        continue;
      }

      const wallA = roomA.walls.find((w) => w.direction === dirInA)!;
      const wallB = roomB.walls.find((w) => w.direction === dirInB)!;

      // Thicker wins rule (or use shared_walls config override)
      const override = findSharedWallOverride(roomA.id, roomB.id, sharedWalls);
      const thickerWall = wallA.thickness >= wallB.thickness ? wallA : wallB;
      const wallType = chooseWallType(wallA.type, wallB.type);
      const thickness = override?.thickness
        ? parseDimension(override.thickness, units)
        : thickerWall.thickness;
      const lineWeight = LINE_WEIGHTS[wallType] ?? 0.5;

      // Compute shared wall geometry — centered between the two rooms
      const geometry = computeSharedWallGeometry(
        roomA,
        roomB,
        dirInA,
        dirInB,
        thickness,
      );

      // Merge openings from both rooms and realign to shared wall position
      const mergedOpenings = [
        ...wallA.openings.map((o) =>
          realignOpeningToSharedWall(
            { ...o, ownerRoomId: roomA.id },
            wallA.rect,
            geometry.rect,
            dirInA,
            thickness,
          ),
        ),
        ...wallB.openings.map((o) =>
          realignOpeningToSharedWall(
            { ...o, ownerRoomId: roomB.id },
            wallB.rect,
            geometry.rect,
            dirInB,
            thickness,
          ),
        ),
      ];

      const planWall: PlanWall = {
        id: `${roomA.id}.${dirInA}|${roomB.id}.${dirInB}`,
        roomA: roomA.id,
        roomB: roomB.id,
        directionInA: dirInA,
        directionInB: dirInB,
        type: wallType,
        composition: {
          stud: null,
          studWidthFt: 0,
          finishA: 0,
          finishB: 0,
          totalThickness: thickness,
        },
        thickness,
        lineWeight,
        centerline: geometry.centerline,
        outerEdge: geometry.outerEdge,
        innerEdge: geometry.innerEdge,
        rect: geometry.rect,
        openings: mergedOpenings,
        segments: [], // Will be computed after
        shared: true,
      };

      // Recompute segments around merged openings
      planWall.segments = resolveWallSegments({
        ...planWall,
        id: planWall.id,
        direction: dirInA, // Use direction for segment computation
        interiorStartOffset: 0,
      });

      walls.push(planWall);
      // Set byRoom for first shared wall on this direction (don't overwrite)
      if (!byRoom.get(roomA.id)!.has(dirInA)) {
        byRoom.get(roomA.id)!.set(dirInA, planWall);
      }
      if (!byRoom.get(roomB.id)!.has(dirInB)) {
        byRoom.get(roomB.id)!.set(dirInB, planWall);
      }

      addConsumed(wallKeyA, overlapStart, overlapEnd);
      addConsumed(wallKeyB, overlapStart, overlapEnd);
    }
  }

  // Step 2: Create remainder walls for partially consumed room walls
  for (const room of rooms) {
    for (const wall of room.walls) {
      const wallKey = `${room.id}.${wall.direction}`;
      const ranges = consumedRanges.get(wallKey);
      if (!ranges || ranges.length === 0) continue;

      const wallRange = getWallRange(room, wall.direction);
      const uncovered = computeUncoveredRanges(
        wallRange[0],
        wallRange[1],
        ranges,
      );

      for (const [start, end] of uncovered) {
        const side = start <= wallRange[0] + EPSILON ? "before" : "after";
        const remainder = buildRemainderPlanWall(
          room,
          wall,
          wall.direction,
          start,
          end,
          side,
        );
        walls.push(remainder);
      }
    }
  }

  // Step 3: Create PlanWalls for fully non-shared (exterior) walls
  for (const room of rooms) {
    for (const wall of room.walls) {
      const wallKey = `${room.id}.${wall.direction}`;
      if (consumedRanges.has(wallKey)) continue; // Has shared portions, handled above

      const planWall: PlanWall = {
        id: wallKey,
        roomA: room.id,
        roomB: null,
        directionInA: wall.direction,
        directionInB: null,
        type: wall.type,
        composition: {
          stud: null,
          studWidthFt: 0,
          finishA: 0,
          finishB: 0,
          totalThickness: wall.thickness,
        },
        thickness: wall.thickness,
        lineWeight: wall.lineWeight,
        centerline: computeCenterline(wall.outerEdge, wall.innerEdge),
        outerEdge: wall.outerEdge,
        innerEdge: wall.innerEdge,
        rect: wall.rect,
        openings: wall.openings.map((o) => ({ ...o, ownerRoomId: room.id })),
        segments: wall.segments,
        shared: false,
      };

      walls.push(planWall);
      byRoom.get(room.id)!.set(wall.direction, planWall);
    }
  }

  // Step 4: Extend vertical walls to fill corner gaps at shared wall junctions.
  // Without this, vertical walls (east/west) stop at the room boundary, leaving gaps
  // at corners where horizontal walls fill the gap between adjacent rooms.
  //
  // Extension rule:
  // - If the adjacent room has a wall on the same face (same X position), both walls
  //   meet at the CENTERLINE of the gap (each extends halfway).
  // - If the adjacent room does NOT have a wall on this face (e.g., this room is wider),
  //   this wall is the only one, so it extends to the FULL far edge of the gap.
  for (const pw of walls) {
    if (pw.shared) continue;
    const dir = pw.directionInA;
    if (dir !== "east" && dir !== "west") continue;

    const room = rooms.find((r) => r.id === pw.roomA);
    if (!room) continue;

    // The inner X position of this vertical wall (room boundary edge)
    const wallInnerX =
      dir === "east" ? room.bounds.x + room.bounds.width : room.bounds.x;

    let yMin = pw.rect.y;
    let yMax = pw.rect.y + pw.rect.height;
    let modified = false;

    // Check if this room has an adjacent room on its south or north side (with a gap).
    // Only extend if the wall is actually at the room's south/north boundary (not a
    // remainder wall in the middle of the room edge).
    for (const other of rooms) {
      if (other.id === room.id) continue;

      // South: other room is below this room with a gap
      const southGap = room.bounds.y - (other.bounds.y + other.bounds.height);
      if (southGap > EPSILON && southGap <= MAX_SHARED_GAP) {
        // Only extend if the wall starts at the room's south boundary
        if (Math.abs(pw.rect.y - room.bounds.y) < EPSILON) {
          // Does the adjacent room have a wall on this same face?
          const hasOpposingWall =
            dir === "east"
              ? other.bounds.x + other.bounds.width >= wallInnerX - EPSILON
              : other.bounds.x <= wallInnerX + EPSILON;
          const targetY = hasOpposingWall
            ? room.bounds.y - southGap / 2 // Meet at centerline
            : room.bounds.y - southGap; // Extend to full far edge
          if (targetY < yMin - EPSILON) {
            yMin = targetY;
            modified = true;
          }
        }
      }

      // North: other room is above this room with a gap
      const northGap = other.bounds.y - (room.bounds.y + room.bounds.height);
      if (northGap > EPSILON && northGap <= MAX_SHARED_GAP) {
        // Only extend if the wall ends at the room's north boundary
        if (
          Math.abs(
            pw.rect.y + pw.rect.height - (room.bounds.y + room.bounds.height),
          ) < EPSILON
        ) {
          const hasOpposingWall =
            dir === "east"
              ? other.bounds.x + other.bounds.width >= wallInnerX - EPSILON
              : other.bounds.x <= wallInnerX + EPSILON;
          const targetY = hasOpposingWall
            ? room.bounds.y + room.bounds.height + northGap / 2 // Meet at centerline
            : room.bounds.y + room.bounds.height + northGap; // Extend to full far edge
          if (targetY > yMax + EPSILON) {
            yMax = targetY;
            modified = true;
          }
        }
      }
    }

    if (modified) {
      const newRect = { ...pw.rect, y: yMin, height: yMax - yMin };
      pw.outerEdge = {
        start: { x: pw.outerEdge.start.x, y: yMin },
        end: { x: pw.outerEdge.end.x, y: yMax },
      };
      pw.innerEdge = {
        start: { x: pw.innerEdge.start.x, y: yMin },
        end: { x: pw.innerEdge.end.x, y: yMax },
      };
      pw.centerline = computeCenterline(pw.outerEdge, pw.innerEdge);

      if (pw.segments.length > 1) {
        // Wall has gaps (e.g., from extensions) — preserve them by only
        // extending the first/last segments to cover the new Y range
        const sorted = [...pw.segments].sort((a, b) => a.y - b.y);
        // Extend first segment downward to new yMin
        const first = sorted[0];
        const firstBottomDelta = first.y - yMin;
        if (firstBottomDelta > EPSILON) {
          sorted[0] = {
            ...first,
            x: newRect.x,
            width: newRect.width,
            y: yMin,
            height: first.height + firstBottomDelta,
          };
        } else {
          sorted[0] = { ...first, x: newRect.x, width: newRect.width };
        }
        // Extend last segment upward to new yMax
        const last = sorted[sorted.length - 1];
        const lastTopDelta = yMax - (last.y + last.height);
        if (lastTopDelta > EPSILON) {
          sorted[sorted.length - 1] = {
            ...last,
            x: newRect.x,
            width: newRect.width,
            height: last.height + lastTopDelta,
          };
        } else {
          sorted[sorted.length - 1] = {
            ...last,
            x: newRect.x,
            width: newRect.width,
          };
        }
        // Update X/width on middle segments
        for (let s = 1; s < sorted.length - 1; s++) {
          sorted[s] = { ...sorted[s], x: newRect.x, width: newRect.width };
        }
        pw.segments = sorted;
      } else {
        // No gaps — recompute segments normally
        pw.rect = newRect;
        pw.segments = resolveWallSegments({
          ...pw,
          id: pw.id,
          direction: dir!,
          interiorStartOffset: 0,
        });
      }
      pw.rect = newRect;
    }
  }

  return { walls, byRoom };
}

/**
 * Compute the overlap range along the wall axis for two adjacent rooms.
 * For east/west walls, this is the Y range; for north/south, the X range.
 */
function getOverlapRange(
  roomA: ResolvedRoom,
  roomB: ResolvedRoom,
  dirInA: CardinalDirection,
): [number, number] {
  const a = roomA.bounds;
  const b = roomB.bounds;
  if (dirInA === "east" || dirInA === "west") {
    return [Math.max(a.y, b.y), Math.min(a.y + a.height, b.y + b.height)];
  }
  return [Math.max(a.x, b.x), Math.min(a.x + a.width, b.x + b.width)];
}

/**
 * Get the full range of a wall along its axis.
 */
function getWallRange(
  room: ResolvedRoom,
  direction: CardinalDirection,
): [number, number] {
  const b = room.bounds;
  if (direction === "east" || direction === "west") {
    return [b.y, b.y + b.height];
  }
  return [b.x, b.x + b.width];
}

/**
 * Compute which portions of a wall range are NOT covered by consumed ranges.
 */
function computeUncoveredRanges(
  wallStart: number,
  wallEnd: number,
  consumed: [number, number][],
): [number, number][] {
  const sorted = [...consumed].sort((a, b) => a[0] - b[0]);
  const uncovered: [number, number][] = [];

  let current = wallStart;
  for (const [s, e] of sorted) {
    if (s > current + EPSILON) {
      uncovered.push([current, s]);
    }
    current = Math.max(current, e);
  }
  if (current < wallEnd - EPSILON) {
    uncovered.push([current, wallEnd]);
  }

  return uncovered;
}

interface SharedBoundary {
  dirInA: CardinalDirection;
  dirInB: CardinalDirection;
}

// Maximum gap between rooms that can contain a shared wall (any wall thickness is well under 1ft)
const MAX_SHARED_GAP = 1.0;

/**
 * Detect if two rooms share a boundary edge.
 * Gap-aware: rooms may be separated by a gap (filled by the shared wall).
 * A shared boundary exists when the gap is non-negative and within MAX_SHARED_GAP.
 */
function detectSharedBoundary(
  roomA: ResolvedRoom,
  roomB: ResolvedRoom,
): SharedBoundary | null {
  const a = roomA.bounds;
  const b = roomB.bounds;

  // A's east edge near B's west edge (gap ≥ 0, ≤ MAX_SHARED_GAP)
  const eastGap = b.x - (a.x + a.width);
  if (eastGap >= -EPSILON && eastGap <= MAX_SHARED_GAP && hasYOverlap(a, b)) {
    return { dirInA: "east", dirInB: "west" };
  }
  // A's west edge near B's east edge
  const westGap = a.x - (b.x + b.width);
  if (westGap >= -EPSILON && westGap <= MAX_SHARED_GAP && hasYOverlap(a, b)) {
    return { dirInA: "west", dirInB: "east" };
  }
  // A's north edge near B's south edge
  const northGap = b.y - (a.y + a.height);
  if (northGap >= -EPSILON && northGap <= MAX_SHARED_GAP && hasXOverlap(a, b)) {
    return { dirInA: "north", dirInB: "south" };
  }
  // A's south edge near B's north edge
  const southGap = a.y - (b.y + b.height);
  if (southGap >= -EPSILON && southGap <= MAX_SHARED_GAP && hasXOverlap(a, b)) {
    return { dirInA: "south", dirInB: "north" };
  }

  return null;
}

function hasYOverlap(a: Rect, b: Rect): boolean {
  return a.y < b.y + b.height + EPSILON && b.y < a.y + a.height + EPSILON;
}

function hasXOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width + EPSILON && b.x < a.x + a.width + EPSILON;
}

function findSharedWallOverride(
  roomAId: string,
  roomBId: string,
  sharedWalls?: SharedWallConfig[],
): SharedWallConfig | undefined {
  if (!sharedWalls) return undefined;
  return sharedWalls.find(
    (sw) =>
      (sw.rooms[0] === roomAId && sw.rooms[1] === roomBId) ||
      (sw.rooms[0] === roomBId && sw.rooms[1] === roomAId),
  );
}

function chooseWallType(typeA: WallType, typeB: WallType): WallType {
  // Shared walls between two rooms are interior by definition.
  // Load-bearing is a structural classification independent of adjacency.
  if (typeA === "load-bearing" || typeB === "load-bearing")
    return "load-bearing";
  return "interior";
}

/**
 * Realign an opening's coordinates from the original per-room wall rect to the shared wall rect.
 * The perpendicular-axis coordinate (X for vertical walls, Y for horizontal walls) is shifted
 * so the opening aligns with the shared wall's position instead of the original room wall.
 */
function realignOpeningToSharedWall(
  opening: ResolvedOpening,
  _originalRect: Rect,
  sharedRect: Rect,
  direction: CardinalDirection,
  sharedThickness: number,
): ResolvedOpening {
  const aligned = { ...opening };

  if (direction === "north" || direction === "south") {
    // Horizontal wall: perpendicular axis is Y
    const newY = sharedRect.y;
    const newMidY = sharedRect.y + sharedThickness / 2;

    aligned.gapStart = { ...opening.gapStart, y: newY };
    aligned.gapEnd = { ...opening.gapEnd, y: newY };
    aligned.position = { ...opening.position, y: newMidY };
    aligned.centerline = {
      start: { ...opening.centerline.start, y: newMidY },
      end: { ...opening.centerline.end, y: newMidY },
    };
    aligned.wallThickness = sharedThickness;
  } else {
    // Vertical wall: perpendicular axis is X
    const newX = sharedRect.x;
    const newMidX = sharedRect.x + sharedThickness / 2;

    aligned.gapStart = { ...opening.gapStart, x: newX };
    aligned.gapEnd = { ...opening.gapEnd, x: newX };
    aligned.position = { ...opening.position, x: newMidX };
    aligned.centerline = {
      start: { ...opening.centerline.start, x: newMidX },
      end: { ...opening.centerline.end, x: newMidX },
    };
    aligned.wallThickness = sharedThickness;
  }

  return aligned;
}

function buildRemainderPlanWall(
  room: ResolvedRoom,
  wall: {
    type: WallType;
    thickness: number;
    lineWeight: number;
    direction: CardinalDirection;
    openings: ResolvedOpening[];
  },
  direction: CardinalDirection,
  start: number,
  end: number,
  side: "before" | "after",
): PlanWall {
  const b = room.bounds;
  const thickness = wall.thickness;
  const halfThick = thickness / 2;

  let rect: Rect;
  let centerline: LineSegment;
  let outerEdge: LineSegment;
  let innerEdge: LineSegment;

  // Remainder walls extend outward from the room boundary (same as per-room wall convention).
  // The shared wall fills the gap between rooms; the remainder wall extends outward from
  // the room boundary by the wall's full thickness, matching the per-room wall resolver behavior.
  switch (direction) {
    case "south": {
      const boundaryY = b.y;
      rect = {
        x: start,
        y: boundaryY - thickness,
        width: end - start,
        height: thickness,
      };
      centerline = {
        start: { x: start, y: boundaryY - halfThick },
        end: { x: end, y: boundaryY - halfThick },
      };
      outerEdge = {
        start: { x: start, y: boundaryY - thickness },
        end: { x: end, y: boundaryY - thickness },
      };
      innerEdge = {
        start: { x: start, y: boundaryY },
        end: { x: end, y: boundaryY },
      };
      break;
    }
    case "north": {
      const boundaryY = b.y + b.height;
      rect = { x: start, y: boundaryY, width: end - start, height: thickness };
      centerline = {
        start: { x: start, y: boundaryY + halfThick },
        end: { x: end, y: boundaryY + halfThick },
      };
      outerEdge = {
        start: { x: start, y: boundaryY + thickness },
        end: { x: end, y: boundaryY + thickness },
      };
      innerEdge = {
        start: { x: start, y: boundaryY },
        end: { x: end, y: boundaryY },
      };
      break;
    }
    case "west": {
      const boundaryX = b.x;
      rect = {
        x: boundaryX - thickness,
        y: start,
        width: thickness,
        height: end - start,
      };
      centerline = {
        start: { x: boundaryX - halfThick, y: start },
        end: { x: boundaryX - halfThick, y: end },
      };
      outerEdge = {
        start: { x: boundaryX - thickness, y: start },
        end: { x: boundaryX - thickness, y: end },
      };
      innerEdge = {
        start: { x: boundaryX, y: start },
        end: { x: boundaryX, y: end },
      };
      break;
    }
    case "east": {
      const boundaryX = b.x + b.width;
      rect = { x: boundaryX, y: start, width: thickness, height: end - start };
      centerline = {
        start: { x: boundaryX + halfThick, y: start },
        end: { x: boundaryX + halfThick, y: end },
      };
      outerEdge = {
        start: { x: boundaryX + thickness, y: start },
        end: { x: boundaryX + thickness, y: end },
      };
      innerEdge = {
        start: { x: boundaryX, y: start },
        end: { x: boundaryX, y: end },
      };
      break;
    }
  }

  // Filter openings from the per-room wall that fall within this remainder's range
  const isHorizontal = direction === "south" || direction === "north";
  const filteredOpenings = wall.openings
    .filter((o) => {
      if (isHorizontal) {
        return o.gapStart.x >= start - EPSILON && o.gapEnd.x <= end + EPSILON;
      }
      return o.gapStart.y >= start - EPSILON && o.gapEnd.y <= end + EPSILON;
    })
    .map((o) => ({
      ...o,
      ownerRoomId: room.id,
      // Realign perpendicular coordinate to remainder wall rect
      ...(isHorizontal
        ? {
            gapStart: { ...o.gapStart, y: rect.y },
            gapEnd: { ...o.gapEnd, y: rect.y },
            position: { ...o.position, y: rect.y + thickness / 2 },
            centerline: {
              start: { ...o.centerline.start, y: rect.y + thickness / 2 },
              end: { ...o.centerline.end, y: rect.y + thickness / 2 },
            },
          }
        : {
            gapStart: { ...o.gapStart, x: rect.x },
            gapEnd: { ...o.gapEnd, x: rect.x },
            position: { ...o.position, x: rect.x + thickness / 2 },
            centerline: {
              start: { ...o.centerline.start, x: rect.x + thickness / 2 },
              end: { ...o.centerline.end, x: rect.x + thickness / 2 },
            },
          }),
      wallThickness: thickness,
    }));

  const pw: PlanWall = {
    id: `${room.id}.${direction}.remainder-${side}`,
    roomA: room.id,
    roomB: null,
    directionInA: direction,
    directionInB: null,
    type: wall.type,
    composition: {
      stud: null,
      studWidthFt: 0,
      finishA: 0,
      finishB: 0,
      totalThickness: thickness,
    },
    thickness,
    lineWeight: wall.lineWeight,
    centerline,
    outerEdge,
    innerEdge,
    rect,
    openings: filteredOpenings,
    segments: [rect],
    shared: false,
  };

  // Recompute segments if openings exist
  if (filteredOpenings.length > 0) {
    pw.segments = resolveWallSegments({
      ...pw,
      id: pw.id,
      direction,
      interiorStartOffset: 0,
    });
  }

  return pw;
}

/**
 * Compute geometry for a shared wall between two rooms.
 * The wall fills the gap between rooms (centered in the gap).
 * When gap == thickness, the wall fills it exactly without intruding into either room.
 * When gap == 0, reverts to legacy centering behavior.
 */
interface SharedWallGeometry {
  rect: Rect;
  centerline: LineSegment;
  outerEdge: LineSegment;
  innerEdge: LineSegment;
  overlapStart: number;
  overlapEnd: number;
}

function computeSharedWallGeometry(
  roomA: ResolvedRoom,
  roomB: ResolvedRoom,
  dirInA: CardinalDirection,
  _dirInB: CardinalDirection,
  thickness: number,
): SharedWallGeometry {
  const a = roomA.bounds;
  const b = roomB.bounds;

  switch (dirInA) {
    case "east": {
      const gapStart = a.x + a.width; // Room A's right edge
      const gapEnd = b.x; // Room B's left edge
      const gap = gapEnd - gapStart;
      const wallX = gapStart + (gap - thickness) / 2;
      const gapCenterX = gapStart + gap / 2;
      const minY = Math.max(a.y, b.y);
      const maxY = Math.min(a.y + a.height, b.y + b.height);
      const wallLength = maxY - minY;
      return {
        rect: { x: wallX, y: minY, width: thickness, height: wallLength },
        centerline: {
          start: { x: gapCenterX, y: minY },
          end: { x: gapCenterX, y: maxY },
        },
        outerEdge: { start: { x: wallX, y: minY }, end: { x: wallX, y: maxY } },
        innerEdge: {
          start: { x: wallX + thickness, y: minY },
          end: { x: wallX + thickness, y: maxY },
        },
        overlapStart: minY,
        overlapEnd: maxY,
      };
    }
    case "west": {
      const gapStart = b.x + b.width; // Room B's right edge
      const gapEnd = a.x; // Room A's left edge
      const gap = gapEnd - gapStart;
      const wallX = gapStart + (gap - thickness) / 2;
      const gapCenterX = gapStart + gap / 2;
      const minY = Math.max(a.y, b.y);
      const maxY = Math.min(a.y + a.height, b.y + b.height);
      const wallLength = maxY - minY;
      return {
        rect: { x: wallX, y: minY, width: thickness, height: wallLength },
        centerline: {
          start: { x: gapCenterX, y: minY },
          end: { x: gapCenterX, y: maxY },
        },
        outerEdge: {
          start: { x: wallX + thickness, y: minY },
          end: { x: wallX + thickness, y: maxY },
        },
        innerEdge: { start: { x: wallX, y: minY }, end: { x: wallX, y: maxY } },
        overlapStart: minY,
        overlapEnd: maxY,
      };
    }
    case "north": {
      const gapStart = a.y + a.height; // Room A's top edge
      const gapEnd = b.y; // Room B's bottom edge
      const gap = gapEnd - gapStart;
      const wallY = gapStart + (gap - thickness) / 2;
      const gapCenterY = gapStart + gap / 2;
      const minX = Math.max(a.x, b.x);
      const maxX = Math.min(a.x + a.width, b.x + b.width);
      const wallLength = maxX - minX;
      return {
        rect: { x: minX, y: wallY, width: wallLength, height: thickness },
        centerline: {
          start: { x: minX, y: gapCenterY },
          end: { x: maxX, y: gapCenterY },
        },
        outerEdge: {
          start: { x: minX, y: wallY + thickness },
          end: { x: maxX, y: wallY + thickness },
        },
        innerEdge: { start: { x: minX, y: wallY }, end: { x: maxX, y: wallY } },
        overlapStart: minX,
        overlapEnd: maxX,
      };
    }
    case "south": {
      const gapStart = b.y + b.height; // Room B's top edge
      const gapEnd = a.y; // Room A's bottom edge
      const gap = gapEnd - gapStart;
      const wallY = gapStart + (gap - thickness) / 2;
      const gapCenterY = gapStart + gap / 2;
      const minX = Math.max(a.x, b.x);
      const maxX = Math.min(a.x + a.width, b.x + b.width);
      const wallLength = maxX - minX;
      return {
        rect: { x: minX, y: wallY, width: wallLength, height: thickness },
        centerline: {
          start: { x: minX, y: gapCenterY },
          end: { x: maxX, y: gapCenterY },
        },
        outerEdge: { start: { x: minX, y: wallY }, end: { x: maxX, y: wallY } },
        innerEdge: {
          start: { x: minX, y: wallY + thickness },
          end: { x: maxX, y: wallY + thickness },
        },
        overlapStart: minX,
        overlapEnd: maxX,
      };
    }
  }
}

function computeCenterline(
  outer: LineSegment,
  inner: LineSegment,
): LineSegment {
  return {
    start: {
      x: (outer.start.x + inner.start.x) / 2,
      y: (outer.start.y + inner.start.y) / 2,
    },
    end: {
      x: (outer.end.x + inner.end.x) / 2,
      y: (outer.end.y + inner.end.y) / 2,
    },
  };
}
