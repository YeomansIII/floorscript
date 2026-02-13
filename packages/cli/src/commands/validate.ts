import { readFileSync } from "node:fs";
import { parseConfig, resolveLayout } from "@floorscript/core";

interface ValidateOptions {
  plan?: string;
}

export function validateCommand(input: string, options: ValidateOptions): void {
  try {
    const content = readFileSync(input, "utf-8");
    const config = parseConfig(content);
    const resolved = resolveLayout(config, options.plan);

    const validation = resolved.validation;
    if (!validation) {
      console.log("No validation results available.");
      return;
    }

    const { errors, warnings } = validation;

    if (errors.length === 0 && warnings.length === 0) {
      console.log("✓ Plan is valid. No issues found.");
      return;
    }

    if (errors.length > 0) {
      console.error(`\n${errors.length} error(s):`);
      for (const err of errors) {
        console.error(`  ✗ [${err.code}] ${err.message}`);
        if (err.suggestion) {
          console.error(`    → ${err.suggestion}`);
        }
      }
    }

    if (warnings.length > 0) {
      console.warn(`\n${warnings.length} warning(s):`);
      for (const warn of warnings) {
        console.warn(`  ⚠ [${warn.code}] ${warn.message}`);
        if (warn.suggestion) {
          console.warn(`    → ${warn.suggestion}`);
        }
      }
    }

    console.log(
      `\nSummary: ${errors.length} error(s), ${warnings.length} warning(s)`,
    );

    if (errors.length > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
