import yaml from "js-yaml";
import type { FloorPlanConfig } from "../types/config.js";
import { FloorPlanConfigSchema } from "../types/config.js";

/**
 * Parse a JSON or YAML string into a validated FloorPlanConfig.
 * Detects format automatically (tries JSON first, then YAML).
 * Throws a descriptive error if the input is invalid.
 */
export function parseConfig(input: string): FloorPlanConfig {
  let raw: unknown;

  try {
    raw = JSON.parse(input);
  } catch {
    try {
      raw = yaml.load(input);
    } catch (yamlErr) {
      throw new Error(
        `Failed to parse input as JSON or YAML: ${yamlErr instanceof Error ? yamlErr.message : String(yamlErr)}`,
      );
    }
  }

  const result = FloorPlanConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid FloorScript config:\n${issues}`);
  }

  return result.data as FloorPlanConfig;
}
