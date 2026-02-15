import { formatDimension } from "../parser/dimension.js";
import type { CardinalDirection, UnitSystem } from "../types/config.js";
import type {
  ChainSegment,
  DimensionChain,
  PerimeterChain,
  ResolvedEnclosure,
  ResolvedExtension,
  ResolvedRoom,
  Wall,
  WallGraph,
} from "../types/geometry.js";

const DIMENSION_OFFSET_FT = 2;
const DIMENSION_OFFSET_M = 0.6;
const LANE_SPACING_FT = 1.5;
const LANE_SPACING_M = 0.45;
const EPSILON = 0.01;

export const EXTENSION_GAP = 0.15;
export const EXTENSION_OVERSHOOT = 0.15;
export const CHAR_WIDTH_RATIO = 0.6;
const COLLINEAR_EPSILON_FT = 0.5;
const COLLINEAR_EPSILON_M = 0.15;

const FONT_SIZE_FT = 0.35;
const FONT_SIZE_M = 0.1;

/**
 * Estimate the rendered width of a dimension label using character-count heuristic.
 */
export function estimateTextWidth(label: string, fontSize: number): number {
  return label.length * fontSize * CHAR_WIDTH_RATIO;
}

// ---- BuildingEdgeGroup (T016) ----

export interface BuildingEdgeGroup {
  direction: CardinalDirection;
  perpendicularCoord: number;
  segments: {
    start: number;
    end: number;
    wallId: string;
    roomId: string;
  }[];
}

// ---- extractBuildingEdges (T015) ----

/**
 * Group perimeter-eligible walls by direction and cluster collinear edges
 * by perpendicular coordinate. Returns edge groups suitable for chain
 * dimension generation.
 *
 * Uses wallGraph.walls filtered for perimeter eligibility (same criteria
 * as computePerimeter: !shared && source !== "enclosure"), then maps
 * each wall to a room-attributed segment along the building edge.
 */
export function extractBuildingEdges(
  perimeter: PerimeterChain[],
  wallGraph: WallGraph,
  rooms: ResolvedRoom[],
): Map<CardinalDirection, BuildingEdgeGroup[]> {
  if (perimeter.length === 0) {
    return new Map();
  }

  // Determine collinear epsilon from wall data (use first wall to infer unit scale)
  // Walls in imperial have thickness ~0.5ft; metric ~0.15m
  // We use explicit epsilon values matching the declared constants
  const collinearEpsilon =
    wallGraph.walls.length > 0 && wallGraph.walls[0].thickness > 0.3
      ? COLLINEAR_EPSILON_FT
      : COLLINEAR_EPSILON_M;

  // Build roomId → room bounds lookup
  const roomBoundsById = new Map<string, ResolvedRoom>();
  for (const room of rooms) {
    roomBoundsById.set(room.id, room);
  }

  // Collect dimension-eligible walls: non-shared, non-interior, parent walls only.
  // Excludes: enclosure walls, extension bump-out walls (can create edge groups
  // at interior perpendicular coordinates), interior-type walls (including
  // shared-wall remainder segments that don't represent the building exterior),
  // and shared walls between rooms.
  const perimeterWalls = wallGraph.walls.filter(
    (w) => w.source === "parent" && !w.shared && w.type !== "interior",
  );

  // Build segments grouped by direction
  const directionSegments = new Map<
    CardinalDirection,
    {
      perpendicularCoord: number;
      start: number;
      end: number;
      wallId: string;
      roomId: string;
    }[]
  >();

  for (const wall of perimeterWalls) {
    const room = roomBoundsById.get(wall.roomId);
    if (!room) continue;

    const seg = wallToEdgeSegment(wall, room);
    if (!seg) continue;

    if (!directionSegments.has(wall.direction)) {
      directionSegments.set(wall.direction, []);
    }
    directionSegments.get(wall.direction)!.push(seg);
  }

  // Cluster by perpendicular coordinate within each direction
  const result = new Map<CardinalDirection, BuildingEdgeGroup[]>();

  for (const [direction, segments] of directionSegments) {
    // Sort by perpendicular coordinate for clustering
    segments.sort((a, b) => a.perpendicularCoord - b.perpendicularCoord);

    const groups: BuildingEdgeGroup[] = [];
    let currentGroup: BuildingEdgeGroup | null = null;

    for (const seg of segments) {
      if (
        !currentGroup ||
        Math.abs(seg.perpendicularCoord - currentGroup.perpendicularCoord) >
          collinearEpsilon
      ) {
        currentGroup = {
          direction,
          perpendicularCoord: seg.perpendicularCoord,
          segments: [],
        };
        groups.push(currentGroup);
      }
      currentGroup.segments.push({
        start: seg.start,
        end: seg.end,
        wallId: seg.wallId,
        roomId: seg.roomId,
      });
    }

    // Sort segments within each group by start position
    for (const group of groups) {
      group.segments.sort((a, b) => a.start - b.start);
    }

    // Deduplicate: when a roomId appears in multiple groups for the same
    // direction (e.g. parent wall + extension wall), keep only the segment
    // in the outermost group and remove duplicates from inner groups.
    const deduped = deduplicateRoomSegments(groups, direction);

    result.set(direction, deduped);
  }

  return result;
}

