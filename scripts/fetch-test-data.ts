/**
 * 获取测试用的 Figma 节点数据并保存为 JSON 文件
 */
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";

config({ path: resolve(process.cwd(), ".env") });

const FIGMA_API_KEY = process.env.FIGMA_API_KEY!;
const FILE_KEY = "UgtwrncR3GokKDIS7dpm4Z";

const NODES_TO_FETCH = [
  { nodeId: "402-34955", name: "node-402-34955" },
  { nodeId: "240-32163", name: "node-240-32163" },
];

async function fetchFigmaNode(fileKey: string, nodeId: string) {
  const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`;

  const response = await fetch(url, {
    headers: {
      "X-Figma-Token": FIGMA_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Figma API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function main() {
  const outputDir = resolve(process.cwd(), "tests/fixtures/figma-data");
  mkdirSync(outputDir, { recursive: true });

  console.log("开始获取 Figma 数据...\n");

  for (const node of NODES_TO_FETCH) {
    console.log(`正在获取节点 ${node.nodeId}...`);

    try {
      const data = await fetchFigmaNode(FILE_KEY, node.nodeId);
      const outputPath = resolve(outputDir, `${node.name}.json`);

      writeFileSync(outputPath, JSON.stringify(data, null, 2));
      console.log(`✅ 已保存到: ${outputPath}\n`);
    } catch (error) {
      console.error(`❌ 获取节点 ${node.nodeId} 失败:`, error);
    }
  }

  console.log("完成!");
}

main();
