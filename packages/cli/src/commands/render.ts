import { readFileSync, writeFileSync } from "node:fs";
import { parseConfig, resolveLayout } from "@floorscript/core";
import { renderSvg } from "@floorscript/render-svg";

interface RenderOptions {
  output?: string;
  plan?: string;
  width?: string;
  dimensions?: boolean;
  labels?: boolean;
  titleBlock?: boolean;
}

export function renderCommand(input: string, options: RenderOptions): void {
  try {
    const content = readFileSync(input, "utf-8");
    const config = parseConfig(content);
    const resolved = resolveLayout(config, options.plan);

    const svg = renderSvg(resolved, {
      width: parseInt(options.width ?? "1200", 10),
      showDimensions: options.dimensions !== false,
      showLabels: options.labels !== false,
      showTitleBlock: options.titleBlock !== false,
    });

    const outputPath =
      options.output ?? input.replace(/\.(ya?ml|json)$/i, ".svg");
    writeFileSync(outputPath, svg, "utf-8");
    console.log(`Rendered: ${outputPath}`);
  } catch (err) {
    console.error(
      `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
