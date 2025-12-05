#!/usr/bin/env npx tsx
/**
 * Figma JSON Optimizer Script
 *
 * Usage:
 *   npx tsx scripts/optimize-figma-json.ts <input-file> [output-file]
 *
 * Examples:
 *   npx tsx scripts/optimize-figma-json.ts tests/fixtures/figma-data/node-108-517.json
 *   npx tsx scripts/optimize-figma-json.ts input.json output-optimized.json
 *
 * If output-file is not specified:
 *   - For files in figma-data/, outputs to expected/<name>-optimized.json
 *   - Otherwise, outputs to <input-name>-optimized.json in the same directory
 */

import fs from "fs";
import path from "path";
import { parseFigmaResponse } from "../src/core/parser.js";

// Parse arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
Figma JSON Optimizer

Usage:
  npx tsx scripts/optimize-figma-json.ts <input-file> [output-file]

Examples:
  npx tsx scripts/optimize-figma-json.ts tests/fixtures/figma-data/node-108-517.json
  npx tsx scripts/optimize-figma-json.ts input.json output-optimized.json

Options:
  --help, -h     Show this help message
  --stats        Show detailed statistics only (no file output)
  --quiet, -q    Minimal output
`);
  process.exit(0);
}

const inputFile = args[0];
const showStatsOnly = args.includes("--stats");
const quiet = args.includes("--quiet") || args.includes("-q");

// Determine output file
let outputFile = args.find((arg) => !arg.startsWith("-") && arg !== inputFile);

if (!outputFile && !showStatsOnly) {
  const inputDir = path.dirname(inputFile);
  const inputName = path.basename(inputFile, ".json");

  // If input is in figma-data, output to expected
  if (inputDir.includes("figma-data")) {
    const expectedDir = inputDir.replace("figma-data", "expected");
    outputFile = path.join(expectedDir, `${inputName}-optimized.json`);
  } else {
    outputFile = path.join(inputDir, `${inputName}-optimized.json`);
  }
}

// Check input file exists
if (!fs.existsSync(inputFile)) {
  console.error(`Error: Input file not found: ${inputFile}`);
  process.exit(1);
}

// Read and optimize
if (!quiet) {
  console.log(`\nOptimizing: ${inputFile}`);
}

const startTime = Date.now();
const rawData = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const optimized = parseFigmaResponse(rawData);
const elapsed = Date.now() - startTime;

// Calculate statistics
const json = JSON.stringify(optimized, null, 2);
const originalSize = fs.statSync(inputFile).size;
const optimizedSize = Buffer.byteLength(json);
const compression = ((1 - optimizedSize / originalSize) * 100).toFixed(1);

const absoluteCount = (json.match(/"position":\s*"absolute"/g) || []).length;
const gridCount = (json.match(/"display":\s*"grid"/g) || []).length;
const flexCount = (json.match(/"display":\s*"flex"/g) || []).length;
const flexRowCount = (json.match(/"flexDirection":\s*"row"/g) || []).length;
const flexColumnCount = (json.match(/"flexDirection":\s*"column"/g) || []).length;

// Get root node info
let rootInfo = "";
if (optimized.nodes && optimized.nodes.length > 0) {
  const root = optimized.nodes[0];
  rootInfo = `${root.name} (${root.cssStyles?.width} × ${root.cssStyles?.height})`;
}

// Output results
if (!quiet) {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Root: ${rootInfo}`);
  console.log(`${"─".repeat(50)}`);
  console.log(`\nLayout Statistics:`);
  console.log(`  position:absolute  ${absoluteCount}`);
  console.log(`  display:grid       ${gridCount}`);
  console.log(`  display:flex       ${flexCount} (row: ${flexRowCount}, column: ${flexColumnCount})`);
  console.log(`\nCompression:`);
  console.log(`  Original:  ${(originalSize / 1024).toFixed(1)} KB`);
  console.log(`  Optimized: ${(optimizedSize / 1024).toFixed(1)} KB`);
  console.log(`  Reduced:   ${compression}%`);
  console.log(`\nTime: ${elapsed}ms`);
}

// Save output
if (!showStatsOnly && outputFile) {
  // Ensure output directory exists
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputFile, json);

  if (!quiet) {
    console.log(`\nSaved: ${outputFile}`);
  } else {
    console.log(outputFile);
  }
}

if (!quiet) {
  console.log("");
}
