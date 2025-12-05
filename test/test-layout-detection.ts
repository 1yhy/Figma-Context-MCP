/**
 * 布局检测算法测试
 * 使用真实的 Figma 数据验证算法正确性
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  extractBoundingBox,
  toElementRect,
  groupIntoRows,
  groupIntoColumns,
  analyzeLayout,
  buildLayoutTree,
  generateLayoutReport,
  calculateGaps,
  analyzeGaps,
  analyzeAlignment,
  calculateBounds,
  type ElementRect,
  type BoundingBox,
} from '../src/algorithms/layout/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== 测试工具 ====================

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  data?: unknown;
}

const results: TestResult[] = [];

function test(name: string, fn: () => { passed: boolean; details: string; data?: unknown }) {
  try {
    const result = fn();
    results.push({ name, ...result });
    const status = result.passed ? '✓' : '✗';
    console.log(`[${status}] ${name}: ${result.details}`);
  } catch (error) {
    results.push({ name, passed: false, details: `错误: ${error}` });
    console.log(`[✗] ${name}: 错误 - ${error}`);
  }
}

// ==================== 从 Figma 数据提取元素 ====================

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  children?: FigmaNode[];
}

/**
 * 递归提取所有节点
 */
function extractAllNodes(node: FigmaNode, parent?: FigmaNode): Array<{ node: FigmaNode; parent?: FigmaNode }> {
  const nodes: Array<{ node: FigmaNode; parent?: FigmaNode }> = [];

  if (node.absoluteBoundingBox) {
    nodes.push({ node, parent });
  }

  if (node.children) {
    for (const child of node.children) {
      nodes.push(...extractAllNodes(child, node));
    }
  }

  return nodes;
}

/**
 * 提取直接子元素的边界框
 */
function extractChildrenRects(node: FigmaNode): ElementRect[] {
  if (!node.children) return [];

  return node.children
    .filter(child => child.absoluteBoundingBox)
    .map((child, index) => {
      const box = child.absoluteBoundingBox!;
      return toElementRect(box, index);
    });
}

// ==================== 测试用例 ====================

