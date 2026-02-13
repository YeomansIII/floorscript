import { Command } from "commander";
import { renderCommand } from "./commands/render.js";
import { initCommand } from "./commands/init.js";
import { validateCommand } from "./commands/validate.js";

const program = new Command();

program
  .name("floorscript")
  .description("Generate architectural floor plans from config")
  .version("0.1.0");

program
  .command("render <input>")
  .description("Render a floor plan from a YAML/JSON config file")
  .option("-o, --output <file>", "Output file path (default: <input>.svg)")
  .option("--plan <id>", "Plan ID to render (default: first plan)")
  .option("--width <px>", "SVG width in pixels", "1200")
  .option("--no-dimensions", "Omit dimension lines")
  .option("--no-labels", "Omit room labels")
  .option("--no-title-block", "Omit title block")
  .action(renderCommand);

program
  .command("validate <input>")
  .description("Validate a floor plan config file for geometry errors")
  .option("--plan <id>", "Plan ID to validate (default: first plan)")
  .action(validateCommand);

program
  .command("init")
  .description("Generate a template floor plan config file")
  .option(
    "-t, --template <name>",
    "Template name (single-room, kitchen-reno)",
    "single-room",
  )
  .action(initCommand);

program.parse();
