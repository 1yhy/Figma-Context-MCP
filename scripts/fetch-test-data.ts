/**
 * 获取测试用的 Figma 节点数据并保存为 JSON 文件
 *
 * 使用方法:
 * 1. 复制 .env.example 到 .env
 * 2. 填入你的 FIGMA_API_KEY
 * 3. 运行: pnpm tsx scripts/fetch-test-data.ts [fileKey] [nodeId] [outputName]
 *
 * 示例:
 *   # 使用命令行参数
 *   pnpm tsx scripts/fetch-test-data.ts UgtwrncR3GokKDIS7dpm4Z 402-34955 my-design
 *
 *   # 使用环境变量
 *   TEST_FIGMA_FILE_KEY=xxx TEST_FIGMA_NODE_ID=yyy pnpm tsx scripts/fetch-test-data.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";

config({ path: resolve(process.cwd(), ".env") });

const FIGMA_API_KEY = process.env.FIGMA_API_KEY;

if (!FIGMA_API_KEY) {
  console.error("❌ 错误: 请在 .env 文件中设置 FIGMA_API_KEY");
  console.error("   复制 .env.example 到 .env 并填入你的 API Key");
  process.exit(1);
}

// 命令行参数优先，否则使用环境变量，最后使用默认值
const args = process.argv.slice(2);
const FILE_KEY = args[0] || process.env.TEST_FIGMA_FILE_KEY || "UgtwrncR3GokKDIS7dpm4Z";
const NODE_ID = args[1] || process.env.TEST_FIGMA_NODE_ID;
const OUTPUT_NAME = args[2] || `node-${NODE_ID?.replace(":", "-")}`;

// 默认测试节点（当没有指定时使用）
const DEFAULT_NODES = [
  { nodeId: "402-34955", name: "node-402-34955" },
  { nodeId: "240-32163", name: "node-240-32163" },
];

async function fetchFigmaNode(fileKey: string, nodeId: string) {
  const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`;

  const response = await fetch(url, {
    headers: {
      "X-Figma-Token": FIGMA_API_KEY!,
    },
  });

  if (!response.ok) {
    throw new Error(`Figma API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchAndSave(fileKey: string, nodeId: string, name: string, outputDir: string) {
  console.log(`正在获取节点 ${nodeId}...`);

  try {
    const data = await fetchFigmaNode(fileKey, nodeId);
    const outputPath = resolve(outputDir, `${name}.json`);

    writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`✅ 已保存到: ${outputPath}`);

    // 显示基本信息
    const nodeKey = Object.keys(data.nodes)[0];
    const doc = data.nodes[nodeKey]?.document;
    if (doc) {
      console.log(`   名称: ${doc.name}`);
      console.log(`   类型: ${doc.type}`);
      console.log(`   子节点数: ${doc.children?.length || 0}`);
    }
    console.log("");
  } catch (error) {
    console.error(`❌ 获取节点 ${nodeId} 失败:`, error);
  }
}

async function main() {
  const outputDir = resolve(process.cwd(), "tests/fixtures/figma-data");
  mkdirSync(outputDir, { recursive: true });

  console.log("📦 Figma 测试数据获取工具\n");
  console.log(`   File Key: ${FILE_KEY}`);
  console.log(`   输出目录: ${outputDir}\n`);

  if (NODE_ID) {
    // 获取指定的单个节点
    await fetchAndSave(FILE_KEY, NODE_ID, OUTPUT_NAME, outputDir);
  } else {
    // 获取默认的测试节点
    console.log("未指定节点 ID，获取默认测试节点...\n");
    for (const node of DEFAULT_NODES) {
      await fetchAndSave(FILE_KEY, node.nodeId, node.name, outputDir);
    }
  }

  console.log("✨ 完成!\n");
  console.log("下一步:");
  console.log("  1. 运行测试: pnpm test");
  console.log("  2. 查看优化输出: 检查 tests/fixtures/figma-data/ 目录");
}

main();
