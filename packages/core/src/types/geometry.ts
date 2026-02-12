import type {
  CardinalDirection,
  DoorStyle,
  OpeningType,
  ProjectConfig,
  SwingDirection,
  UnitSystem,
  WallType,
} from "./config.js";

// ---- Primitive geometry ----

export interface Point {
  x: number;
  y: number;
}

export interface LineSegment {
  start: Point;
  end: Point;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---- Resolved plan (ready for rendering) ----

export interface ResolvedPlan {
  project: ProjectConfig;
  units: UnitSystem;
  title: string;
  rooms: ResolvedRoom[];
  dimensions: ResolvedDimension[];
  bounds: Rect;
}

export interface ResolvedRoom {
  id: string;
  label: string;
  bounds: Rect;
  labelPosition: Point;
  walls: ResolvedWall[];
}

export interface ResolvedWall {
  id: string;
  direction: CardinalDirection;
  type: WallType;
  thickness: number;
  lineWeight: number;
  outerEdge: LineSegment;
  innerEdge: LineSegment;
  rect: Rect;
  openings: ResolvedOpening[];
  segments: Rect[];
}

export interface ResolvedOpening {
  type: OpeningType;
  position: Point;
  width: number;
  wallDirection: CardinalDirection;
  wallThickness: number;
  style?: DoorStyle;
  swing?: SwingDirection;
  gapStart: Point;
  gapEnd: Point;
  centerline: LineSegment;
}

export interface ResolvedDimension {
  from: Point;
  to: Point;
  offset: number;
  label: string;
  orientation: "horizontal" | "vertical";
}
