import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFigmaResponse } from '../src/services/simplify-node-response.js';

// 加载.env配置
config();

// 获取当前文件的目录
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 确保输出目录存在
const outputDir = path.join(__dirname, 'test-output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 保存数据到文件
function saveData(filename: string, data: any): void {
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`已保存数据到: ${filePath}`);
}

// 从真实的 Figma API 获取数据
async function fetchFigmaData(fileKey: string, nodeId?: string, t?: string): Promise<any> {
  const figmaApiKey = process.env.FIGMA_API_KEY;

  if (!figmaApiKey) {
    throw new Error('FIGMA_API_KEY未设置');
  }

  const baseUrl = 'https://api.figma.com/v1';
  let endpoint: string;

  if (nodeId) {
    endpoint = `/files/${fileKey}/nodes?ids=${nodeId}&t=`;
  } else {
    endpoint = `/files/${fileKey}`;
  }

  console.log(`请求Figma API: ${baseUrl}${endpoint}`);

  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      'X-Figma-Token': figmaApiKey
    }
  });

  if (!response.ok) {
    throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// 测试原项目的简化逻辑
async function testSimplifyLogic(): Promise<void> {
  try {
    console.log('测试原项目的简化逻辑...');

    // 使用真实 Figma API 数据
    const fileKey = process.env.TEST_FIGMA_FILE_KEY;
    const nodeId = process.env.TEST_FIGMA_NODE_ID;
    const t = process.env.TEST_FIGMA_T;
    if (!fileKey) {
      console.error('错误: 未设置 TEST_FIGMA_FILE_KEY 环境变量');
      process.exit(1);
    }

    if (!nodeId) {
      console.error('错误: 未设置 TEST_FIGMA_NODE_ID 环境变量');
      process.exit(1);
    }

    console.log(`\n使用文件 Key: ${fileKey}, 节点 ID: ${nodeId}`);

    // 获取并转换真实节点数据
    const realNodeData = await fetchFigmaData(fileKey, nodeId, t);
    saveData('real-node-data.json', realNodeData);
    console.log('真实节点数据已保存');

    // 使用原项目的parseFigmaResponse方法进行简化
    const simplifiedRealNodeData = parseFigmaResponse(realNodeData);
    saveData('simplified-node-data.json', simplifiedRealNodeData);
    console.log('简化后的真实节点数据已保存');

    // 打印简化信息和统计
    console.log('\n简化结果统计:');

    // 获取原始和简化后的文件大小
    const originalSize = Buffer.byteLength(JSON.stringify(realNodeData));
    const simplifiedSize = Buffer.byteLength(JSON.stringify(simplifiedRealNodeData));
    const compressionRate = ((originalSize - simplifiedSize) / originalSize * 100).toFixed(2);

    console.log(`原始数据大小: ${(originalSize / 1024).toFixed(2)} KB`);
    console.log(`简化后大小: ${(simplifiedSize / 1024).toFixed(2)} KB`);
    console.log(`压缩率: ${compressionRate}%`);

    // 节点引用分析
    if (simplifiedRealNodeData.nodes && simplifiedRealNodeData.nodes.length > 0) {
      const mainNode = simplifiedRealNodeData.nodes[0];
      console.log('\n主节点信息:');
      console.log(`名称: ${mainNode.name}`);
      console.log(`类型: ${mainNode.type}`);

      // 检查引用的样式
      const styleRefs: {[key: string]: string} = {};
      for (const [key, value] of Object.entries(mainNode)) {
        if (typeof value === 'string' && value.includes('_')) {
          styleRefs[key] = value;
        }
      }

      if (Object.keys(styleRefs).length > 0) {
        console.log('\n主节点引用的样式:');
        for (const [key, value] of Object.entries(styleRefs)) {
          console.log(`- ${key}: ${value}`);
        }
      }

      if (mainNode.children) {
        console.log(`\n子节点数量: ${mainNode.children.length}`);
      }
    }

    console.log('\n测试完成! 所有数据已保存到 test-output 目录');
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 执行测试
testSimplifyLogic();
