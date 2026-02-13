import { z } from "zod";

// ---- Dimension types ----

export type Dimension = string | number;
export type DimensionTuple = [Dimension, Dimension];
export type UnitSystem = "imperial" | "metric";

// ---- Enums ----

export type CardinalDirection = "north" | "south" | "east" | "west";
export type WallType = "exterior" | "interior" | "load-bearing";
export type StudSize = "2x4" | "2x6" | "2x8";
export type FacingDirection =
  | "facing-north"
  | "facing-south"
  | "facing-east"
  | "facing-west";
export type ElementStatus = "existing" | "demolish" | "new";
export type OpeningType = "door" | "window";

// Electrical enums
export type OutletType = "duplex" | "gfci" | "240v" | "dedicated" | "floor";
export type SwitchType = "single" | "three-way" | "four-way" | "dimmer";
export type LightFixtureType =
  | "recessed"
  | "surface"
  | "pendant"
  | "under-cabinet"
  | "fan";
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

export type CornerPosition =
  | "northwest"
  | "northeast"
  | "southwest"
  | "southeast";

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

export interface SharedWallConfig {
  rooms: [string, string];
  wall: string;
  thickness?: Dimension;
  openings?: OpeningConfig[];
}

export interface PlanConfig {
  id: string;
  title: string;
  rooms: RoomConfig[];
  shared_walls?: SharedWallConfig[];
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
  extensions?: ExtensionConfig[];
  enclosures?: EnclosureConfig[];
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

export interface WallComposition {
  stud: StudSize | null;
  studWidthFt: number;
  finishA: number;
  finishB: number;
  totalThickness: number;
}

export interface WallConfig {
  type: WallType;
  thickness?: Dimension;
  stud?: StudSize;
  finish?: Dimension;
  openings?: OpeningConfig[];
  status?: ElementStatus;
}

export interface OpeningConfig {
  type: OpeningType;
  position?: Dimension | "center";
  from?: CardinalDirection;
  offset?: Dimension;
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
  position: DimensionTuple | Dimension;
  wall?: string;
  offset?: Dimension;
  orientation?: FacingDirection;
  width?: Dimension;
  depth?: Dimension;
  supply?: SupplyType[];
  drain?: boolean;
  status?: ElementStatus;
}

export interface SupplyRunConfig {
  type: SupplyType;
  path?: DimensionTuple[];
  from?: string | { wall: string; position: Dimension };
  to?: string | { wall: string; position: Dimension };
  size?: string;
}

export interface DrainRunConfig {
  path?: DimensionTuple[];
  from?: string | { wall: string; position: Dimension };
  to?: string | { wall: string; position: Dimension };
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

const DimensionSchema = z
  .union([z.string(), z.number()])
  .describe(
    "A dimension value: a string like '10ft 6in' or '3.2m', or a number in the plan's unit system",
  );
const DimensionTupleSchema = z
  .tuple([DimensionSchema, DimensionSchema])
  .describe("An [x, y] coordinate pair");
const ElementStatusSchema = z
  .enum(["existing", "demolish", "new"])
  .describe("Renovation status: existing (keep), demolish (remove), new (add)");

const CardinalDirectionSchema = z.enum(["north", "south", "east", "west"]);

const OpeningSchema = z
  .object({
    type: z.enum(["door", "window"]).describe("Opening type"),
    position: z
      .union([DimensionSchema, z.literal("center")])
      .describe("Offset along the wall, or 'center' to auto-center")
      .optional(),
    from: CardinalDirectionSchema.describe(
      "Reference wall to measure offset from",
    ).optional(),
    offset: DimensionSchema.describe(
      "Distance from reference wall to near edge of opening",
    ).optional(),
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
      .describe("Door style; ignored for windows")
      .optional(),
    swing: z
      .enum(["inward-left", "inward-right", "outward-left", "outward-right"])
      .describe("Door swing direction relative to the room")
      .optional(),
    sill_height: DimensionSchema.optional(),
    status: ElementStatusSchema.optional(),
  })
  .refine(
    (d) => d.position != null || (d.from != null && d.offset != null),
    {
      message:
        "Opening must specify either 'position' (or 'center') or both 'from' and 'offset'",
    },
  )
  .describe("A door or window opening placed on a wall");

const StudSizeSchema = z.enum(["2x4", "2x6", "2x8"]);

const WallSchema = z
  .object({
    type: z
      .enum(["exterior", "interior", "load-bearing"])
      .describe("Wall structural classification"),
    thickness: DimensionSchema.optional(),
    stud: StudSizeSchema.describe("Lumber stud size").optional(),
    finish: DimensionSchema.describe(
      "Finish thickness per side (e.g. drywall)",
    ).optional(),
    openings: z.array(OpeningSchema).optional(),
    status: ElementStatusSchema.optional(),
  })
  .describe("Configuration for a single wall segment");

const WallsSchema = z.object({
  north: WallSchema.optional(),
  south: WallSchema.optional(),
  east: WallSchema.optional(),
  west: WallSchema.optional(),
});

// ---- Enclosure & Extension Zod schemas ----

const CornerPositionSchema = z.enum([
  "northwest",
  "northeast",
  "southwest",
  "southeast",
]);

const EnclosureSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    corner: CornerPositionSchema.optional(),
    wall: CardinalDirectionSchema.optional(),
    facing: CardinalDirectionSchema.optional(),
    length: z
      .union([DimensionSchema, z.literal("full")])
      .describe("Along wall (corner) or wall span; 'full' for entire wall"),
    depth: DimensionSchema,
    from: CardinalDirectionSchema.optional(),
    offset: DimensionSchema.optional(),
    walls: WallsSchema.optional(),
  })
  .refine((d) => (d.corner != null) !== (d.wall != null), {
    message: "Enclosure must specify either 'corner' or 'wall', not both",
  });