/**
 * Deduplicate room segments across groups within the same direction.
 * When a roomId appears in multiple groups (e.g. parent wall + extension wall),
 * keep only the segment in the outermost group (furthest from building center)
 * and remove duplicates from inner groups. Remove empty groups.
 */
function deduplicateRoomSegments(
  groups: BuildingEdgeGroup[],
  direction: CardinalDirection,
): BuildingEdgeGroup[] {
  if (groups.length <= 1) return groups;

  // Collect all roomIds that appear in more than one group
  const roomGroupIndices = new Map<string, number[]>();
  for (let i = 0; i < groups.length; i++) {
    for (const seg of groups[i].segments) {
      if (!roomGroupIndices.has(seg.roomId)) {
        roomGroupIndices.set(seg.roomId, []);
      }
      roomGroupIndices.get(seg.roomId)!.push(i);
    }
  }

  // For each duplicated roomId, find the outermost group and mark
  // the segment for removal in all other groups.
  const removeFromGroup = new Set<string>(); // "groupIndex:roomId"

  for (const [roomId, indices] of roomGroupIndices) {
    const unique = [...new Set(indices)];
    if (unique.length <= 1) continue;

    // Outermost = max perpendicular for north/east, min for south/west
    const isOuterMax = direction === "north" || direction === "east";
    let bestIdx = unique[0];
    for (const idx of unique) {
      const coord = groups[idx].perpendicularCoord;
      const bestCoord = groups[bestIdx].perpendicularCoord;
      if (isOuterMax ? coord > bestCoord : coord < bestCoord) {
        bestIdx = idx;
      }
    }

    // Remove this roomId from all groups except the best
    for (const idx of unique) {
      if (idx !== bestIdx) {
        removeFromGroup.add(`${idx}:${roomId}`);
      }
    }
  }

  if (removeFromGroup.size === 0) return groups;

  // Filter segments and remove empty groups
  const result: BuildingEdgeGroup[] = [];
  for (let i = 0; i < groups.length; i++) {
    const filtered = groups[i].segments.filter(
      (seg) => !removeFromGroup.has(`${i}:${seg.roomId}`),
    );
    if (filtered.length > 0) {
      result.push({ ...groups[i], segments: filtered });
    }
  }

  return result;
}

/**
 * Extract axis-aligned segment info from a wall for dimension purposes.
 * Uses the room bounds for the axis range (room's interior extent along
 * the building edge) and the wall outer edge for the perpendicular coordinate
 * (where the building edge is located).
 */
function wallToEdgeSegment(
  wall: Wall,
  room: ResolvedRoom,
): {
  perpendicularCoord: number;
  start: number;
  end: number;
  wallId: string;
  roomId: string;
} | null {
  const { x, y, width, height } = room.bounds;

  // For horizontal walls (north/south): perpendicular = Y, axis = X (room width)
  // For vertical walls (east/west): perpendicular = X, axis = Y (room height)
  switch (wall.direction) {
    case "north":
      return {
        perpendicularCoord: wall.outerEdge.start.y,
        start: x,
        end: x + width,
        wallId: wall.id,
        roomId: wall.roomId,
      };
    case "south":
      return {
        perpendicularCoord: wall.outerEdge.start.y,
        start: x,
        end: x + width,
        wallId: wall.id,
        roomId: wall.roomId,
      };
    case "east":
      return {
        perpendicularCoord: wall.outerEdge.start.x,
        start: y,
        end: y + height,
        wallId: wall.id,
        roomId: wall.roomId,
      };
    case "west":
      return {
        perpendicularCoord: wall.outerEdge.start.x,
        start: y,
        end: y + height,
        wallId: wall.id,
        roomId: wall.roomId,
      };
  }
}

// ---- deduplicateAcrossDirections (R1) ----

/**
 * Remove redundant room dimensions that appear on opposite sides of the building.
 * Horizontal: prefer north over south (remove from south any room also in north).
 * Vertical: prefer west over east (remove from east any room also in west).
 * Mutates the edgeGroups map in place; removes empty groups/directions.
 */
export function deduplicateAcrossDirections(
  edgeGroups: Map<CardinalDirection, BuildingEdgeGroup[]>,
): void {
  // Horizontal: prefer north, remove duplicates from south
  deduplicateDirectionPair(edgeGroups, "north", "south");
  // Vertical: prefer west, remove duplicates from east
  deduplicateDirectionPair(edgeGroups, "west", "east");
}

