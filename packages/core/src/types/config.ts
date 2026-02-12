import { z } from "zod";

// ---- Dimension types ----

export type Dimension = string | number;
export type DimensionTuple = [Dimension, Dimension];
export type UnitSystem = "imperial" | "metric";

// ---- Enums ----

export type CardinalDirection = "north" | "south" | "east" | "west";
export type WallType = "exterior" | "interior" | "load-bearing";
export type ElementStatus = "existing" | "demolish" | "new";
export type OpeningType = "door" | "window";

// Electrical enums
export type OutletType = "duplex" | "gfci" | "240v" | "dedicated" | "floor";
export type SwitchType = "single" | "three-way" | "four-way" | "dimmer";
export type LightFixtureType = "recessed" | "surface" | "pendant" | "under-cabinet" | "fan";
export type DetectorType = "smoke" | "co" | "combo";

// Plumbing enums
export type PlumbingFixtureType =
  | "kitchen-sink"
  | "bath-sink"
  | "toilet"
  | "shower"
  | "bathtub"
  | "dishwasher"
  | "washing-machine"
  | "water-heater"
  | "utility-sink"
  | "hose-bib";
export type ValveType = "shutoff" | "pressure-regulator" | "check";
export type SupplyType = "hot" | "cold";

export type DoorStyle =
  | "standard"
  | "double"
  | "sliding"
  | "pocket"
  | "bifold"
  | "barn"
  | "french"
  | "cased-opening";

export type SwingDirection =
  | "inward-left"
  | "inward-right"
  | "outward-left"
  | "outward-right";

// ---- Config interfaces ----

export interface FloorPlanConfig {
  version: string;
  project: ProjectConfig;
  units: UnitSystem;
  plans: PlanConfig[];
  definitions?: DefinitionsConfig;
  diffs?: DiffConfig[];
}

export interface ProjectConfig {
  title: string;
  address?: string;
  owner?: string;
  date?: string;
  sheet?: string;
  scale?: string;
}

export interface PlanConfig {
  id: string;
  title: string;
  rooms: RoomConfig[];
  elements?: ElementConfig[];
  layers?: LayersConfig;
  electrical?: ElectricalConfig;
  plumbing?: PlumbingConfig;
  fixtures?: FixtureConfig[];
  dimensions?: ManualDimensionConfig[];
  annotations?: AnnotationConfig[];
}

export interface RoomConfig {
  id: string;
  label: string;
  position?: DimensionTuple;
  adjacent_to?: AdjacencyConfig;
  width: Dimension;
  height: Dimension;
  walls?: WallsConfig;
}

export interface AdjacencyConfig {
  room: string;
  wall: CardinalDirection;
  alignment?: "start" | "center" | "end";
  offset?: Dimension;
}

export interface WallsConfig {
  north?: WallConfig;
  south?: WallConfig;
  east?: WallConfig;
  west?: WallConfig;
}

export interface WallConfig {
  type: WallType;
  thickness?: Dimension;
  openings?: OpeningConfig[];
  status?: ElementStatus;
}

export interface OpeningConfig {
  type: OpeningType;
  position: Dimension;
  width: Dimension;
  style?: DoorStyle;
  swing?: SwingDirection;
  sill_height?: Dimension;
  status?: ElementStatus;
}

// ---- Generic element config ----

export interface ElementConfig {
  type: string;
  [key: string]: unknown;
}

// ---- Layer config ----

export interface LayersConfig {
  [layerName: string]: {
    visible: boolean;
    color_override?: string | null;
  };
}

// ---- Electrical config ----

export interface ElectricalPanelConfig {
  position: DimensionTuple;
  amps: number;
  label?: string;
}

export interface OutletConfig {
  id?: string;
  type: OutletType;
  position: DimensionTuple;
  wall: string;
  height?: Dimension;
  circuit?: number;
  label?: string;
  status?: ElementStatus;
}

export interface SwitchConfig {
  id?: string;
  type: SwitchType;
  position: DimensionTuple;
  wall: string;
  controls?: string[];
  circuit?: number;
  status?: ElementStatus;
}

export interface ElectricalFixtureConfig {
  id?: string;
  type: LightFixtureType;
  position: DimensionTuple;
  width?: Dimension;
  circuit?: number;
  status?: ElementStatus;
}

export interface SmokeDetectorConfig {
  position: DimensionTuple;
  type: DetectorType;
}

export interface ElectricalRunConfig {
  circuit: number;
  path: DimensionTuple[];
  style?: "solid" | "dashed";
}

