#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";
import { FloorPlanConfigSchema } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "floorscript.schema.json");

const jsonSchema = z.toJSONSchema(FloorPlanConfigSchema, {
  target: "draft-2020-12",
});

// Add $id and title at top level
jsonSchema.$id = "https://floorscript.dev/schema/v1/floorscript.schema.json";
jsonSchema.title = "FloorScript Configuration";

writeFileSync(outPath, `${JSON.stringify(jsonSchema, null, 2)}\n`);

console.log(`Generated ${outPath}`);
