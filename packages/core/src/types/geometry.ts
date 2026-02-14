import type {
  CardinalDirection,
  CornerPosition,
  DetectorType,
  DoorStyle,
  FacingDirection,
  LayersConfig,
  LightFixtureType,
  OpeningType,
  OutletType,
  PlumbingFixtureType,
  ProjectConfig,
  SupplyType,
  SwingDirection,
  SwitchType,
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
  wallGraph: WallGraph;
  validation?: ValidationResult;
  electrical?: ResolvedElectrical;
  plumbing?: ResolvedPlumbing;
  layers?: LayersConfig;
}

export interface ResolvedEnclosure {
  id: string;
  label: string;
  parentRoomId: string;
  bounds: Rect;
  facing: CardinalDirection;
}

export interface ResolvedExtension {
  id: string;
  label: string;
  parentRoomId: string;
  bounds: Rect;
  parentWall: CardinalDirection;
}

export interface ResolvedRoom {
  id: string;
  label: string;
  bounds: Rect;
  labelPosition: Point;
  compositeOutline?: Point[];
  enclosures?: ResolvedEnclosure[];
  extensions?: ResolvedExtension[];
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

// ---- Unified wall type ----

export type WallSource = "parent" | "enclosure" | "extension";

export interface Wall {
  id: string;
  direction: CardinalDirection;
  type: WallType;
  thickness: number;
  lineWeight: number;
  outerEdge: LineSegment;
  innerEdge: LineSegment;
  centerline: LineSegment;
  rect: Rect;
  openings: ResolvedOpening[];
  segments: Rect[];
  /** Distance from rect start to room interior edge along wall axis (for corner extensions) */
  interiorStartOffset: number;
  composition: WallComposition;
  /** Parent room ID (roomA for shared walls) */
  roomId: string;
  /** Second room ID for shared walls, null otherwise */
  roomIdB: string | null;
  /** Direction from roomB perspective (shared walls only) */
  directionInB: CardinalDirection | null;
  /** Enclosure/extension ID, null for parent walls */
  subSpaceId: string | null;
  /** Origin: parent room wall, enclosure interior wall, or extension exterior wall */
  source: WallSource;
  /** Whether wall is shared between two rooms */
  shared: boolean;
}

// ---- Perimeter edges ----

export interface PerimeterEdge {
  start: Point;
  end: Point;
  wallId: string;
  direction: CardinalDirection;
}

export interface PerimeterChain {
  edges: PerimeterEdge[];
  bounds: Rect;
}

// ---- Plan-level wall graph ----

export interface WallGraph {
  walls: Wall[];
  byRoom: Map<string, Map<CardinalDirection, Wall>>;
  bySubSpace: Map<string, Map<CardinalDirection, Wall>>;
  perimeter: PerimeterChain[];
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
  orientation?: FacingDirection;
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