function deduplicateDirectionPair(
  edgeGroups: Map<CardinalDirection, BuildingEdgeGroup[]>,
  preferred: CardinalDirection,
  secondary: CardinalDirection,
): void {
  const preferredGroups = edgeGroups.get(preferred);
  const secondaryGroups = edgeGroups.get(secondary);
  if (!preferredGroups || !secondaryGroups) return;

  // Collect all roomIds covered by the preferred direction
  const preferredRoomIds = new Set<string>();
  for (const g of preferredGroups) {
    for (const seg of g.segments) {
      preferredRoomIds.add(seg.roomId);
    }
  }

  if (preferredRoomIds.size === 0) return;

  // Remove those roomIds from secondary direction groups
  const filtered: BuildingEdgeGroup[] = [];
  for (const g of secondaryGroups) {
    const segs = g.segments.filter((s) => !preferredRoomIds.has(s.roomId));
    if (segs.length > 0) {
      filtered.push({ ...g, segments: segs });
    }
  }

  if (filtered.length > 0) {
    edgeGroups.set(secondary, filtered);
  } else {
    edgeGroups.delete(secondary);
  }
}

// ---- computeExtensionOuterExtent ----

/**
 * Scan rooms' extensions and return the most extreme outer edge coordinate
 * per cardinal direction. Used to push perimeter baselines past protruding
 * extensions so dimension lines don't collide with geometry.
 */
export function computeExtensionOuterExtent(
  rooms: ResolvedRoom[],
  wallGraph: WallGraph,
): Map<CardinalDirection, number> {
  const extents = new Map<CardinalDirection, number>();

  for (const room of rooms) {
    if (!room.extensions) continue;
    for (const ext of room.extensions) {
      const dir = ext.parentWall; // far wall direction matches parentWall
      const subWalls = wallGraph.bySubSpace.get(ext.id);
      if (!subWalls) continue;
      const farWall = subWalls.get(dir);
      if (!farWall) continue;

      // Perpendicular coordinate of the far wall outer edge
      const isHorizontal = dir === "north" || dir === "south";
      const perpCoord = isHorizontal
        ? farWall.outerEdge.start.y
        : farWall.outerEdge.start.x;

      const current = extents.get(dir);
      if (current === undefined) {
        extents.set(dir, perpCoord);
      } else {
        // Keep the most extreme: max for north/east, min for south/west
        const isOuterMax = dir === "north" || dir === "east";
        if (isOuterMax ? perpCoord > current : perpCoord < current) {
          extents.set(dir, perpCoord);
        }
      }
    }
  }

  return extents;
}

// ---- buildChainDimensions (T017, T018) ----

/**
 * Convert building edge groups into lane-assigned chain dimensions.
 * Lane 0: room-edge segments (one chain per edge group).
 * Lane 1: overall building dimension (single segment spanning full edge),
 *          suppressed for single-room edges (FR-003).
 */