export interface ElectricalConfig {
  panel?: ElectricalPanelConfig;
  outlets?: OutletConfig[];
  switches?: SwitchConfig[];
  fixtures?: ElectricalFixtureConfig[];
  smoke_detectors?: SmokeDetectorConfig[];
  runs?: ElectricalRunConfig[];
}

// ---- Plumbing config ----

export interface PlumbingFixtureConfig {
  id?: string;
  type: PlumbingFixtureType;
  position: DimensionTuple;
  width?: Dimension;
  depth?: Dimension;
  supply?: SupplyType[];
  drain?: boolean;
  status?: ElementStatus;
}

export interface SupplyRunConfig {
  type: SupplyType;
  path: DimensionTuple[];
  size?: string;
}

export interface DrainRunConfig {
  path: DimensionTuple[];
  size?: string;
  slope?: string;
}

export interface ValveConfig {
  type: ValveType;
  position: DimensionTuple;
  line?: SupplyType;
}

export interface WaterHeaterConfig {
  position: DimensionTuple;
  type: "tank" | "tankless";
  capacity?: string;
}

export interface PlumbingConfig {
  fixtures?: PlumbingFixtureConfig[];
  supply_runs?: SupplyRunConfig[];
  drain_runs?: DrainRunConfig[];
  valves?: ValveConfig[];
  water_heater?: WaterHeaterConfig;
}

export interface FixtureConfig {
  id?: string;
  type: string;
  position?: DimensionTuple | Dimension;
  width?: Dimension;
  depth?: Dimension;
  outline?: DimensionTuple[];
  status?: ElementStatus;
}

export interface ManualDimensionConfig {
  from?: DimensionTuple;
  to?: DimensionTuple;
  offset?: Dimension;
  label?: string;
  chain?: {
    baseline_y?: Dimension;
    points?: Dimension[];
  };
}

export interface AnnotationConfig {
  type: "text" | "leader" | "section-cut";
  position?: DimensionTuple;
  text?: string;
  font_size?: number;
  from?: DimensionTuple;
  to?: DimensionTuple;
  start?: DimensionTuple;
  end?: DimensionTuple;
  label?: string;
  direction?: CardinalDirection;
}

export interface DefinitionsConfig {
  components?: Record<string, { elements: unknown[] }>;
  materials?: Record<string, unknown>;
}

export interface DiffConfig {
  before: string;
  after: string;
  title?: string;
  outputs?: string[];
}

// ---- Zod schemas for runtime validation ----

const DimensionSchema = z.union([z.string(), z.number()]);
const DimensionTupleSchema = z.tuple([DimensionSchema, DimensionSchema]);
const ElementStatusSchema = z.enum(["existing", "demolish", "new"]);

const OpeningSchema = z.object({
  type: z.enum(["door", "window"]),
  position: DimensionSchema,
  width: DimensionSchema,
  style: z
    .enum([
      "standard",
      "double",
      "sliding",
      "pocket",
      "bifold",
      "barn",
      "french",
      "cased-opening",
    ])
    .optional(),
  swing: z
    .enum(["inward-left", "inward-right", "outward-left", "outward-right"])
    .optional(),
  sill_height: DimensionSchema.optional(),
  status: ElementStatusSchema.optional(),
});

const WallSchema = z.object({
  type: z.enum(["exterior", "interior", "load-bearing"]),
  thickness: DimensionSchema.optional(),
  openings: z.array(OpeningSchema).optional(),
  status: ElementStatusSchema.optional(),
});

const WallsSchema = z.object({
  north: WallSchema.optional(),
  south: WallSchema.optional(),
  east: WallSchema.optional(),
  west: WallSchema.optional(),
});

const AdjacencySchema = z.object({
  room: z.string(),
  wall: z.enum(["north", "south", "east", "west"]),
  alignment: z.enum(["start", "center", "end"]).optional(),
  offset: DimensionSchema.optional(),
});

const RoomSchema = z.object({
  id: z.string(),
  label: z.string(),
  position: DimensionTupleSchema.optional(),
  adjacent_to: AdjacencySchema.optional(),
  width: DimensionSchema,
  height: DimensionSchema,
  walls: WallsSchema.optional(),
});

const ProjectSchema = z.object({
  title: z.string(),
  address: z.string().optional(),
  owner: z.string().optional(),
  date: z.string().optional(),
  sheet: z.string().optional(),
  scale: z.string().optional(),
});

// ---- Electrical Zod schemas ----

