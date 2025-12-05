/**
 * 图片下载功能测试
 * 测试从 Figma 下载图片并用于 UI 还原
 */

import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { FigmaService } from '../src/services/figma.js';
import { cacheManager } from '../src/services/cache.js';

interface SimplifiedNode {
  id: string;
  name: string;
  type: string;
  cssStyles?: Record<string, string | number>;
  text?: string;
  children?: SimplifiedNode[];
  exportInfo?: {
    type: string;
    format: string;
    fileName?: string;
  };
}

interface SimplifiedDesign {
  name: string;
  lastModified?: string;
  nodes: SimplifiedNode[];
}

/**
 * 递归收集需要导出为图片的节点
 */
function collectExportableNodes(
  node: SimplifiedNode,
  result: Array<{ nodeId: string; fileName: string; format: string }> = []
): Array<{ nodeId: string; fileName: string; format: string }> {
  // 检查是否有导出信息
  if (node.exportInfo) {
    const format = node.exportInfo.format?.toLowerCase() || 'png';
    const fileName = node.exportInfo.fileName || `${node.name.replace(/[^a-zA-Z0-9]/g, '_')}.${format}`;
    result.push({
      nodeId: node.id,
      fileName,
      format,
    });
  }

  // 检查是否是向量/图片类型
  if (node.type === 'VECTOR' || node.type === 'RECTANGLE' || node.type === 'ELLIPSE') {
    // 如果没有 children 且有特定样式，可能是图片
    if (!node.children && node.cssStyles?.backgroundImage) {
      const fileName = `${node.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      if (!result.some(r => r.nodeId === node.id)) {
        result.push({
          nodeId: node.id,
          fileName,
          format: 'png',
        });
      }
    }
  }

  // 递归处理子节点
  if (node.children) {
    for (const child of node.children) {
      collectExportableNodes(child, result);
    }
  }

  return result;
}

async function main() {
  const apiKey = process.env.FIGMA_API_KEY;
  const fileKey = process.env.TEST_FIGMA_FILE_KEY;
  const nodeId = process.env.TEST_FIGMA_NODE_ID;

  if (!apiKey || !fileKey || !nodeId) {
    console.error('请在 .env 中配置 FIGMA_API_KEY, TEST_FIGMA_FILE_KEY, TEST_FIGMA_NODE_ID');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('图片下载功能测试');
  console.log('='.repeat(60));
  console.log();

  const figmaService = new FigmaService(apiKey);
  const outputDir = path.join(__dirname, 'test-output', 'images');

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. 获取简化后的节点数据
  console.log('--- 获取节点数据 ---');
  const design = await figmaService.getNode(fileKey, nodeId, 10);
  console.log(`节点名称: ${design.name}`);
  console.log(`节点数量: ${design.nodes.length}`);
  console.log();

  // 2. 收集可导出的节点
  console.log('--- 分析可导出节点 ---');
  const exportableNodes: Array<{ nodeId: string; fileName: string; format: string }> = [];
  for (const node of design.nodes) {
    collectExportableNodes(node, exportableNodes);
  }
  console.log(`找到 ${exportableNodes.length} 个可导出节点`);

  if (exportableNodes.length === 0) {
    // 如果没有找到可导出节点，手动添加一些测试节点
    console.log('未找到标记为导出的节点，尝试导出根节点和子节点...');

    // 获取前 5 个有效节点进行测试
    const testNodes: Array<{ nodeId: string; fileName: string; format: string }> = [];

    function findTestNodes(node: SimplifiedNode, depth: number = 0) {
      if (testNodes.length >= 5) return;

      if (node.type !== 'TEXT' && node.cssStyles?.width && node.cssStyles?.height) {
        testNodes.push({
          nodeId: node.id,
          fileName: `test_${node.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
          format: 'png',
        });
      }

      if (node.children && depth < 3) {
        for (const child of node.children) {
          findTestNodes(child, depth + 1);
        }
      }
    }

    for (const node of design.nodes) {
      findTestNodes(node);
    }

    exportableNodes.push(...testNodes);
    console.log(`选择了 ${exportableNodes.length} 个节点进行测试导出`);
  }

  exportableNodes.forEach((node, i) => {
    console.log(`  ${i + 1}. ${node.fileName} (${node.nodeId})`);
  });
  console.log();

  // 3. 下载图片
  if (exportableNodes.length > 0) {
    console.log('--- 下载图片 ---');
    const start = Date.now();

    try {
      const downloadParams = exportableNodes.map(node => ({
        nodeId: node.nodeId,
        fileName: node.fileName,
        fileType: node.format as 'png' | 'svg',
      }));

      const results = await figmaService.getImages(fileKey, downloadParams, outputDir);

      const time = Date.now() - start;
      const successCount = results.filter(r => r !== '').length;

      console.log(`下载完成: ${successCount}/${exportableNodes.length} 个图片`);
      console.log(`耗时: ${time}ms`);
      console.log();

      // 列出下载的文件
      console.log('--- 下载的文件 ---');
      results.forEach((filePath, i) => {
        if (filePath) {
          const stats = fs.statSync(filePath);
          console.log(`  ✅ ${exportableNodes[i].fileName} (${(stats.size / 1024).toFixed(2)} KB)`);
        } else {
          console.log(`  ❌ ${exportableNodes[i].fileName} (下载失败)`);
        }
      });
      console.log();

      // 检查缓存状态
      console.log('--- 图片缓存状态 ---');
      const cacheStats = cacheManager.getCacheStats();
      console.log(`图片缓存数: ${cacheStats.imageCount}`);
      console.log(`总缓存大小: ${(cacheStats.totalSize / 1024).toFixed(2)} KB`);
      console.log();

      // 测试缓存是否工作（再次下载应该更快）
      console.log('--- 测试图片缓存 ---');
      const start2 = Date.now();
      await figmaService.getImages(fileKey, downloadParams.slice(0, 1), outputDir);
      const time2 = Date.now() - start2;
      console.log(`第二次下载耗时: ${time2}ms (应该接近 0ms 因为从缓存读取)`);

    } catch (error) {
      console.error('下载图片时出错:', error);
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log('测试完成！');
  console.log(`图片保存在: ${outputDir}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
