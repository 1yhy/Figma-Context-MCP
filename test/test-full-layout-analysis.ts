/**
 * 完整布局分析测试
 * 深入分析真实 Figma 数据的布局结构
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  toElementRect,
  groupIntoRows,
  groupIntoColumns,
  analyzeLayout,
  buildLayoutTree,
  calculateBounds,
  findOverlappingElements,
  analyzeGaps,
  calculateGaps,
  type ElementRect,
  type LayoutNode,
} from '../src/algorithms/layout/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== 类型定义 ====================

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

// ==================== 辅助函数 ====================

function extractChildrenRects(node: FigmaNode): ElementRect[] {
  if (!node.children) return [];

  return node.children
    .filter(child => child.absoluteBoundingBox)
    .map((child, index) => {
      const box = child.absoluteBoundingBox!;
      return toElementRect(box, index);
    });
}

function getNodePath(node: FigmaNode, nodes: Map<string, FigmaNode>, maxDepth = 3): string {
  const parts = [node.name];
  // 简化路径
  return parts.join(' > ');
}

interface LayoutAnalysisEntry {
  nodeName: string;
  nodeType: string;
  childCount: number;
  direction: string;
  confidence: number;
  gap: number;
  isGapConsistent: boolean;
  justifyContent: string;
  alignItems: string;
  overlappingCount: number;
  rowCount: number;
  columnCount: number;
}

// ==================== 主测试 ====================

async function main() {
  console.log('='.repeat(70));
  console.log('完整布局分析测试 - 使用真实 Figma 数据');
  console.log('='.repeat(70));
  console.log();

  // 读取测试数据
  const testDataPath = path.join(__dirname, 'test-output', 'real-node-data.json');

  if (!fs.existsSync(testDataPath)) {
    console.error('错误: 找不到测试数据文件:', testDataPath);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));
  const nodeKeys = Object.keys(rawData.nodes || {});

  if (nodeKeys.length === 0) {
    console.error('错误: 测试数据中没有节点');
    process.exit(1);
  }

  const rootNode = rawData.nodes[nodeKeys[0]].document as FigmaNode;

  // 收集所有容器节点
  const allContainers: FigmaNode[] = [];

  function collectContainers(node: FigmaNode) {
    if (node.children && node.children.length >= 2) {
      allContainers.push(node);
    }
    if (node.children) {
      node.children.forEach(collectContainers);
    }
  }

  collectContainers(rootNode);

  console.log(`找到 ${allContainers.length} 个容器节点`);
  console.log();

  // ==================== 分析每个容器 ====================

  const analysisResults: LayoutAnalysisEntry[] = [];

  console.log('--- 容器布局分析 ---');
  console.log();

  // 统计
  let flexRowCount = 0;
  let flexColumnCount = 0;
  let absoluteCount = 0;
  let mixedCount = 0;

  for (const container of allContainers) {
    const rects = extractChildrenRects(container);

    if (rects.length < 2) continue;

    const analysis = analyzeLayout(rects);

    const entry: LayoutAnalysisEntry = {
      nodeName: container.name,
      nodeType: container.type,
      childCount: rects.length,
      direction: analysis.direction,
      confidence: analysis.confidence,
      gap: analysis.gap,
      isGapConsistent: analysis.isGapConsistent,
      justifyContent: analysis.justifyContent,
      alignItems: analysis.alignItems,
      overlappingCount: analysis.overlappingElements.length,
      rowCount: analysis.rows.length,
      columnCount: analysis.columns.length,
    };

    analysisResults.push(entry);

    // 分类统计
    if (analysis.overlappingElements.length === rects.length) {
      absoluteCount++;
    } else if (analysis.direction === 'row') {
      flexRowCount++;
    } else if (analysis.direction === 'column') {
      flexColumnCount++;
    } else {
      mixedCount++;
    }

    // 打印详情
    const statusIcon = analysis.direction !== 'none' ? '✓' :
      analysis.overlappingElements.length === rects.length ? '◎' : '?';

    console.log(`[${statusIcon}] ${container.name}`);
    console.log(`    类型: ${container.type}, 子元素: ${rects.length}`);

    if (analysis.direction !== 'none') {
      console.log(`    布局: flex-${analysis.direction}, 置信度: ${(analysis.confidence * 100).toFixed(0)}%`);
      if (analysis.gap > 0 && analysis.isGapConsistent) {
        console.log(`    间距: ${analysis.gap}px`);
      }
      console.log(`    justify: ${analysis.justifyContent}, align: ${analysis.alignItems}`);
    } else if (analysis.overlappingElements.length === rects.length) {
      console.log(`    布局: absolute (所有元素重叠)`);
    } else if (analysis.overlappingElements.length > 0) {
      console.log(`    布局: mixed (${analysis.overlappingElements.length}/${rects.length} 重叠)`);
    }

    console.log(`    分组: ${analysis.rows.length} 行, ${analysis.columns.length} 列`);
    console.log();
  }

  // ==================== 统计摘要 ====================

  console.log('='.repeat(70));
  console.log('统计摘要');
  console.log('='.repeat(70));
  console.log();

  const total = analysisResults.length;
  console.log(`总容器数: ${total}`);
  console.log(`  - Flex Row: ${flexRowCount} (${(flexRowCount / total * 100).toFixed(1)}%)`);
  console.log(`  - Flex Column: ${flexColumnCount} (${(flexColumnCount / total * 100).toFixed(1)}%)`);
  console.log(`  - Absolute (重叠): ${absoluteCount} (${(absoluteCount / total * 100).toFixed(1)}%)`);
  console.log(`  - Mixed/Unknown: ${mixedCount} (${(mixedCount / total * 100).toFixed(1)}%)`);
  console.log();

  // ==================== 布局树示例 ====================

  console.log('='.repeat(70));
  console.log('布局树示例');
  console.log('='.repeat(70));
  console.log();

  // 找一个有明确布局的容器
  const goodExample = allContainers.find(c => {
    const rects = extractChildrenRects(c);
    if (rects.length < 3) return false;
    const analysis = analyzeLayout(rects);
    return analysis.direction !== 'none' && analysis.confidence > 0.4;
  });

  if (goodExample) {
    console.log(`示例容器: ${goodExample.name}`);
    console.log(`子元素: ${goodExample.children?.length}`);
    console.log();

    const rects = extractChildrenRects(goodExample);
    const tree = buildLayoutTree(rects);

    console.log('布局树:');
    printLayoutTree(tree, goodExample.children || []);
    console.log();
  }

  // ==================== CSS 输出示例 ====================

  console.log('='.repeat(70));
  console.log('CSS 输出示例');
  console.log('='.repeat(70));
  console.log();

  for (const container of allContainers.slice(0, 5)) {
    const rects = extractChildrenRects(container);
    if (rects.length < 2) continue;

    const analysis = analyzeLayout(rects);

    console.log(`/* ${container.name} */`);
    console.log(`.${sanitizeName(container.name)} {`);

    if (analysis.direction !== 'none') {
      console.log('  display: flex;');
      if (analysis.direction === 'column') {
        console.log('  flex-direction: column;');
      }
      if (analysis.gap > 0 && analysis.isGapConsistent) {
        console.log(`  gap: ${analysis.gap}px;`);
      }
      if (analysis.justifyContent !== 'flex-start') {
        console.log(`  justify-content: ${analysis.justifyContent};`);
      }
      if (analysis.alignItems !== 'stretch') {
        console.log(`  align-items: ${analysis.alignItems};`);
      }
    } else {
      console.log('  position: relative;');
    }

    console.log('}');
    console.log();
  }

  // ==================== 保存完整报告 ====================

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total,
      flexRow: flexRowCount,
      flexColumn: flexColumnCount,
      absolute: absoluteCount,
      mixed: mixedCount,
    },
    containers: analysisResults,
  };

  const reportPath = path.join(__dirname, 'test-output', 'full-layout-analysis.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`完整报告已保存到: ${reportPath}`);
}

// ==================== 辅助函数 ====================

function printLayoutTree(node: LayoutNode, figmaChildren: FigmaNode[], indent = 0) {
  const prefix = '  '.repeat(indent);

  if (node.type === 'element') {
    const figmaNode = figmaChildren[node.elementIndex || 0];
    const name = figmaNode?.name || `Element ${node.elementIndex}`;
    const absolute = node.needsAbsolute ? ' [absolute]' : '';
    console.log(`${prefix}- ${name}${absolute}`);
  } else {
    const dir = node.direction || 'none';
    const gap = node.gap ? ` gap:${node.gap}px` : '';
    console.log(`${prefix}+ Container (${dir}${gap})`);

    if (node.children) {
      for (const child of node.children) {
        printLayoutTree(child, figmaChildren, indent + 1);
      }
    }
  }
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

main().catch(console.error);