export function buildChainDimensions(
  edgeGroups: Map<CardinalDirection, BuildingEdgeGroup[]>,
  units: UnitSystem,
  wallGraph?: WallGraph,
  rooms?: ResolvedRoom[],
): DimensionChain[] {
  const baseOffset =
    units === "imperial" ? DIMENSION_OFFSET_FT : DIMENSION_OFFSET_M;
  const laneSpacing =
    units === "imperial" ? LANE_SPACING_FT : LANE_SPACING_M;
  const fontSize = units === "imperial" ? FONT_SIZE_FT : FONT_SIZE_M;

  // Compute extension outer extents to push baselines past protruding sub-spaces
  const extensionExtents =
    wallGraph && rooms
      ? computeExtensionOuterExtent(rooms, wallGraph)
      : new Map<CardinalDirection, number>();

  const chains: DimensionChain[] = [];
  let chainIndex = 0;

  for (const [direction, groups] of edgeGroups) {
    const orientation = directionToOrientation(direction);
    const sign = directionToSign(direction);
    const isHorizontal = direction === "north" || direction === "south";

    // Sort groups outermost-first so dimension lanes stack outward
    // from the most extreme building edge, avoiding overlaps with
    // protruding elements (e.g., Half Bath below Living Room).
    const sortedGroups = [...groups].sort((a, b) =>
      sign > 0
        ? b.perpendicularCoord - a.perpendicularCoord
        : a.perpendicularCoord - b.perpendicularCoord,
    );

    // Start stacking from the outermost perpendicular coordinate,
    // pushed past any protruding extensions in this direction
    const outermostPerpCoord = sortedGroups[0].perpendicularCoord;
    const extExtent = extensionExtents.get(direction);
    const effectiveOuterCoord =
      extExtent !== undefined
        ? sign > 0
          ? Math.max(outermostPerpCoord, extExtent)
          : Math.min(outermostPerpCoord, extExtent)
        : outermostPerpCoord;
    let nextBaseline = effectiveOuterCoord + sign * baseOffset;

    for (const group of sortedGroups) {
      if (group.segments.length === 0) continue;

      // Lane 0: room-edge chain with per-room segments + wall-thickness segments
      const lane0Baseline = nextBaseline;
      const lane0Segments = buildLane0Segments(
        group,
        direction,
        lane0Baseline,
        units,
        fontSize,
        wallGraph,
      );

      if (lane0Segments.length > 0) {
        // Offset = signed distance from baseline to wall edge (for extension lines)
        const lane0RelOffset = lane0Baseline - group.perpendicularCoord;
        chains.push({
          id: `chain-${direction}-${chainIndex++}`,
          segments: lane0Segments,
          orientation,
          direction,
          lane: 0,
          offset: lane0RelOffset,
        });
        nextBaseline += sign * laneSpacing;
      }

      // Lane 1: overall building dimension (suppressed for single-room edges)
      const uniqueRooms = new Set(group.segments.map((s) => s.roomId));
      if (uniqueRooms.size >= 2 && lane0Segments.length > 0) {
        const lane1Baseline = nextBaseline;
        // Use lane 0 chain endpoints for consistent alignment
        const firstSeg = lane0Segments[0];
        const lastSeg = lane0Segments[lane0Segments.length - 1];
        const overallStart = isHorizontal ? firstSeg.from.x : firstSeg.from.y;
        const overallEnd = isHorizontal ? lastSeg.to.x : lastSeg.to.y;
        const overallLength = overallEnd - overallStart;
        const overallLabel = formatDimension(overallLength, units);
        const textWidth = estimateTextWidth(overallLabel, fontSize);
        const textFits =
          overallLength >= textWidth + 2 * fontSize * 0.3;

        const overallSegment = makeSegment(
          overallStart,
          overallEnd,
          direction,
          lane1Baseline,
          overallLabel,
          "overall",
          textFits,
          "overall",
        );

        const lane1RelOffset = lane1Baseline - group.perpendicularCoord;
        chains.push({
          id: `chain-${direction}-${chainIndex++}`,
          segments: [overallSegment],
          orientation,
          direction,
          lane: 1,
          offset: lane1RelOffset,
        });
        nextBaseline += sign * laneSpacing;
      }
    }
  }

  return chains;
}

/**
 * Get the exterior face coordinate for a perpendicular wall.
 * For horizontal chains (axis=X): returns X coordinate of the wall's outer edge.
 * For vertical chains (axis=Y): returns Y coordinate of the wall's outer edge.
 */
function getExteriorFaceCoord(wall: Wall, isHorizontal: boolean): number {
  return isHorizontal ? wall.outerEdge.start.x : wall.outerEdge.start.y;
}

function buildLane0Segments(
  group: BuildingEdgeGroup,
  direction: CardinalDirection,
  offset: number,
  units: UnitSystem,
  fontSize: number,
  wallGraph?: WallGraph,
): ChainSegment[] {
  const groupSegs = group.segments.filter(
    (s) => s.end - s.start >= EPSILON,
  );
  if (groupSegs.length === 0) return [];

  const isHorizontal = direction === "north" || direction === "south";
  // Leading/trailing perpendicular directions for exterior wall lookup
  const leadingDir: CardinalDirection = isHorizontal ? "west" : "south";
  const trailingDir: CardinalDirection = isHorizontal ? "east" : "north";

  const segments: ChainSegment[] = [];

  // R3: Leading exterior wall segment
  if (wallGraph) {
    const firstSeg = groupSegs[0];
    const leadingWall = wallGraph.byRoom.get(firstSeg.roomId)?.get(leadingDir);
    if (leadingWall && !leadingWall.shared) {
      const exteriorFace = getExteriorFaceCoord(leadingWall, isHorizontal);
      const wallWidth = firstSeg.start - exteriorFace;
      if (wallWidth > EPSILON) {
        const label = formatDimension(wallWidth, units);
        const textWidth = estimateTextWidth(label, fontSize);
        const textFits = wallWidth >= textWidth + 2 * fontSize * 0.3;
        segments.push(
          makeSegment(exteriorFace, firstSeg.start, direction, offset, label, "", textFits, "wall"),
        );
      }
    }
  }

  // Room segments with wall-thickness segments between them
  for (let i = 0; i < groupSegs.length; i++) {
    const seg = groupSegs[i];
    // Room interior width for the label (exact interior bounds)
    const roomWidth = seg.end - seg.start;
    const label = formatDimension(roomWidth, units);
    const textWidth = estimateTextWidth(label, fontSize);
    const textFits = roomWidth >= textWidth + 2 * fontSize * 0.3;

    // Room segment (exact interior bounds, no midpoint sharing)
    segments.push(
      makeSegment(seg.start, seg.end, direction, offset, label, seg.roomId, textFits, "room"),
    );

    // R2: Wall-thickness segment between this room and next
    if (i < groupSegs.length - 1) {
      const nextSeg = groupSegs[i + 1];
      const wallGap = nextSeg.start - seg.end;
      if (wallGap > EPSILON) {
        const wallLabel = formatDimension(wallGap, units);
        const wallTextWidth = estimateTextWidth(wallLabel, fontSize);
        const wallTextFits = wallGap >= wallTextWidth + 2 * fontSize * 0.3;
        segments.push(
          makeSegment(seg.end, nextSeg.start, direction, offset, wallLabel, "", wallTextFits, "wall"),
        );
      }
    }
  }

  // R3: Trailing exterior wall segment
  if (wallGraph) {
    const lastSeg = groupSegs[groupSegs.length - 1];
    const trailingWall = wallGraph.byRoom.get(lastSeg.roomId)?.get(trailingDir);
    if (trailingWall && !trailingWall.shared) {
      const exteriorFace = getExteriorFaceCoord(trailingWall, isHorizontal);
      const wallWidth = exteriorFace - lastSeg.end;
      if (wallWidth > EPSILON) {
        const label = formatDimension(wallWidth, units);
        const textWidth = estimateTextWidth(label, fontSize);
        const textFits = wallWidth >= textWidth + 2 * fontSize * 0.3;
        segments.push(
          makeSegment(lastSeg.end, exteriorFace, direction, offset, label, "", textFits, "wall"),
        );
      }
    }
  }

  return segments;
}

