/**
 * 运行简化流程并保存结果
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parseFigmaResponse } from "../src/services/simplify-node-response.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testOutputDir = path.join(__dirname, "test-output");

const originalPath = path.join(testOutputDir, "real-node-data.json");
const outputPath = path.join(testOutputDir, "new-simplified-data.json");

async function main() {
  console.log("读取原始数据...");
  const originalData = JSON.parse(fs.readFileSync(originalPath, "utf-8"));

  console.log("运行简化流程...");
  const simplified = parseFigmaResponse(originalData);

  console.log("保存结果...");
  fs.writeFileSync(outputPath, JSON.stringify(simplified, null, 2));

  console.log("完成！输出文件:", outputPath);
  console.log("原始大小:", fs.statSync(originalPath).size, "bytes");
  console.log("简化大小:", fs.statSync(outputPath).size, "bytes");
}

main().catch(console.error);
