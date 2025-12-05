/**
 * 测试最终优化后的 JSON 输出
 *
 * 验证图标检测算法与简化节点响应的集成效果
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  analyzeNodeTree,
  type FigmaNode,
  type IconDetectionResult,
} from "../src/utils/icon-detection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== 数据加载 ====================

function loadRealData(): FigmaNode {
  const dataPath = path.join(__dirname, "test-output", "real-node-data.json");
  const rawData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const nodeKey = Object.keys(rawData.nodes)[0];
  return rawData.nodes[nodeKey].document;
}

// ==================== 简化输出生成 ====================

interface SimplifiedExportNode {
  id: string;
  name: string;
  type: string;
  size: { width: number; height: number };
  exportFormat: "SVG" | "PNG";
  reason: string;
}

interface SimplifiedOutput {
  summary: {
    totalExportable: number;
    svgCount: number;
    pngCount: number;
  };
  exportableNodes: SimplifiedExportNode[];
  excludedReasons: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
}

function generateSimplifiedOutput(
  node: FigmaNode,
  exportableIcons: IconDetectionResult[]
): SimplifiedOutput {
  const exportableNodes: SimplifiedExportNode[] = exportableIcons.map((icon) => ({
    id: icon.nodeId,
    name: icon.nodeName,
    type: "ICON_GROUP",
    size: icon.size || { width: 0, height: 0 },
    exportFormat: icon.exportFormat,
    reason: icon.reason,
  }));

  // 收集被排除的重要节点
  const excludedReasons: Array<{ id: string; name: string; reason: string }> = [];
  const exportableIds = new Set(exportableIcons.map((i) => i.nodeId));

  function collectExcluded(n: FigmaNode) {
    // 只收集有 exportSettings 但被排除的节点
    if (n.exportSettings && n.exportSettings.length > 0 && !exportableIds.has(n.id)) {
      const size = n.absoluteBoundingBox;
      let reason = "Unknown";

      if (size && (size.width > 300 || size.height > 300)) {
        reason = `Size too large (${Math.round(size.width)}x${Math.round(size.height)})`;
      } else if (hasTextInTree(n)) {
        reason = "Contains TEXT elements";
      }

      excludedReasons.push({
        id: n.id,
        name: n.name,
        reason,
      });
    }

    if (n.children) {
      n.children.forEach(collectExcluded);
    }
  }

  function hasTextInTree(n: FigmaNode): boolean {
    if (n.type === "TEXT") return true;
    if (n.children) {
      return n.children.some(hasTextInTree);
    }
    return false;
  }

  collectExcluded(node);

  return {
    summary: {
      totalExportable: exportableNodes.length,
      svgCount: exportableNodes.filter((n) => n.exportFormat === "SVG").length,
      pngCount: exportableNodes.filter((n) => n.exportFormat === "PNG").length,
    },
    exportableNodes,
    excludedReasons,
  };
}

// ==================== 对比输出 ====================

function printComparison(
  originalNodeCount: number,
  optimizedOutput: SimplifiedOutput
): void {
  console.log("\n" + "=".repeat(60));
  console.log("优化前 vs 优化后 对比");
  console.log("=".repeat(60) + "\n");

  console.log("【优化前】原始碎片化导出:");
  console.log(`  - 可能导出的节点数: ~${originalNodeCount} 个`);
  console.log("  - 包含大量碎片化元素 (Star, Ellipse, Vector 等)");
  console.log("  - 按钮背景矩形也会被导出");
  console.log();

  console.log("【优化后】智能合并导出:");
  console.log(`  - 实际导出节点数: ${optimizedOutput.summary.totalExportable} 个`);
  console.log(`  - SVG 格式: ${optimizedOutput.summary.svgCount} 个`);
  console.log(`  - PNG 格式: ${optimizedOutput.summary.pngCount} 个`);
  console.log();

  console.log("导出的图标:");
  optimizedOutput.exportableNodes.forEach((node, index) => {
    console.log(
      `  ${index + 1}. ${node.name} (${node.size.width}x${node.size.height}) [${node.exportFormat}]`
    );
    console.log(`     ID: ${node.id}`);
    console.log(`     原因: ${node.reason}`);
  });
  console.log();

  if (optimizedOutput.excludedReasons.length > 0) {
    console.log("被排除的节点 (有 exportSettings 但不导出):");
    optimizedOutput.excludedReasons.forEach((item) => {
      console.log(`  - ${item.name} (${item.id}): ${item.reason}`);
    });
    console.log();
  }

  const reduction = Math.round(
    ((originalNodeCount - optimizedOutput.summary.totalExportable) / originalNodeCount) * 100
  );
  console.log(`📉 减少导出数量: ${reduction}%`);
}

// ==================== 生成最终 JSON ====================

function generateFinalJson(
  node: FigmaNode,
  exportableIcons: IconDetectionResult[]
): object {
  const exportableIds = new Set(exportableIcons.map((i) => i.nodeId));
  const iconMap = new Map(exportableIcons.map((i) => [i.nodeId, i]));

  function simplifyNode(n: FigmaNode): object | null {
    // 如果是可导出的图标，标记为整体导出
    if (exportableIds.has(n.id)) {
      const iconInfo = iconMap.get(n.id)!;
      return {
        id: n.id,
        name: n.name,
        type: n.type,
        exportInfo: {
          type: "IMAGE",
          format: iconInfo.exportFormat,
          fileName: `${n.name.replace(/[^a-zA-Z0-9]/g, "_")}.${iconInfo.exportFormat.toLowerCase()}`,
        },
        cssStyles: n.absoluteBoundingBox
          ? {
              width: `${Math.round(n.absoluteBoundingBox.width)}px`,
              height: `${Math.round(n.absoluteBoundingBox.height)}px`,
            }
          : undefined,
        // 不包含 children，因为整体导出
      };
    }

    // 如果是 TEXT，保留文本内容
    if (n.type === "TEXT") {
      return {
        id: n.id,
        name: n.name,
        type: "TEXT",
        text: (n as any).characters,
        cssStyles: {
          ...(n.absoluteBoundingBox
            ? {
                width: `${Math.round(n.absoluteBoundingBox.width)}px`,
                height: `${Math.round(n.absoluteBoundingBox.height)}px`,
              }
            : {}),
        },
      };
    }

    // 如果是容器，递归处理子节点
    if (n.children && n.children.length > 0) {
      const simplifiedChildren = n.children
        .map(simplifyNode)
        .filter((c): c is object => c !== null);

      // 如果没有有效的子节点，返回 null
      if (simplifiedChildren.length === 0 && !n.exportSettings) {
        return null;
      }

      return {
        id: n.id,
        name: n.name,
        type: n.type,
        cssStyles: n.absoluteBoundingBox
          ? {
              width: `${Math.round(n.absoluteBoundingBox.width)}px`,
              height: `${Math.round(n.absoluteBoundingBox.height)}px`,
            }
          : undefined,
        children: simplifiedChildren.length > 0 ? simplifiedChildren : undefined,
      };
    }

    // 单个元素（非图标），通常不需要导出
    return null;
  }

  return simplifyNode(node) || {};
}

// ==================== 主函数 ====================

async function main() {
  console.log("=".repeat(60));
  console.log("最终优化后的 JSON 输出测试");
  console.log("=".repeat(60));

  // 加载数据
  const rootNode = loadRealData();
  console.log(`\n加载节点: ${rootNode.name}\n`);

  // 分析节点树
  const { exportableIcons, summary } = analyzeNodeTree(rootNode);

  // 计算原始碎片化节点数量
  function countAllNodes(n: FigmaNode): number {
    let count = 1;
    if (n.children) {
      count += n.children.reduce((sum, child) => sum + countAllNodes(child), 0);
    }
    return count;
  }
  const originalNodeCount = countAllNodes(rootNode);

  // 生成简化输出
  const simplifiedOutput = generateSimplifiedOutput(rootNode, exportableIcons);

  // 打印对比
  printComparison(originalNodeCount, simplifiedOutput);

  // 生成最终 JSON
  const finalJson = generateFinalJson(rootNode, exportableIcons);

  // 保存输出
  const outputPath = path.join(__dirname, "test-output", "optimized-output.json");
  fs.writeFileSync(outputPath, JSON.stringify(finalJson, null, 2));
  console.log(`\n✅ 优化后的 JSON 已保存到: ${outputPath}`);

  // 打印 JSON 预览
  console.log("\n" + "=".repeat(60));
  console.log("优化后的 JSON 预览 (前 100 行):");
  console.log("=".repeat(60));
  const jsonStr = JSON.stringify(finalJson, null, 2);
  const lines = jsonStr.split("\n").slice(0, 100);
  console.log(lines.join("\n"));
  if (jsonStr.split("\n").length > 100) {
    console.log("... (更多内容请查看文件)");
  }

  console.log("\n" + "=".repeat(60));
  console.log("测试完成");
  console.log("=".repeat(60));
}

main().catch(console.error);
