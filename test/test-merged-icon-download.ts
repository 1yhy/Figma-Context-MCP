/**
 * 测试合并图标的下载功能
 *
 * 演示 Figma API 如何将 GROUP/FRAME 节点导出为单张完整图片
 *
 * 原理：
 * 1. Figma 的 /images API 可以渲染任意节点（包括 GROUP、FRAME）
 * 2. 当请求一个包含多个子元素的节点时，Figma 会自动合并所有子元素
 * 3. 返回一张完整的图片，无需我们手动合并
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

// 从简化 JSON 中收集需要导出的图标
interface ExportableNode {
  nodeId: string;
  name: string;
  format: 'PNG' | 'SVG';
  fileName: string;
  size?: { width: string; height: string };
}

function collectExportableNodes(node: any, result: ExportableNode[] = []): ExportableNode[] {
  // 检查是否有导出信息
  if (node.exportInfo) {
    result.push({
      nodeId: node.id,
      name: node.name,
      format: node.exportInfo.format,
      fileName: node.exportInfo.fileName,
      size: node.cssStyles ? {
        width: node.cssStyles.width,
        height: node.cssStyles.height
      } : undefined
    });
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

  if (!apiKey || !fileKey) {
    console.error('请在 .env 中配置 FIGMA_API_KEY 和 TEST_FIGMA_FILE_KEY');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('合并图标下载测试');
  console.log('='.repeat(60));
  console.log();

  // 读取简化后的 JSON
  const simplifiedPath = path.join(__dirname, 'test-output', 'new-simplified-data.json');
  if (!fs.existsSync(simplifiedPath)) {
    console.error('请先运行 pnpm tsx test/run-simplification.ts 生成简化数据');
    process.exit(1);
  }

  const simplifiedData = JSON.parse(fs.readFileSync(simplifiedPath, 'utf-8'));

  // 收集可导出的图标
  const exportableNodes: ExportableNode[] = [];
  for (const node of simplifiedData.nodes) {
    collectExportableNodes(node, exportableNodes);
  }

  console.log(`找到 ${exportableNodes.length} 个可导出的图标:\n`);
  exportableNodes.forEach((node, i) => {
    console.log(`  ${i + 1}. ${node.name}`);
    console.log(`     节点ID: ${node.nodeId}`);
    console.log(`     格式: ${node.format}`);
    console.log(`     尺寸: ${node.size?.width} × ${node.size?.height}`);
    console.log(`     文件名: ${node.fileName}`);
    console.log();
  });

  // 下载图标
  const figmaService = new FigmaService(apiKey);
  const outputDir = path.join(__dirname, 'test-output', 'merged-icons');

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('--- 开始下载 ---\n');
  console.log('📌 原理说明:');
  console.log('   Figma API 的 /images 端点可以将任意节点渲染为图片');
  console.log('   当请求 GROUP/FRAME 节点时，Figma 自动合并所有子元素');
  console.log('   无需我们手动合并，Figma 服务端已完成渲染\n');

  const downloadParams = exportableNodes.map(node => ({
    nodeId: node.nodeId,
    fileName: node.fileName,
    fileType: node.format.toLowerCase() as 'png' | 'svg',
  }));

  try {
    const start = Date.now();
    const results = await figmaService.getImages(fileKey, downloadParams, outputDir);
    const time = Date.now() - start;

    console.log(`\n下载完成! 耗时: ${time}ms\n`);
    console.log('--- 下载结果 ---\n');

    results.forEach((filePath, i) => {
      const node = exportableNodes[i];
      if (filePath) {
        const stats = fs.statSync(filePath);
        console.log(`✅ ${node.name}`);
        console.log(`   文件: ${path.basename(filePath)}`);
        console.log(`   大小: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`   路径: ${filePath}`);
      } else {
        console.log(`❌ ${node.name} - 下载失败`);
      }
      console.log();
    });

    // 显示合并前后对比
    console.log('--- 合并效果说明 ---\n');
    console.log('以 "Group 1410104849" 为例:');
    console.log('  原始设计稿中包含多个子图层:');
    console.log('    ├── Group 1410104848 (核心图标组)');
    console.log('    │   ├── Frame (放大镜)');
    console.log('    │   │   ├── Ellipse (圆圈)');
    console.log('    │   │   └── Line (手柄)');
    console.log('    │   └── Group 1410104846 (感叹号)');
    console.log('    │       ├── Ellipse');
    console.log('    │       └── Vector');
    console.log('    └── ...(更多子元素)');
    console.log();
    console.log('  Figma API 自动将这些图层合并为一张 PNG 图片');
    console.log('  无需我们手动 flatten 或 merge');
    console.log();

    console.log(`\n📁 图标保存在: ${outputDir}`);
    console.log('\n打开文件夹查看:');
    console.log(`  open "${outputDir}"`);

  } catch (error) {
    console.error('下载失败:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
}

main().catch(console.error);
