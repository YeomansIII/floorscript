#!/usr/bin/env node
/**
 * Convert an SVG file to PNG using sharp.
 * Usage: node scripts/svg-to-png.mjs <input.svg> [output.png]
 */
import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const sharp = require("sharp");

import { readFile } from "fs/promises";
import { resolve } from "path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/svg-to-png.mjs <input.svg> [output.png]");
  process.exit(1);
}

const outputPath = process.argv[3] || inputPath.replace(/\.svg$/, ".png");
const svgBuffer = await readFile(resolve(inputPath));

await sharp(svgBuffer, { density: 150 })
  .png()
  .toFile(resolve(outputPath));

console.log(`Saved: ${outputPath}`);
