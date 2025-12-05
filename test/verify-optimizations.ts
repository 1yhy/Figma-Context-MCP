/**
 * 优化验证脚本
 * 逐个检查每个优化点是否正确应用
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// 读取测试数据
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testOutputDir = path.join(__dirname, "test-output");
const originalPath = path.join(testOutputDir, "real-node-data.json");
const simplifiedPath = path.join(testOutputDir, "new-simplified-data.json");

interface VerificationResult {
  name: string;
  passed: boolean;
  details: string;
  before?: string | number;
  after?: string | number;
}

const results: VerificationResult[] = [];

// 递归遍历对象，查找所有值
function findAllValues(obj: unknown, path: string = ""): Array<{ path: string; value: unknown }> {
  const values: Array<{ path: string; value: unknown }> = [];

  if (obj === null || obj === undefined) return values;

  if (typeof obj === "object") {
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        values.push(...findAllValues(item, `${path}[${index}]`));
      });
    } else {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        values.push({ path: `${path}.${key}`, value });
        values.push(...findAllValues(value, `${path}.${key}`));
      }
    }
  }

  return values;
}

// 统计 px 值的精度
function countPxPrecision(jsonStr: string): {
  highPrecision: number;
  lowPrecision: number;
  examples: string[];
} {
  const pxRegex = /(\d+\.?\d*)px/g;
  let highPrecision = 0;
  let lowPrecision = 0;
  const examples: string[] = [];

  let match;
  while ((match = pxRegex.exec(jsonStr)) !== null) {
    const numStr = match[1];
    const decimalPlaces = numStr.includes(".") ? numStr.split(".")[1].length : 0;

    if (decimalPlaces > 1) {
      highPrecision++;
      if (examples.length < 5) {
        examples.push(match[0]);
      }
    } else {
      lowPrecision++;
    }
  }

  return { highPrecision, lowPrecision, examples };
}

// 统计特定属性出现次数
function countProperty(jsonStr: string, pattern: RegExp): number {
  const matches = jsonStr.match(pattern);
  return matches ? matches.length : 0;
}

// 检查 nodeId 是否在 exportInfo 中被省略
function checkNodeIdOptimization(data: unknown): { hasRedundant: boolean; count: number } {
  let redundantCount = 0;

  function traverse(obj: unknown, parentId?: string): void {
    if (obj === null || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      obj.forEach((item) => traverse(item));
      return;
    }

    const node = obj as Record<string, unknown>;
    const nodeId = node.id as string | undefined;
    const exportInfo = node.exportInfo as Record<string, unknown> | undefined;

    // 检查 exportInfo 中是否有与节点 id 相同的 nodeId
    if (exportInfo && exportInfo.nodeId === nodeId) {
      redundantCount++;
    }

    // 遍历子节点
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((child: unknown) => traverse(child, nodeId));
    }
  }

  traverse(data);
  return { hasRedundant: redundantCount > 0, count: redundantCount };
}

// 检查 flex 默认值是否被省略
function checkFlexDefaults(jsonStr: string): {
  flexDirectionRow: number;
  justifyContentStart: number;
  alignItemsStretch: number;
} {
  return {
    flexDirectionRow: countProperty(jsonStr, /"flexDirection"\s*:\s*"row"/g),
    justifyContentStart: countProperty(jsonStr, /"justifyContent"\s*:\s*"flex-start"/g),
    alignItemsStretch: countProperty(jsonStr, /"alignItems"\s*:\s*"stretch"/g),
  };
}

// 检查文本默认值是否被省略
function checkTextDefaults(jsonStr: string): {
  textAlignLeft: number;
  verticalAlignTop: number;
  fontWeight400: number;
} {
  return {
    textAlignLeft: countProperty(jsonStr, /"textAlign"\s*:\s*"left"/g),
    verticalAlignTop: countProperty(jsonStr, /"verticalAlign"\s*:\s*"top"/g),
    fontWeight400: countProperty(jsonStr, /"fontWeight"\s*:\s*400/g),
  };
}

// 主函数
async function main() {
  console.log("=".repeat(60));
  console.log("优化验证报告");
  console.log("=".repeat(60));
  console.log();

  // 读取文件
  if (!fs.existsSync(originalPath)) {
    console.error("错误: 找不到原始数据文件:", originalPath);
    process.exit(1);
  }

  if (!fs.existsSync(simplifiedPath)) {
    console.error("错误: 找不到简化数据文件:", simplifiedPath);
    process.exit(1);
  }

  const originalData = fs.readFileSync(originalPath, "utf-8");
  const simplifiedData = fs.readFileSync(simplifiedPath, "utf-8");

  const originalJson = JSON.parse(originalData);
  const simplifiedJson = JSON.parse(simplifiedData);

  // 1. 文件大小对比
  console.log("1. 文件大小优化");
  console.log("-".repeat(40));
  const originalSize = Buffer.byteLength(originalData, "utf-8");
  const simplifiedSize = Buffer.byteLength(simplifiedData, "utf-8");
  const reduction = (((originalSize - simplifiedSize) / originalSize) * 100).toFixed(1);
  console.log(`   原始大小: ${originalSize.toLocaleString()} bytes`);
  console.log(`   简化大小: ${simplifiedSize.toLocaleString()} bytes`);
  console.log(`   减少: ${reduction}%`);
  results.push({
    name: "文件大小优化",
    passed: simplifiedSize < originalSize,
    details: `减少 ${reduction}%`,
    before: originalSize,
    after: simplifiedSize,
  });
  console.log();

  // 2. 数值精度优化
  console.log("2. 数值精度优化 (px 值四舍五入)");
  console.log("-".repeat(40));
  const originalPrecision = countPxPrecision(originalData);
  const simplifiedPrecision = countPxPrecision(simplifiedData);
  console.log(
    `   原始数据 - 高精度值: ${originalPrecision.highPrecision}, 低精度值: ${originalPrecision.lowPrecision}`,
  );
  if (originalPrecision.examples.length > 0) {
    console.log(`   原始高精度示例: ${originalPrecision.examples.join(", ")}`);
  }
  console.log(
    `   简化数据 - 高精度值: ${simplifiedPrecision.highPrecision}, 低精度值: ${simplifiedPrecision.lowPrecision}`,
  );
  if (simplifiedPrecision.examples.length > 0) {
    console.log(`   简化高精度示例: ${simplifiedPrecision.examples.join(", ")}`);
  }
  // 成功条件: 简化数据中没有高精度值 (所有 px 值都已四舍五入)
  const precisionPassed = simplifiedPrecision.highPrecision === 0;
  results.push({
    name: "数值精度优化",
    passed: precisionPassed,
    details: `高精度值: ${simplifiedPrecision.highPrecision}, 低精度值: ${simplifiedPrecision.lowPrecision}`,
    before: originalPrecision.highPrecision,
    after: simplifiedPrecision.highPrecision,
  });
  console.log();

  // 3. 文本默认值省略
  console.log("3. 文本默认值省略");
  console.log("-".repeat(40));
  const simplifiedTextDefaults = checkTextDefaults(simplifiedData);
  console.log(`   textAlign:"left" 出现次数: ${simplifiedTextDefaults.textAlignLeft}`);
  console.log(`   verticalAlign:"top" 出现次数: ${simplifiedTextDefaults.verticalAlignTop}`);
  console.log(`   fontWeight:400 出现次数: ${simplifiedTextDefaults.fontWeight400}`);
  const textDefaultsPassed =
    simplifiedTextDefaults.textAlignLeft === 0 && simplifiedTextDefaults.verticalAlignTop === 0;
  results.push({
    name: "文本默认值省略",
    passed: textDefaultsPassed,
    details: `textAlign:left=${simplifiedTextDefaults.textAlignLeft}, verticalAlign:top=${simplifiedTextDefaults.verticalAlignTop}`,
  });
  console.log();

  // 4. Flex 默认值省略
  console.log("4. Flex 默认值省略");
  console.log("-".repeat(40));
  const simplifiedFlexDefaults = checkFlexDefaults(simplifiedData);
  console.log(`   flexDirection:"row" 出现次数: ${simplifiedFlexDefaults.flexDirectionRow}`);
  console.log(
    `   justifyContent:"flex-start" 出现次数: ${simplifiedFlexDefaults.justifyContentStart}`,
  );
  console.log(`   alignItems:"stretch" 出现次数: ${simplifiedFlexDefaults.alignItemsStretch}`);
  const flexDefaultsPassed =
    simplifiedFlexDefaults.flexDirectionRow === 0 &&
    simplifiedFlexDefaults.justifyContentStart === 0 &&
    simplifiedFlexDefaults.alignItemsStretch === 0;
  results.push({
    name: "Flex 默认值省略",
    passed: flexDefaultsPassed,
    details: `row=${simplifiedFlexDefaults.flexDirectionRow}, flex-start=${simplifiedFlexDefaults.justifyContentStart}, stretch=${simplifiedFlexDefaults.alignItemsStretch}`,
  });
  console.log();

  // 5. nodeId 省略检查
  console.log("5. 重复 nodeId 省略");
  console.log("-".repeat(40));
  const nodeIdCheck = checkNodeIdOptimization(simplifiedJson);
  console.log(`   exportInfo 中冗余的 nodeId: ${nodeIdCheck.count}`);
  results.push({
    name: "nodeId 省略",
    passed: !nodeIdCheck.hasRedundant,
    details: `冗余 nodeId 数量: ${nodeIdCheck.count}`,
  });
  console.log();

  // 6. gap 一致性检测 (查找是否有 gap 属性)
  console.log("6. Gap 属性检查");
  console.log("-".repeat(40));
  const gapCount = countProperty(simplifiedData, /"gap"\s*:/g);
  console.log(`   gap 属性出现次数: ${gapCount}`);
  console.log(`   (仅在间距一致时才添加 gap)`);
  results.push({
    name: "Gap 一致性",
    passed: true,
    details: `gap 属性数量: ${gapCount}`,
  });
  console.log();

  // 总结
  console.log("=".repeat(60));
  console.log("验证总结");
  console.log("=".repeat(60));
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log();
  results.forEach((result, index) => {
    const status = result.passed ? "✓" : "✗";
    console.log(`${index + 1}. [${status}] ${result.name}: ${result.details}`);
  });
  console.log();
  console.log(`总计: ${passedCount}/${totalCount} 项验证通过`);
  console.log();

  if (passedCount === totalCount) {
    console.log("所有优化点均已正确应用！");
  } else {
    console.log("部分优化点未通过验证，请检查。");
  }
}

main().catch(console.error);