function makeSegment(
  start: number,
  end: number,
  direction: CardinalDirection,
  offset: number,
  label: string,
  roomId: string,
  textFits: boolean,
  segmentType?: "room" | "wall" | "overall",
): ChainSegment {
  const base: ChainSegment = (() => {
    switch (direction) {
      case "north":
      case "south":
        // Horizontal: axis = X, perpendicular = Y
        return {
          from: { x: start, y: offset },
          to: { x: end, y: offset },
          label,
          roomId,
          textFits,
        };
      case "east":
      case "west":
        // Vertical: axis = Y, perpendicular = X
        return {
          from: { x: offset, y: start },
          to: { x: offset, y: end },
          label,
          roomId,
          textFits,
        };
    }
  })();
  if (segmentType) {
    base.segmentType = segmentType;
  }
  return base;
}

function directionToOrientation(
  direction: CardinalDirection,
): "horizontal" | "vertical" {
  return direction === "north" || direction === "south"
    ? "horizontal"
    : "vertical";
}

/**
 * Offset sign: positive for directions that push outward from the building,
 * negative for directions that pull inward.
 * North/East: +1 (dimension line goes above/right)
 * South/West: -1 (dimension line goes below/left)
 */
function directionToSign(direction: CardinalDirection): number {
  return direction === "north" || direction === "east" ? 1 : -1;
}

// ---- detectTextCollisions (T033 — US3 deferred) ----

/**
 * Detect and resolve text-to-text and text-to-element collisions.
 * Currently a passthrough — returns chains unchanged.
 * TODO: Implement collision detection using TextBoundingBox (US3).
 */
export function detectTextCollisions(
  chains: DimensionChain[],
): DimensionChain[] {
  return chains;
}

// ---- generateUncoveredDimensions (T035) ----

/**
 * Generate single-segment DimensionChains for room edges not already covered
 * by an existing chain segment. Builds a coverage set from existing chains
 * (keyed by roomId + orientation), then creates dimensions only for
 * uncovered room edges.
 */
