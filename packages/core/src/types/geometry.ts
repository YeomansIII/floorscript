import type {
  CardinalDirection,
  DetectorType,
  DoorStyle,
  LayersConfig,
  LightFixtureType,
  OpeningType,
  OutletType,
  PlumbingFixtureType,
  ProjectConfig,
  SupplyType,
  SwitchType,
  SwingDirection,
  UnitSystem,
  ValveType,
  WallComposition,
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
  wallGraph?: WallGraph;
  validation?: ValidationResult;
  electrical?: ResolvedElectrical;
  plumbing?: ResolvedPlumbing;
  layers?: LayersConfig;
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
  /** Distance from rect start to room interior edge along wall axis (for corner extensions) */
  interiorStartOffset: number;
}

export interface ResolvedOpening {
  type: OpeningType;
  position: Point;
  width: number;
  wallDirection: CardinalDirection;
  wallThickness: number;
  ownerRoomId?: string;
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

// ---- Plan-level wall graph ----

export interface PlanWall {
  id: string;
  roomA: string | null;
  roomB: string | null;
  directionInA: CardinalDirection | null;
  directionInB: CardinalDirection | null;
  type: WallType;
  composition: WallComposition;
  thickness: number;
  lineWeight: number;
  centerline: LineSegment;
  outerEdge: LineSegment;
  innerEdge: LineSegment;
  rect: Rect;
  openings: ResolvedOpening[];
  segments: Rect[];
  shared: boolean;
}

export interface WallGraph {
  walls: PlanWall[];
  byRoom: Map<string, Map<CardinalDirection, PlanWall>>;
}

// ---- Validation ----

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  roomId: string | null;
  wallId: string | null;
  elementId: string | null;
  suggestion: string | null;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// ---- Electrical resolved geometry ----

export interface ResolvedElectricalPanel {
  position: Point;
  amps: number;
  label?: string;
}

export interface ResolvedOutlet {
  id?: string;
  outletType: OutletType;
  position: Point;
  wallId: string;
  wallDirection: CardinalDirection;
  wallThickness: number;
  circuit?: number;
  label?: string;
}

export interface ResolvedSwitch {
  id?: string;
  switchType: SwitchType;
  position: Point;
  wallId: string;
  wallDirection: CardinalDirection;
  wallThickness: number;
  controls?: string[];
  circuit?: number;
}

export interface ResolvedLightFixture {
  id?: string;
  fixtureType: LightFixtureType;
  position: Point;
  width?: number;
  circuit?: number;
}

export interface ResolvedSmokeDetector {
  position: Point;
  detectorType: DetectorType;
}

export interface ResolvedElectricalRun {
  circuit: number;
  path: Point[];
  style: "solid" | "dashed";
}

export interface ResolvedElectrical {
  panel?: ResolvedElectricalPanel;
  outlets: ResolvedOutlet[];
  switches: ResolvedSwitch[];
  fixtures: ResolvedLightFixture[];
  smokeDetectors: ResolvedSmokeDetector[];
  runs: ResolvedElectricalRun[];
}

// ---- Plumbing resolved geometry ----

export interface ResolvedPlumbingFixture {
  id?: string;
  fixtureType: PlumbingFixtureType;
  position: Point;
  width?: number;
  depth?: number;
  supply?: SupplyType[];
  drain?: boolean;
}

export interface ResolvedSupplyRun {
  supplyType: SupplyType;
  path: Point[];
  size?: string;
}

export interface ResolvedDrainRun {
  path: Point[];
  size?: string;
  slope?: string;
}

export interface ResolvedValve {
  valveType: ValveType;
  position: Point;
  line?: SupplyType;
}

export interface ResolvedWaterHeater {
  position: Point;
  heaterType: "tank" | "tankless";
  capacity?: string;
}

export interface ResolvedPlumbing {
  fixtures: ResolvedPlumbingFixture[];
  supplyRuns: ResolvedSupplyRun[];
  drainRuns: ResolvedDrainRun[];
  valves: ResolvedValve[];
  waterHeater?: ResolvedWaterHeater;
}