const ElectricalPanelSchema = z.object({
  position: DimensionTupleSchema,
  amps: z.number(),
  label: z.string().optional(),
});

const OutletSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["duplex", "gfci", "240v", "dedicated", "floor"]),
  position: DimensionTupleSchema,
  wall: z.string(),
  height: DimensionSchema.optional(),
  circuit: z.number().optional(),
  label: z.string().optional(),
  status: ElementStatusSchema.optional(),
});

const SwitchSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["single", "three-way", "four-way", "dimmer"]),
  position: DimensionTupleSchema,
  wall: z.string(),
  controls: z.array(z.string()).optional(),
  circuit: z.number().optional(),
  status: ElementStatusSchema.optional(),
});

const ElectricalFixtureSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["recessed", "surface", "pendant", "under-cabinet", "fan"]),
  position: DimensionTupleSchema,
  width: DimensionSchema.optional(),
  circuit: z.number().optional(),
  status: ElementStatusSchema.optional(),
});

const SmokeDetectorSchema = z.object({
  position: DimensionTupleSchema,
  type: z.enum(["smoke", "co", "combo"]),
});

const ElectricalRunSchema = z.object({
  circuit: z.number(),
  path: z.array(DimensionTupleSchema),
  style: z.enum(["solid", "dashed"]).optional(),
});

const ElectricalSchema = z.object({
  panel: ElectricalPanelSchema.optional(),
  outlets: z.array(OutletSchema).optional(),
  switches: z.array(SwitchSchema).optional(),
  fixtures: z.array(ElectricalFixtureSchema).optional(),
  smoke_detectors: z.array(SmokeDetectorSchema).optional(),
  runs: z.array(ElectricalRunSchema).optional(),
});

// ---- Plumbing Zod schemas ----

const PlumbingFixtureSchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    "kitchen-sink",
    "bath-sink",
    "toilet",
    "shower",
    "bathtub",
    "dishwasher",
    "washing-machine",
    "water-heater",
    "utility-sink",
    "hose-bib",
  ]),
  position: DimensionTupleSchema,
  width: DimensionSchema.optional(),
  depth: DimensionSchema.optional(),
  supply: z.array(z.enum(["hot", "cold"])).optional(),
  drain: z.boolean().optional(),
  status: ElementStatusSchema.optional(),
});

const SupplyRunSchema = z.object({
  type: z.enum(["hot", "cold"]),
  path: z.array(DimensionTupleSchema),
  size: z.string().optional(),
});

const DrainRunSchema = z.object({
  path: z.array(DimensionTupleSchema),
  size: z.string().optional(),
  slope: z.string().optional(),
});

const ValveSchema = z.object({
  type: z.enum(["shutoff", "pressure-regulator", "check"]),
  position: DimensionTupleSchema,
  line: z.enum(["hot", "cold"]).optional(),
});

const WaterHeaterSchema = z.object({
  position: DimensionTupleSchema,
  type: z.enum(["tank", "tankless"]),
  capacity: z.string().optional(),
});

const PlumbingSchema = z.object({
  fixtures: z.array(PlumbingFixtureSchema).optional(),
  supply_runs: z.array(SupplyRunSchema).optional(),
  drain_runs: z.array(DrainRunSchema).optional(),
  valves: z.array(ValveSchema).optional(),
  water_heater: WaterHeaterSchema.optional(),
});

// ---- Layer Zod schema ----

const LayerSchema = z.object({
  visible: z.boolean(),
  color_override: z.string().nullable().optional(),
});

const LayersSchema = z.record(z.string(), LayerSchema);

// ---- Plan and top-level schemas ----

const PlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  rooms: z.array(RoomSchema),
  elements: z.array(z.record(z.unknown())).optional(),
  layers: LayersSchema.optional(),
  electrical: ElectricalSchema.optional(),
  plumbing: PlumbingSchema.optional(),
  fixtures: z.array(z.record(z.unknown())).optional(),
  dimensions: z.array(z.record(z.unknown())).optional(),
  annotations: z.array(z.record(z.unknown())).optional(),
});

const DiffSchema = z.object({
  before: z.string(),
  after: z.string(),
  title: z.string().optional(),
  outputs: z.array(z.string()).optional(),
});

export const FloorPlanConfigSchema = z.object({
  version: z.string(),
  project: ProjectSchema,
  units: z.enum(["imperial", "metric"]),
  plans: z.array(PlanSchema),
  definitions: z.record(z.unknown()).optional(),
  diffs: z.array(DiffSchema).optional(),
});
