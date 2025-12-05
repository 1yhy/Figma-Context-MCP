/**
 * 缓存功能测试
 * 测试文件缓存是否正常工作
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { FigmaService } from "../src/services/figma.js";
import { cacheManager } from "../src/services/cache.js";

async function main() {
  const apiKey = process.env.FIGMA_API_KEY;
  const fileKey = process.env.TEST_FIGMA_FILE_KEY;
  const nodeId = process.env.TEST_FIGMA_NODE_ID;

  if (!apiKey || !fileKey || !nodeId) {
    console.error("请在 .env 中配置 FIGMA_API_KEY, TEST_FIGMA_FILE_KEY, TEST_FIGMA_NODE_ID");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("缓存功能测试");
  console.log("=".repeat(60));
  console.log();

  const figmaService = new FigmaService(apiKey);

  // 查看初始缓存状态
  console.log("--- 初始缓存状态 ---");
  const initialStats = cacheManager.getCacheStats();
  console.log(`缓存启用: ${initialStats.enabled}`);
  console.log(`缓存目录: ${initialStats.cacheDir}`);
  console.log(`数据缓存数: ${initialStats.dataCount}`);
  console.log(`图片缓存数: ${initialStats.imageCount}`);
  console.log(`总大小: ${(initialStats.totalSize / 1024).toFixed(2)} KB`);
  console.log();

  // 第一次请求（应该调用 API）
  console.log("--- 第一次请求 (从 API 获取) ---");
  const start1 = Date.now();
  const result1 = await figmaService.getNode(fileKey, nodeId, 2);
  const time1 = Date.now() - start1;
  console.log(`节点名称: ${result1.name}`);
  console.log(`节点数量: ${result1.nodes.length}`);
  console.log(`耗时: ${time1}ms`);
  console.log();

  // 查看缓存状态
  console.log("--- 第一次请求后缓存状态 ---");
  const stats1 = cacheManager.getCacheStats();
  console.log(`数据缓存数: ${stats1.dataCount}`);
  console.log(`图片缓存数: ${stats1.imageCount}`);
  console.log(`总大小: ${(stats1.totalSize / 1024).toFixed(2)} KB`);
  console.log();

  // 第二次请求（应该从缓存读取）
  console.log("--- 第二次请求 (从缓存获取) ---");
  const start2 = Date.now();
  const result2 = await figmaService.getNode(fileKey, nodeId, 2);
  const time2 = Date.now() - start2;
  console.log(`节点名称: ${result2.name}`);
  console.log(`节点数量: ${result2.nodes.length}`);
  console.log(`耗时: ${time2}ms`);
  console.log();

  // 性能对比
  console.log("--- 性能对比 ---");
  console.log(`第一次请求 (API): ${time1}ms`);
  console.log(`第二次请求 (缓存): ${time2}ms`);
  const speedup = time1 / time2;
  console.log(`加速比: ${speedup.toFixed(1)}x`);
  console.log();

  // 缓存验证
  const cacheWorking = time2 < time1 / 2; // 缓存应该比 API 快很多
  console.log("--- 测试结果 ---");
  if (cacheWorking) {
    console.log("✅ 缓存功能正常工作！");
  } else {
    console.log("⚠️ 缓存可能未正常工作，第二次请求应该更快");
  }

  // 最终缓存统计
  console.log();
  console.log("--- 最终缓存统计 ---");
  const finalStats = cacheManager.getCacheStats();
  console.log(`数据缓存数: ${finalStats.dataCount}`);
  console.log(`图片缓存数: ${finalStats.imageCount}`);
  console.log(`总大小: ${(finalStats.totalSize / 1024).toFixed(2)} KB`);
}

main().catch(console.error);
