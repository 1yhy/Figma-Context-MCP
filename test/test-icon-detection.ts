/**
 * 图标检测算法测试
 *
 * 使用真实 Figma 节点数据测试图标检测算法的准确性
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  analyzeNodeTree,
  detectIcon,
  DEFAULT_CONFIG,
  type FigmaNode,
  type IconDetectionResult,
  type DetectionConfig,
} from '../src/algorithms/icon/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== 测试数据加载 ====================

function loadTestData(): FigmaNode {
  const dataPath = path.join(__dirname, 'test-output', 'real-node-data.json');
  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // 提取文档节点
  const nodeKey = Object.keys(rawData.nodes)[0];
  return rawData.nodes[nodeKey].document;
}

// ==================== 辅助函数 ====================

function printNodeTree(node: FigmaNode, indent: string = '', isLast: boolean = true): void {
  const prefix = indent + (isLast ? '└── ' : '├── ');
  const size = node.absoluteBoundingBox
    ? `(${Math.round(node.absoluteBoundingBox.width)}x${Math.round(node.absoluteBoundingBox.height)})`
    : '';
  const hasExport = node.exportSettings?.length ? ' [EXPORT]' : '';

  console.log(`${prefix}${node.type} "${node.name}" ${size}${hasExport}`);

  if (node.children) {
    const childIndent = indent + (isLast ? '    ' : '│   ');
    node.children.forEach((child, index) => {
      printNodeTree(child, childIndent, index === node.children!.length - 1);
    });
  }
}

function printDetectionResult(result: IconDetectionResult): void {
  const status = result.shouldMerge ? '✅' : '❌';
  const format = result.shouldMerge ? `[${result.exportFormat}]` : '';
  const size = result.size ? `(${Math.round(result.size.width)}x${Math.round(result.size.height)})` : '';

  console.log(`${status} ${result.nodeName} ${size} ${format}`);
  console.log(`   ID: ${result.nodeId}`);
  console.log(`   Reason: ${result.reason}`);
  if (result.childCount !== undefined) {
    console.log(`   Children: ${result.childCount}`);
  }
  console.log();
}

// ==================== 测试用例 ====================

function testSingleNodeDetection(node: FigmaNode): void {
  console.log('\n' + '='.repeat(60));
  console.log('单节点检测测试');
  console.log('='.repeat(60) + '\n');

  // 找到关键节点进行测试
  const testNodes: { path: string; node: FigmaNode }[] = [];

  function findTestNodes(n: FigmaNode, path: string): void {
    const currentPath = path ? `${path} > ${n.name}` : n.name;

    // 收集有 exportSettings 的节点
    if (n.exportSettings?.length) {
      testNodes.push({ path: currentPath, node: n });
    }

    // 收集特定类型的节点
    if (n.type === 'GROUP' && n.name.includes('1410104848')) {
      testNodes.push({ path: currentPath, node: n });
    }

    // 收集小尺寸的 FRAME
    if (n.type === 'FRAME' && n.absoluteBoundingBox) {
      const { width, height } = n.absoluteBoundingBox;
      if (width < 100 && height < 100) {
        testNodes.push({ path: currentPath, node: n });
      }
    }

    if (n.children) {
      n.children.forEach(child => findTestNodes(child, currentPath));
    }
  }

  findTestNodes(node, '');

  // 去重
  const uniqueNodes = testNodes.filter((item, index, self) =>
    index === self.findIndex(t => t.node.id === item.node.id)
  );

  console.log(`找到 ${uniqueNodes.length} 个测试节点:\n`);

  for (const { path, node: testNode } of uniqueNodes) {
    console.log(`--- ${path} ---`);
    const result = detectIcon(testNode);
    printDetectionResult(result);
  }
}

function testFullTreeAnalysis(node: FigmaNode): void {
  console.log('\n' + '='.repeat(60));
  console.log('完整节点树分析');
  console.log('='.repeat(60) + '\n');

  const { exportableIcons, summary } = analyzeNodeTree(node);

  console.log('检测结果汇总:');
  console.log(`- 总图标数: ${summary.totalIcons}`);
  console.log(`- SVG 格式: ${summary.svgCount}`);
  console.log(`- PNG 格式: ${summary.pngCount}`);
  console.log();

  console.log('可导出的图标列表:\n');
  exportableIcons.forEach((icon, index) => {
    console.log(`${index + 1}. ${icon.nodeName}`);
    printDetectionResult(icon);
  });
}

function testExpectedResults(node: FigmaNode): void {
  console.log('\n' + '='.repeat(60));
  console.log('期望结果验证');
  console.log('='.repeat(60) + '\n');

  // 定义期望的检测结果
  const expectedResults: Array<{
    nodeId: string;
    shouldMerge: boolean;
    exportFormat?: 'SVG' | 'PNG';
    description: string;
  }> = [
    {
      nodeId: '2:689',
      shouldMerge: true,
      exportFormat: 'PNG',
      description: 'Group 1410104849 - 图标容器 (设计师标记导出)',
    },
    {
      nodeId: '2:691',
      shouldMerge: true,
      description: 'Group 1410104848 - 核心图标组 (应整体导出)',
    },
    {
      nodeId: '2:696',
      shouldMerge: true,
      description: 'Frame - 放大镜图标 (小图标组)',
    },
    {
      nodeId: '2:700',
      shouldMerge: true,
      description: 'Group 1410104846 - 感叹号图标',
    },
    {
      nodeId: '2:684',
      shouldMerge: true,
      description: 'Frame - AI按钮中的星星图标',
    },
    {
      nodeId: '2:678',
      shouldMerge: false,
      description: 'TEXT - 文本节点不应合并',
    },
    {
      nodeId: '2:674',
      shouldMerge: false, // 尺寸太大，exportSettings 被忽略
      description: '根节点 - 尺寸过大，不作为图标导出',
    },
    {
      nodeId: '2:676',
      shouldMerge: false, // 包含 TEXT，不应整体导出为图片
      description: 'Group 1410104850 - 包含TEXT，不作为图片导出',
    },
    {
      nodeId: '2:675',
      shouldMerge: false, // 1580x895 背景矩形，尺寸过大
      description: 'Rectangle 34 - 背景矩形，尺寸过大不导出',
    },
  ];

  // 构建节点ID到节点的映射
  const nodeMap = new Map<string, FigmaNode>();

  function buildNodeMap(n: FigmaNode): void {
    nodeMap.set(n.id, n);
    if (n.children) {
      n.children.forEach(buildNodeMap);
    }
  }
  buildNodeMap(node);

  // 验证每个期望结果
  let passed = 0;
  let failed = 0;

  for (const expected of expectedResults) {
    const testNode = nodeMap.get(expected.nodeId);
    if (!testNode) {
      console.log(`⚠️ 节点 ${expected.nodeId} 未找到`);
      continue;
    }

    const result = detectIcon(testNode);
    const isCorrect = result.shouldMerge === expected.shouldMerge &&
      (!expected.exportFormat || result.exportFormat === expected.exportFormat);

    if (isCorrect) {
      console.log(`✅ PASS: ${expected.description}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${expected.description}`);
      console.log(`   期望: shouldMerge=${expected.shouldMerge}, format=${expected.exportFormat || 'any'}`);
      console.log(`   实际: shouldMerge=${result.shouldMerge}, format=${result.exportFormat}`);
      console.log(`   原因: ${result.reason}`);
      failed++;
    }
    console.log();
  }

  console.log('='.repeat(40));
  console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
  console.log('='.repeat(40));
}

function testConfigTuning(node: FigmaNode): void {
  console.log('\n' + '='.repeat(60));
  console.log('配置调优测试');
  console.log('='.repeat(60) + '\n');

  const configs: Array<{ name: string; config: DetectionConfig }> = [
    {
      name: '默认配置',
      config: DEFAULT_CONFIG,
    },
    {
      name: '宽松配置 (更大尺寸阈值)',
      config: { ...DEFAULT_CONFIG, maxIconSize: 500, mergeableRatio: 0.5 },
    },
    {
      name: '严格配置 (更小尺寸阈值)',
      config: { ...DEFAULT_CONFIG, maxIconSize: 100, mergeableRatio: 0.8 },
    },
  ];

  for (const { name, config } of configs) {
    const { summary } = analyzeNodeTree(node, config);
    console.log(`${name}:`);
    console.log(`  - 检测到图标: ${summary.totalIcons}`);
    console.log(`  - SVG: ${summary.svgCount}, PNG: ${summary.pngCount}`);
    console.log();
  }
}

// ==================== 主函数 ====================

async function main() {
  console.log('='.repeat(60));
  console.log('图标检测算法测试');
  console.log('='.repeat(60));

  // 加载测试数据
  const rootNode = loadTestData();
  console.log(`\n加载节点: ${rootNode.name} (${rootNode.id})\n`);

  // 打印节点树结构
  console.log('节点树结构:');
  console.log('-'.repeat(40));
  printNodeTree(rootNode);

  // 运行测试
  testSingleNodeDetection(rootNode);
  testFullTreeAnalysis(rootNode);
  testExpectedResults(rootNode);
  testConfigTuning(rootNode);

  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
}

main().catch(console.error);