export function generateUncoveredDimensions(
  rooms: ResolvedRoom[],
  units: UnitSystem,
  chains: DimensionChain[],
): DimensionChain[] {
  const baseOffset =
    units === "imperial" ? DIMENSION_OFFSET_FT : DIMENSION_OFFSET_M;
  const fontSize = units === "imperial" ? FONT_SIZE_FT : FONT_SIZE_M;

  // Build coverage set: which room+orientation combos are already dimensioned
  const covered = new Set<string>();
  for (const chain of chains) {
    for (const seg of chain.segments) {
      if (seg.roomId === "overall" || seg.segmentType === "wall") continue;
      // A room's width is covered by any horizontal segment, height by vertical
      covered.add(`${seg.roomId}:${chain.orientation}`);
    }
  }

  const uncovered: DimensionChain[] = [];
  let chainIndex = 0;

  for (const room of rooms) {
    const { x, y, width, height } = room.bounds;

    // Width (horizontal) — check if already covered
    if (!covered.has(`${room.id}:horizontal`)) {
      const label = formatDimension(width, units);
      const textFits =
        width >= estimateTextWidth(label, fontSize) + 2 * fontSize * 0.3;
      const dimY = y - baseOffset;

      uncovered.push({
        id: `uncovered-${chainIndex++}`,
        segments: [
          {
            from: { x, y: dimY },
            to: { x: x + width, y: dimY },
            label,
            roomId: room.id,
            textFits,
          },
        ],
        orientation: "horizontal",
        direction: "south",
        lane: 0,
        offset: -baseOffset,
      });
    }

    // Height (vertical) — check if already covered
    if (!covered.has(`${room.id}:vertical`)) {
      const label = formatDimension(height, units);
      const textFits =
        height >= estimateTextWidth(label, fontSize) + 2 * fontSize * 0.3;
      const dimX = x - baseOffset;

      uncovered.push({
        id: `uncovered-${chainIndex++}`,
        segments: [
          {
            from: { x: dimX, y },
            to: { x: dimX, y: y + height },
            label,
            roomId: room.id,
            textFits,
          },
        ],
        orientation: "vertical",
        direction: "west",
        lane: 0,
        offset: -baseOffset,
      });
    }
  }

  return uncovered;
}

// ---- generateExtensionDims ----

/**
 * Pick the parent room's side wall closest to the extension's center.
 * For N/S extensions, choose between east and west.
 * For E/W extensions, choose between north and south.
 * This minimizes extension line length for the depth dimension.
 */
function pickCloserSide(
  ext: ResolvedExtension,
  isParentHorizontal: boolean,
  wallGraph: WallGraph,
): CardinalDirection {
  const candidates: [CardinalDirection, CardinalDirection] = isParentHorizontal
    ? ["east", "west"]
    : ["south", "north"];

  // Extension center along the perpendicular axis
  const extCenter = isParentHorizontal
    ? ext.bounds.x + ext.bounds.width / 2   // X center for N/S extensions
    : ext.bounds.y + ext.bounds.height / 2; // Y center for E/W extensions

  let bestDir = candidates[0];
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const wall = wallGraph.byRoom.get(ext.parentRoomId)?.get(candidate);
    if (!wall) continue;
    const isHoriz = candidate === "north" || candidate === "south";
    const wallCoord = isHoriz
      ? wall.outerEdge.start.y
      : wall.outerEdge.start.x;
    const dist = Math.abs(wallCoord - extCenter);
    if (dist < bestDist) {
      bestDist = dist;
      bestDir = candidate;
    }
  }

  return bestDir;
}

/**
 * Generate width and depth dimension chains for a single extension.
 * Width dim: along the far wall (parentWall direction).
 * Depth dim: perpendicular to the parent wall, on a chosen side.
 */