export type EnclosureConfig = z.infer<typeof EnclosureSchema>;

const ExtensionSchema = z.object({
  id: z.string(),
  label: z.string(),
  wall: CardinalDirectionSchema,
  from: CardinalDirectionSchema,
  offset: DimensionSchema,
  width: DimensionSchema,
  depth: DimensionSchema,
  walls: WallsSchema.optional(),
});

export type ExtensionConfig = z.infer<typeof ExtensionSchema>;

const AdjacencySchema = z
  .object({
    room: z.string().describe("ID of the room to attach to"),
    wall: z
      .enum(["north", "south", "east", "west"])
      .describe("Which wall of the target room to attach to"),
    alignment: z.enum(["start", "center", "end"]).optional(),
    offset: DimensionSchema.optional(),
  })
  .describe("Place this room adjacent to another room's wall");

const RoomSchema = z
  .object({
    id: z
      .string()
      .describe(
        "Unique room identifier, referenced by adjacency and shared walls",
      ),
    label: z.string().describe("Display label rendered inside the room"),
    position: DimensionTupleSchema.describe(
      "Absolute [x, y] position; omit if using adjacent_to",
    ).optional(),
    adjacent_to: AdjacencySchema.optional(),
    width: DimensionSchema,
    height: DimensionSchema,
    walls: WallsSchema.optional(),
    extensions: z.array(ExtensionSchema).optional(),
    enclosures: z.array(EnclosureSchema).optional(),
  })
  .describe("A room with dimensions, position, and optional wall overrides");

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

const ElectricalSchema = z
  .object({
    panel: ElectricalPanelSchema.optional(),
    outlets: z.array(OutletSchema).optional(),
    switches: z.array(SwitchSchema).optional(),
    fixtures: z.array(ElectricalFixtureSchema).optional(),
    smoke_detectors: z.array(SmokeDetectorSchema).optional(),
    runs: z.array(ElectricalRunSchema).optional(),
  })
  .describe(
    "Electrical system: panel, outlets, switches, light fixtures, detectors, and circuit runs",
  );

