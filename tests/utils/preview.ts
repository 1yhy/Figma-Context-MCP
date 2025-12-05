/**
 * Generate simplified output and open viewer for comparison
 *
 * Usage: pnpm preview
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { parseFigmaResponse } from "../../src/services/simplify-node-response.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "../fixtures");

const originalPath = path.join(fixturesDir, "figma-data/real-node-data.json");
const outputPath = path.join(__dirname, "simplified-with-css.json");
const viewerPath = path.join(__dirname, "viewer.html");

async function main() {
  console.log("📖 Reading original Figma data...");
  const originalData = JSON.parse(fs.readFileSync(originalPath, "utf-8"));

  console.log("⚙️  Running simplification...");
  const simplified = parseFigmaResponse(originalData);

  console.log("💾 Saving output...");
  fs.writeFileSync(outputPath, JSON.stringify(simplified, null, 2));

  const originalSize = fs.statSync(originalPath).size;
  const simplifiedSize = fs.statSync(outputPath).size;
  const compressionRate = ((1 - simplifiedSize / originalSize) * 100).toFixed(1);

  console.log("");
  console.log("📊 Results:");
  console.log(`   Original:   ${(originalSize / 1024).toFixed(1)} KB`);
  console.log(`   Simplified: ${(simplifiedSize / 1024).toFixed(1)} KB`);
  console.log(`   Compression: ${compressionRate}%`);
  console.log("");

  // Open viewer in browser
  console.log("🌐 Opening viewer...");
  const openCommand =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

  exec(`${openCommand} "${viewerPath}"`, (error) => {
    if (error) {
      console.log(`   Viewer path: file://${viewerPath}`);
      console.log("   (Please open manually in browser)");
    } else {
      console.log("   Viewer opened in browser");
    }
  });
}

main().catch(console.error);