function generateExtensionDims(
  ext: ResolvedExtension,
  units: UnitSystem,
  wallGraph: WallGraph,
  chainIndex: { value: number },
): DimensionChain[] {
  const baseOffset =
    units === "imperial" ? DIMENSION_OFFSET_FT : DIMENSION_OFFSET_M;
  const smallOffset = baseOffset * 0.5;
  const fontSize = units === "imperial" ? FONT_SIZE_FT : FONT_SIZE_M;

  const subWalls = wallGraph.bySubSpace.get(ext.id);
  if (!subWalls) return [];

  const chains: DimensionChain[] = [];
  const { x, y, width, height } = ext.bounds;
  const dir = ext.parentWall;

  // --- Width dim (along far wall axis) ---
  const farWall = subWalls.get(dir);
  if (farWall) {
    const isHorizontal = dir === "north" || dir === "south";
    const sign = directionToSign(dir);
    const perpCoord = isHorizontal
      ? farWall.outerEdge.start.y
      : farWall.outerEdge.start.x;
    const baseline = perpCoord + sign * smallOffset;

    const dimLength = isHorizontal ? width : height;
    const dimStart = isHorizontal ? x : y;
    const dimEnd = dimStart + dimLength;
    const label = formatDimension(dimLength, units);
    const textWidth = estimateTextWidth(label, fontSize);
    const textFits = dimLength >= textWidth + 2 * fontSize * 0.3;

    const seg = makeSegment(
      dimStart, dimEnd, dir, baseline, label, ext.id, textFits, "room",
    );
    chains.push({
      id: `ext-${ext.id}-w-${chainIndex.value++}`,
      segments: [seg],
      orientation: isHorizontal ? "horizontal" : "vertical",
      direction: dir,
      lane: 0,
      offset: baseline - perpCoord,
    });
  }

  // --- Depth dim (perpendicular to parent wall) ---
  // This is an exterior-to-exterior measurement (parent wall to far wall),
  // so it belongs on the exterior. Use the parent room's side wall as the
  // baseline anchor to push the dim past the parent room's exterior wall.
  // Pick the side where the parent wall is closest to the extension center,
  // minimizing extension line length.
  const isParentHorizontal = dir === "north" || dir === "south";
  const sideDir = pickCloserSide(ext, isParentHorizontal, wallGraph);
  // Prefer parent room's side wall (pushes baseline past parent wall);
  // fall back to extension's own side wall if parent wall not found.
  const parentSideWall = wallGraph.byRoom.get(ext.parentRoomId)?.get(sideDir);
  const sideWall = parentSideWall ?? subWalls.get(sideDir);
  if (sideWall) {
    const sideIsHorizontal = sideDir === "north" || sideDir === "south";
    const sideSign = directionToSign(sideDir);
    const sidePerpCoord = sideIsHorizontal
      ? sideWall.outerEdge.start.y
      : sideWall.outerEdge.start.x;
    const sideBaseline = sidePerpCoord + sideSign * smallOffset;

    const depthLength = isParentHorizontal ? height : width;
    const depthStart = isParentHorizontal ? y : x;
    const depthEnd = depthStart + depthLength;
    const depthLabel = formatDimension(depthLength, units);
    const depthTextWidth = estimateTextWidth(depthLabel, fontSize);
    const depthTextFits = depthLength >= depthTextWidth + 2 * fontSize * 0.3;

    const depthSeg = makeSegment(
      depthStart, depthEnd, sideDir, sideBaseline,
      depthLabel, ext.id, depthTextFits, "room",
    );

    // Per-boundary wall-edge coords for extension lines:
    // - At depthStart (parent wall): nearest geometry is parent room's side wall
    // - At depthEnd (far wall): nearest geometry is extension's own side wall
    const extSideWall = subWalls.get(sideDir);
    const parentWallCoord = sidePerpCoord; // parent room's side wall outer edge
    const extWallCoord = extSideWall
      ? (sideIsHorizontal
          ? extSideWall.outerEdge.start.y
          : extSideWall.outerEdge.start.x)
      : parentWallCoord;

    // depthStart is the parent-wall side, depthEnd is the far-wall side.
    // For north/east extensions, far wall is at the end; for south/west at the start.
    const farAtEnd = dir === "north" || dir === "east";
    const extWallCoords = farAtEnd
      ? [parentWallCoord, extWallCoord]
      : [extWallCoord, parentWallCoord];

    chains.push({
      id: `ext-${ext.id}-d-${chainIndex.value++}`,
      segments: [depthSeg],
      orientation: sideIsHorizontal ? "horizontal" : "vertical",
      direction: sideDir,
      lane: 0,
      offset: sideBaseline - sidePerpCoord,
      extensionWallCoords: extWallCoords,
    });
  }

  return chains;
}

// ---- generateEnclosureDims ----

/**
 * Generate length and depth dimension chains for a single enclosure.
 * Length dim: perpendicular to facing direction (runs along the facing wall).
 * Depth dim: in facing direction (uses another exposed edge).
 */