// ---- Plumbing Zod schemas ----

const FacingDirectionSchema = z.enum([
  "facing-north",
  "facing-south",
  "facing-east",
  "facing-west",
]);

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
  position: z.union([DimensionTupleSchema, DimensionSchema]),
  wall: z.string().optional(),
  offset: DimensionSchema.optional(),
  orientation: FacingDirectionSchema.optional(),
  width: DimensionSchema.optional(),
  depth: DimensionSchema.optional(),
  supply: z.array(z.enum(["hot", "cold"])).optional(),
  drain: z.boolean().optional(),
  status: ElementStatusSchema.optional(),
});

const WallRefSchema = z.object({
  wall: z.string(),
  position: DimensionSchema,
});

const SupplyRunSchema = z.object({
  type: z.enum(["hot", "cold"]),
  path: z.array(DimensionTupleSchema).optional(),
  from: z.union([z.string(), WallRefSchema]).optional(),
  to: z.union([z.string(), WallRefSchema]).optional(),
  size: z.string().optional(),
});

const DrainRunSchema = z.object({
  path: z.array(DimensionTupleSchema).optional(),
  from: z.union([z.string(), WallRefSchema]).optional(),
  to: z.union([z.string(), WallRefSchema]).optional(),
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

const PlumbingSchema = z
  .object({
    fixtures: z.array(PlumbingFixtureSchema).optional(),
    supply_runs: z.array(SupplyRunSchema).optional(),
    drain_runs: z.array(DrainRunSchema).optional(),
    valves: z.array(ValveSchema).optional(),
    water_heater: WaterHeaterSchema.optional(),
  })
  .describe(
    "Plumbing system: fixtures, supply/drain runs, valves, and water heater",
  );

// ---- Layer Zod schema ----

const LayerSchema = z.object({
  visible: z.boolean(),
  color_override: z.string().nullable().optional(),
});

const LayersSchema = z.record(z.string(), LayerSchema);

// ---- Shared wall Zod schema ----

const SharedWallSchema = z
  .object({
    rooms: z
      .tuple([z.string(), z.string()])
      .describe("Pair of room IDs that share this wall"),
    wall: z
      .string()
      .describe("Wall identifier, e.g. 'room1.south' or cardinal direction"),
    thickness: DimensionSchema.optional(),
    openings: z.array(OpeningSchema).optional(),
  })
  .describe("A wall shared between two adjacent rooms, with optional openings");

// ---- Plan and top-level schemas ----

const PlanSchema = z
  .object({
    id: z.string().describe("Unique plan identifier, referenced by diffs"),
    title: z.string().describe("Plan title shown in the title block"),
    rooms: z.array(RoomSchema),
    shared_walls: z.array(SharedWallSchema).optional(),
    elements: z.array(z.record(z.string(), z.unknown())).optional(),
    layers: LayersSchema.optional(),
    electrical: ElectricalSchema.optional(),
    plumbing: PlumbingSchema.optional(),
    fixtures: z.array(z.record(z.string(), z.unknown())).optional(),
    dimensions: z.array(z.record(z.string(), z.unknown())).optional(),
    annotations: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .describe("A single floor plan containing rooms, systems, and annotations");

const DiffSchema = z.object({
  before: z.string(),
  after: z.string(),
  title: z.string().optional(),
  outputs: z.array(z.string()).optional(),
});

export const FloorPlanConfigSchema = z
  .object({
    version: z.string().describe("Schema version, currently '1.0'"),
    project: ProjectSchema,
    units: z
      .enum(["imperial", "metric"])
      .describe("Unit system for all dimensions in this file"),
    plans: z.array(PlanSchema),
    definitions: z.record(z.string(), z.unknown()).optional(),
    diffs: z.array(DiffSchema).optional(),
  })
  .describe(
    "FloorScript floor plan configuration — the top-level document schema",
  );
