import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFigmaResponse } from "../src/services/simplify-node-response.js";

// 加载.env配置
config();

// 获取当前文件的目录
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 确保输出目录存在
const outputDir = path.join(__dirname, "test-output");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 保存数据到文件
function saveData(filename: string, data: unknown): void {
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`已保存数据到: ${filePath}`);
}

// 加载本地 JSON 数据
function loadLocalData(filename: string): unknown {
  const filePath = path.join(outputDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

// 从真实的 Figma API 获取数据
async function fetchFigmaData(fileKey: string, nodeId?: string): Promise<unknown> {
  const figmaApiKey = process.env.FIGMA_API_KEY;

  if (!figmaApiKey) {
    throw new Error("FIGMA_API_KEY未设置");
  }

  const baseUrl = "https://api.figma.com/v1";
  let endpoint: string;

  if (nodeId) {
    endpoint = `/files/${fileKey}/nodes?ids=${nodeId}`;
  } else {
    endpoint = `/files/${fileKey}`;
  }

  console.log(`请求Figma API: ${baseUrl}${endpoint}`);

  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      "X-Figma-Token": figmaApiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// 使用本地数据测试简化逻辑
function testWithLocalData(): void {
  console.log("使用本地数据测试简化逻辑...\n");

  // 加载已保存的原始数据
  const realNodeData = loadLocalData("real-node-data.json");
  console.log("✓ 已加载本地原始数据: real-node-data.json");

  // 使用 parseFigmaResponse 进行简化
  const simplifiedData = parseFigmaResponse(
    realNodeData as Parameters<typeof parseFigmaResponse>[0],
  );
  saveData("simplified-node-data.json", simplifiedData);
  console.log("✓ 简化后的数据已保存");

  // 打印统计信息
  printStats(realNodeData, simplifiedData);
}

// 使用 API 获取数据并测试
async function testWithApi(): Promise<void> {
  console.log("使用 Figma API 测试简化逻辑...\n");

  const fileKey = process.env.TEST_FIGMA_FILE_KEY;
  const nodeId = process.env.TEST_FIGMA_NODE_ID;

  if (!fileKey || !nodeId) {
    console.error("错误: 未设置 TEST_FIGMA_FILE_KEY 或 TEST_FIGMA_NODE_ID 环境变量");
    process.exit(1);
  }

  console.log(`文件 Key: ${fileKey}`);
  console.log(`节点 ID: ${nodeId}\n`);

  // 获取数据
  const realNodeData = await fetchFigmaData(fileKey, nodeId);
  saveData("real-node-data.json", realNodeData);
  console.log("✓ 原始数据已保存");

  // 简化数据
  const simplifiedData = parseFigmaResponse(
    realNodeData as Parameters<typeof parseFigmaResponse>[0],
  );
  saveData("simplified-node-data.json", simplifiedData);
  console.log("✓ 简化后的数据已保存");

  // 打印统计信息
  printStats(realNodeData, simplifiedData);
}

// 打印统计信息
function printStats(
  originalData: unknown,
  simplifiedData: { nodes?: Array<{ name: string; type: string; children?: unknown[] }> },
): void {
  console.log("\n" + "=".repeat(60));
  console.log("简化结果统计");
  console.log("=".repeat(60));

  // 计算大小
  const originalSize = Buffer.byteLength(JSON.stringify(originalData));
  const simplifiedSize = Buffer.byteLength(JSON.stringify(simplifiedData));
  const compressionRate = (((originalSize - simplifiedSize) / originalSize) * 100).toFixed(2);

  console.log(`\n原始数据大小: ${(originalSize / 1024).toFixed(2)} KB`);
  console.log(`简化后大小: ${(simplifiedSize / 1024).toFixed(2)} KB`);
  console.log(`压缩率: ${compressionRate}%`);

  // 节点信息
  if (simplifiedData.nodes && simplifiedData.nodes.length > 0) {
    const mainNode = simplifiedData.nodes[0];
    console.log("\n主节点信息:");
    console.log(`  名称: ${mainNode.name}`);
    console.log(`  类型: ${mainNode.type}`);

    if (mainNode.children) {
      console.log(`  子节点数量: ${mainNode.children.length}`);
    }

    // 统计节点类型
    const typeCount: Record<string, number> = {};
    countNodeTypes(simplifiedData.nodes, typeCount);

    console.log("\n节点类型分布:");
    for (const [type, count] of Object.entries(typeCount).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("测试完成!");
  console.log("=".repeat(60));
}

// 递归统计节点类型
function countNodeTypes(
  nodes: Array<{ type: string; children?: unknown[] }>,
  counts: Record<string, number>,
): void {
  for (const node of nodes) {
    counts[node.type] = (counts[node.type] || 0) + 1;
    if (node.children && Array.isArray(node.children)) {
      countNodeTypes(node.children as Array<{ type: string; children?: unknown[] }>, counts);
    }
  }
}

// 主函数
async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Figma 数据简化测试");
  console.log("=".repeat(60) + "\n");

  const useLocal = process.argv.includes("--local") || !process.env.FIGMA_API_KEY;

  if (useLocal) {
    // 检查本地数据是否存在
    const localDataPath = path.join(outputDir, "real-node-data.json");
    if (!fs.existsSync(localDataPath)) {
      console.error("错误: 本地数据文件不存在");
      console.error("请先使用 API 模式运行以获取测试数据，或设置以下环境变量:");
      console.error("  - FIGMA_API_KEY");
      console.error("  - TEST_FIGMA_FILE_KEY");
      console.error("  - TEST_FIGMA_NODE_ID");
      process.exit(1);
    }
    testWithLocalData();
  } else {
    await testWithApi();
  }
}

// 执行
main().catch(console.error);