function generateEnclosureDims(
  enc: ResolvedEnclosure,
  units: UnitSystem,
  wallGraph: WallGraph,
  chainIndex: { value: number },
): DimensionChain[] {
  const baseOffset =
    units === "imperial" ? DIMENSION_OFFSET_FT : DIMENSION_OFFSET_M;
  const smallOffset = baseOffset * 0.5;
  const fontSize = units === "imperial" ? FONT_SIZE_FT : FONT_SIZE_M;

  const subWalls = wallGraph.bySubSpace.get(enc.id);
  if (!subWalls) return [];

  const chains: DimensionChain[] = [];
  const { x, y, width, height } = enc.bounds;

  // --- Length dim (along the facing wall) ---
  const facingWall = subWalls.get(enc.facing);
  if (facingWall) {
    const facingDir = enc.facing;
    const isHorizontal = facingDir === "north" || facingDir === "south";
    const sign = directionToSign(facingDir);
    const perpCoord = isHorizontal
      ? facingWall.outerEdge.start.y
      : facingWall.outerEdge.start.x;
    const baseline = perpCoord + sign * smallOffset;

    // Length runs along the facing wall axis
    const dimLength = isHorizontal ? width : height;
    const dimStart = isHorizontal ? x : y;
    const dimEnd = dimStart + dimLength;
    const label = formatDimension(dimLength, units);
    const textWidth = estimateTextWidth(label, fontSize);
    const textFits = dimLength >= textWidth + 2 * fontSize * 0.3;

    const seg = makeSegment(
      dimStart, dimEnd, facingDir, baseline, label, enc.id, textFits, "room",
    );
    chains.push({
      id: `enc-${enc.id}-l-${chainIndex.value++}`,
      segments: [seg],
      orientation: isHorizontal ? "horizontal" : "vertical",
      direction: facingDir,
      lane: 0,
      offset: baseline - perpCoord,
    });
  }

  // --- Depth dim (perpendicular to facing, along another exposed edge) ---
  // Pick the other exposed edge: for an east-facing enclosure, try south then north
  const isFacingHorizontal = enc.facing === "north" || enc.facing === "south";
  const depthCandidates: CardinalDirection[] = isFacingHorizontal
    ? ["east", "west"]
    : ["south", "north"];

  for (const depthDir of depthCandidates) {
    const depthWall = subWalls.get(depthDir);
    if (!depthWall) continue;

    const depthIsHorizontal = depthDir === "north" || depthDir === "south";
    const depthSign = directionToSign(depthDir);
    const depthPerpCoord = depthIsHorizontal
      ? depthWall.outerEdge.start.y
      : depthWall.outerEdge.start.x;
    const depthBaseline = depthPerpCoord + depthSign * smallOffset;

    // Depth runs perpendicular to the facing wall
    const depthLength = isFacingHorizontal ? height : width;
    const depthStart = isFacingHorizontal ? y : x;
    const depthEnd = depthStart + depthLength;
    const depthLabel = formatDimension(depthLength, units);
    const depthTextWidth = estimateTextWidth(depthLabel, fontSize);
    const depthTextFits = depthLength >= depthTextWidth + 2 * fontSize * 0.3;

    const depthSeg = makeSegment(
      depthStart, depthEnd, depthDir, depthBaseline,
      depthLabel, enc.id, depthTextFits, "room",
    );
    chains.push({
      id: `enc-${enc.id}-d-${chainIndex.value++}`,
      segments: [depthSeg],
      orientation: depthIsHorizontal ? "horizontal" : "vertical",
      direction: depthDir,
      lane: 0,
      offset: depthBaseline - depthPerpCoord,
    });
    break; // Use only first available side
  }

  return chains;
}

// ---- generateSubSpaceDimensions ----

/**
 * Generate dimension chains for all extensions and enclosures across all rooms.
 * Checks coverage to avoid duplicates with existing chains.
 */
export function generateSubSpaceDimensions(
  rooms: ResolvedRoom[],
  units: UnitSystem,
  wallGraph: WallGraph,
  existingChains: DimensionChain[],
): DimensionChain[] {
  // Build coverage set from existing chains
  const covered = new Set<string>();
  for (const chain of existingChains) {
    for (const seg of chain.segments) {
      if (seg.roomId && seg.segmentType !== "wall") {
        covered.add(`${seg.roomId}:${chain.orientation}`);
      }
    }
  }

  const chains: DimensionChain[] = [];
  const chainIndex = { value: 0 };

  for (const room of rooms) {
    if (room.extensions) {
      for (const ext of room.extensions) {
        const extChains = generateExtensionDims(ext, units, wallGraph, chainIndex);
        for (const c of extChains) {
          const key = `${c.segments[0]?.roomId}:${c.orientation}`;
          if (!covered.has(key)) {
            chains.push(c);
            covered.add(key);
          }
        }
      }
    }
    if (room.enclosures) {
      for (const enc of room.enclosures) {
        const encChains = generateEnclosureDims(enc, units, wallGraph, chainIndex);
        for (const c of encChains) {
          const key = `${c.segments[0]?.roomId}:${c.orientation}`;
          if (!covered.has(key)) {
            chains.push(c);
            covered.add(key);
          }
        }
      }
    }
  }

  return chains;
}

// ---- generateDimensions (T019, T036) ----

/**
 * Auto-generate dimension chains for a resolved plan.
 * Uses wallGraph perimeter for building-edge chain dimensions,
 * then generates single-segment chains for uncovered room edges,
 * then generates sub-space (extension/enclosure) dimensions.
 */
export function generateDimensions(
  rooms: ResolvedRoom[],
  units: UnitSystem,
  wallGraph: WallGraph,
): DimensionChain[] {
  // Extract building edges from perimeter
  const edgeGroups = extractBuildingEdges(wallGraph.perimeter, wallGraph, rooms);

  // R1: Remove redundant room dimensions across opposite sides
  deduplicateAcrossDirections(edgeGroups);

  // Build chain dimensions (lane 0 + lane 1), passing rooms for extension baseline push
  const chains = buildChainDimensions(edgeGroups, units, wallGraph, rooms);

  // Generate single-segment chains for room edges not covered by perimeter chains
  const uncovered = generateUncoveredDimensions(rooms, units, chains);

  const allChains = [...chains, ...uncovered];

  // Generate sub-space (extension/enclosure) dimensions
  const subSpaceChains = generateSubSpaceDimensions(
    rooms, units, wallGraph, allChains,
  );

  return [...allChains, ...subSpaceChains];
}