async function main() {
  console.log('='.repeat(60));
  console.log('布局检测算法测试');
  console.log('='.repeat(60));
  console.log();

  // 读取测试数据
  const testDataPath = path.join(__dirname, 'test-output', 'real-node-data.json');

  if (!fs.existsSync(testDataPath)) {
    console.error('错误: 找不到测试数据文件:', testDataPath);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

  // 找到根节点
  const nodeKeys = Object.keys(rawData.nodes || {});
  if (nodeKeys.length === 0) {
    console.error('错误: 测试数据中没有节点');
    process.exit(1);
  }

  const rootNode = rawData.nodes[nodeKeys[0]].document as FigmaNode;
  console.log(`根节点: ${rootNode.name} (${rootNode.type})`);
  console.log(`子节点数量: ${rootNode.children?.length || 0}`);
  console.log();

  // ==================== 基础功能测试 ====================

  console.log('--- 基础功能测试 ---');
  console.log();

  // 测试1: 边界框提取
  test('边界框提取', () => {
    const rects = extractChildrenRects(rootNode);
    return {
      passed: rects.length > 0,
      details: `提取了 ${rects.length} 个子元素`,
      data: rects.slice(0, 3),
    };
  });

  // 测试2: 行分组
  test('行分组算法', () => {
    const rects = extractChildrenRects(rootNode);
    const rows = groupIntoRows(rects);
    return {
      passed: rows.length > 0,
      details: `分成 ${rows.length} 行，每行元素数: [${rows.map(r => r.length).join(', ')}]`,
    };
  });

  // 测试3: 列分组
  test('列分组算法', () => {
    const rects = extractChildrenRects(rootNode);
    const columns = groupIntoColumns(rects);
    return {
      passed: columns.length > 0,
      details: `分成 ${columns.length} 列，每列元素数: [${columns.map(c => c.length).join(', ')}]`,
    };
  });

  console.log();

  // ==================== 递归测试每层节点 ====================

  console.log('--- 递归分析每层节点 ---');
  console.log();

  const allNodes = extractAllNodes(rootNode);
  const containerNodes = allNodes.filter(({ node }) =>
    node.children && node.children.length >= 2
  );

  console.log(`找到 ${containerNodes.length} 个可分析的容器节点`);
  console.log();

  let successfulLayouts = 0;
  let failedLayouts = 0;

  for (const { node } of containerNodes.slice(0, 10)) { // 限制前10个
    const rects = extractChildrenRects(node);

    if (rects.length < 2) continue;

    const analysis = analyzeLayout(rects);

    const testName = `${node.name} (${node.children?.length} 子元素)`;

    if (analysis.direction !== 'none') {
      successfulLayouts++;
      console.log(`[✓] ${testName}`);
      console.log(`    方向: ${analysis.direction}, 置信度: ${(analysis.confidence * 100).toFixed(1)}%`);
      console.log(`    间距: ${analysis.gap}px, 一致性: ${analysis.isGapConsistent ? '是' : '否'}`);
      console.log(`    justifyContent: ${analysis.justifyContent}, alignItems: ${analysis.alignItems}`);
    } else {
      failedLayouts++;
      console.log(`[?] ${testName}`);
      console.log(`    未检测到明确布局模式`);
    }
    console.log();
  }

  test('布局检测成功率', () => {
    const total = successfulLayouts + failedLayouts;
    const rate = total > 0 ? (successfulLayouts / total * 100).toFixed(1) : '0';
    return {
      passed: successfulLayouts > failedLayouts,
      details: `${successfulLayouts}/${total} (${rate}%)`,
    };
  });

  console.log();

  // ==================== 详细分析一个典型节点 ====================

  console.log('--- 详细分析示例 ---');
  console.log();

  // 找一个有多个子元素的节点进行详细分析
  const sampleNode = containerNodes.find(({ node }) =>
    node.children && node.children.length >= 3 && node.children.length <= 10
  );

  if (sampleNode) {
    const { node } = sampleNode;
    console.log(`分析节点: ${node.name}`);
    console.log(`类型: ${node.type}`);
    console.log(`子元素数量: ${node.children?.length}`);
    console.log();

    const rects = extractChildrenRects(node);

    // 打印子元素位置
    console.log('子元素位置:');
    node.children?.forEach((child, i) => {
      const box = child.absoluteBoundingBox;
      if (box) {
        console.log(`  ${i + 1}. ${child.name}: (${box.x.toFixed(0)}, ${box.y.toFixed(0)}) ${box.width.toFixed(0)}x${box.height.toFixed(0)}`);
      }
    });
    console.log();

    // 生成完整报告
    console.log(generateLayoutReport(rects));
    console.log();
  }

  // ==================== 间距一致性测试 ====================

  console.log('--- 间距一致性测试 ---');
  console.log();

  // 测试一致间距
  test('一致间距检测', () => {
    const gaps = [16, 16, 16, 15, 17]; // 接近一致
    const analysis = analyzeGaps(gaps);
    return {
      passed: analysis.isConsistent,
      details: `平均间距: ${analysis.average.toFixed(1)}px, 标准差: ${analysis.stdDev.toFixed(2)}, 圆整值: ${analysis.rounded}px`,
    };
  });

  // 测试不一致间距
  test('不一致间距检测', () => {
    const gaps = [10, 30, 15, 50, 20]; // 不一致
    const analysis = analyzeGaps(gaps);
    return {
      passed: !analysis.isConsistent,
      details: `平均间距: ${analysis.average.toFixed(1)}px, 标准差: ${analysis.stdDev.toFixed(2)}`,
    };
  });

  console.log();

  // ==================== 对齐方式测试 ====================

  console.log('--- 对齐方式测试 ---');
  console.log();

  // 模拟左对齐元素
  test('左对齐检测', () => {
    const rects: ElementRect[] = [
      { x: 10, y: 0, width: 100, height: 20, index: 0, right: 110, bottom: 20, centerX: 60, centerY: 10 },
      { x: 10, y: 30, width: 80, height: 20, index: 1, right: 90, bottom: 50, centerX: 50, centerY: 40 },
      { x: 10, y: 60, width: 120, height: 20, index: 2, right: 130, bottom: 80, centerX: 70, centerY: 70 },
    ];
    const bounds = calculateBounds(rects);
    const alignment = analyzeAlignment(rects, bounds);
    return {
      passed: alignment.horizontal === 'left',
      details: `检测到水平对齐: ${alignment.horizontal}, 垂直对齐: ${alignment.vertical}`,
    };
  });

  // 模拟居中对齐元素
  test('居中对齐检测', () => {
    const rects: ElementRect[] = [
      { x: 50, y: 0, width: 100, height: 20, index: 0, right: 150, bottom: 20, centerX: 100, centerY: 10 },
      { x: 60, y: 30, width: 80, height: 20, index: 1, right: 140, bottom: 50, centerX: 100, centerY: 40 },
      { x: 40, y: 60, width: 120, height: 20, index: 2, right: 160, bottom: 80, centerX: 100, centerY: 70 },
    ];
    const bounds = calculateBounds(rects);
    const alignment = analyzeAlignment(rects, bounds);
    return {
      passed: alignment.horizontal === 'center',
      details: `检测到水平对齐: ${alignment.horizontal}, 垂直对齐: ${alignment.vertical}`,
    };
  });

  console.log();

  // ==================== 布局树构建测试 ====================

  console.log('--- 布局树构建测试 ---');
  console.log();

  if (sampleNode) {
    const { node } = sampleNode;
    const rects = extractChildrenRects(node);
    const tree = buildLayoutTree(rects);

    test('布局树构建', () => {
      const hasChildren = tree.children && tree.children.length > 0;
      return {
        passed: tree.type === 'container' && hasChildren,
        details: `类型: ${tree.type}, 方向: ${tree.direction || 'none'}, 子节点: ${tree.children?.length || 0}`,
      };
    });
  }

  console.log();

  // ==================== 总结 ====================

  console.log('='.repeat(60));
  console.log('测试总结');
  console.log('='.repeat(60));
  console.log();

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  results.forEach((result, index) => {
    const status = result.passed ? '✓' : '✗';
    console.log(`${index + 1}. [${status}] ${result.name}: ${result.details}`);
  });

  console.log();
  console.log(`总计: ${passedCount}/${totalCount} 项测试通过`);
  console.log();

  if (passedCount === totalCount) {
    console.log('所有测试通过！');
  } else {
    console.log('部分测试未通过，请检查。');
  }

  // 保存测试报告
  const reportPath = path.join(__dirname, 'test-output', 'layout-detection-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      passed: passedCount,
      total: totalCount,
      rate: `${(passedCount / totalCount * 100).toFixed(1)}%`,
    },
    results,
  }, null, 2));
  console.log();
  console.log(`报告已保存到: ${reportPath}`);
}

main().catch(console.error);
