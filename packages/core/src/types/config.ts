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

// ---- Placeholder types for future phases ----

export interface ElementConfig {
  type: string;
  [key: string]: unknown;
}

export interface LayersConfig {
  [layerName: string]: {
    visible: boolean;
    color_override?: string | null;
  };
}

export interface ElectricalConfig {
  panel?: unknown;
  outlets?: unknown[];
  switches?: unknown[];
  fixtures?: unknown[];
  smoke_detectors?: unknown[];
  runs?: unknown[];
}

export interface PlumbingConfig {
  fixtures?: unknown[];
  supply_runs?: unknown[];
  drain_runs?: unknown[];
  valves?: unknown[];
  water_heater?: unknown;
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
  status: z.enum(["existing", "demolish", "new"]).optional(),
});

const WallSchema = z.object({
  type: z.enum(["exterior", "interior", "load-bearing"]),
  thickness: DimensionSchema.optional(),
  openings: z.array(OpeningSchema).optional(),
  status: z.enum(["existing", "demolish", "new"]).optional(),
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

const PlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  rooms: z.array(RoomSchema),
  elements: z.array(z.record(z.unknown())).optional(),
  layers: z.record(z.unknown()).optional(),
  electrical: z.record(z.unknown()).optional(),
  plumbing: z.record(z.unknown()).optional(),
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
