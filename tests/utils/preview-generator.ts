/**
 * 从简化的 Figma JSON 生成 HTML 预览
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * 获取节点的位置值
 */
function getPosition(node: SimplifiedNode): { left: number; top: number } {
  const left = node.cssStyles?.left ? parseFloat(String(node.cssStyles.left).replace("px", "")) : 0;
  const top = node.cssStyles?.top ? parseFloat(String(node.cssStyles.top).replace("px", "")) : 0;
  return { left, top };
}

/**
 * 将 CSS 样式对象转换为内联样式字符串
 */
function cssToInlineStyle(
  cssStyles: Record<string, string | number> | undefined,
  offsetX: number = 0,
  offsetY: number = 0,
): string {
  if (!cssStyles) return "";

  const styles: string[] = [];

  for (const [key, value] of Object.entries(cssStyles)) {
    let finalValue = value;

    // 调整 left 和 top 的偏移
    if (key === "left" && typeof value === "string") {
      const numValue = parseFloat(value.replace("px", ""));
      finalValue = `${numValue - offsetX}px`;
    } else if (key === "top" && typeof value === "string") {
      const numValue = parseFloat(value.replace("px", ""));
      finalValue = `${numValue - offsetY}px`;
    }

    // 驼峰转连字符
    const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
    styles.push(`${cssKey}: ${finalValue}`);
  }

  return styles.join("; ");
}

/**
 * 递归渲染节点为 HTML
 */
function renderNode(
  node: SimplifiedNode,
  depth: number = 0,
  isRoot: boolean = false,
  rootOffsetX: number = 0,
  rootOffsetY: number = 0,
): string {
  const indent = "  ".repeat(depth);

  // 只有根节点需要减去偏移量，子节点已经是相对坐标
  const offsetX = isRoot ? rootOffsetX : 0;
  const offsetY = isRoot ? rootOffsetY : 0;

  // 计算样式
  const style = cssToInlineStyle(node.cssStyles, offsetX, offsetY);

  // 根据节点类型添加额外样式
  if (node.type === "TEXT") {
    // 文本节点
    return `${indent}<div class="node node-text" data-name="${escapeHtml(node.name)}" style="${style}">${escapeHtml(node.text || "")}</div>\n`;
  }

  if (node.type === "VECTOR" || (node.exportInfo && !node.children)) {
    // 向量/图片节点 - 显示占位符
    const bgColor = node.cssStyles?.backgroundColor || "rgba(139,92,246,0.5)";
    return `${indent}<div class="node node-vector" data-name="${escapeHtml(node.name)}" style="${style}">
${indent}  <div class="vector-placeholder" style="background: ${bgColor};"></div>
${indent}</div>\n`;
  }

  // 容器节点
  let html = `${indent}<div class="node node-${node.type.toLowerCase()}" data-name="${escapeHtml(node.name)}" style="${style}">\n`;

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      // 子节点不是根节点，不需要偏移
      html += renderNode(child, depth + 1, false, 0, 0);
    }
  }

  html += `${indent}</div>\n`;

  return html;
}

/**
 * HTML 转义
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 计算节点总数
 */
function countNodes(nodes: SimplifiedNode[]): number {
  let count = nodes.length;
  for (const node of nodes) {
    if (node.children) {
      count += countNodes(node.children);
    }
  }
  return count;
}

/**
 * 生成完整的 HTML 页面
 */
function generateHTML(design: SimplifiedDesign): string {
  // 找到根节点
  const rootNode = design.nodes[0];

  if (!rootNode) {
    return "<html><body>No nodes found</body></html>";
  }

  // 根节点的原始位置作为偏移基准
  const rootPos = getPosition(rootNode);

  // 渲染所有节点（根节点使用自己的位置作为偏移基准）
  let nodesHtml = "";
  for (const node of design.nodes) {
    // 根节点需要减去画布偏移
    nodesHtml += renderNode(node, 3, true, rootPos.left, rootPos.top);
  }

  const width = rootNode.cssStyles?.width || "322px";
  const height = rootNode.cssStyles?.height || "523px";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(design.name)} - Figma Preview</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 40px;
      font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
    }

    .header h1 {
      color: #fff;
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 10px;
    }

    .header p {
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
    }

    .preview-wrapper {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      padding: 30px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .canvas {
      position: relative;
      background: linear-gradient(180deg, #1e1e3f 0%, #0a0a1a 100%);
      border-radius: 12px;
      overflow: hidden;
    }

    .node {
      position: absolute;
      overflow: hidden;
    }

    .node-frame {
      background: linear-gradient(180deg, rgba(139, 92, 246, 0.15) 0%, rgba(30, 30, 60, 0.9) 100%);
    }

    .node-text {
      white-space: nowrap;
    }

    .node-vector,
    .node-group {
      overflow: visible;
    }

    .vector-placeholder {
      width: 100%;
      height: 100%;
      border-radius: 4px;
      opacity: 0.9;
    }

    .footer {
      margin-top: 30px;
      text-align: center;
    }

    .footer p {
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
    }

    .stats {
      display: flex;
      gap: 20px;
      justify-content: center;
      margin-top: 15px;
      flex-wrap: wrap;
    }

    .stat {
      background: rgba(255, 255, 255, 0.1);
      padding: 10px 20px;
      border-radius: 8px;
      color: rgba(255, 255, 255, 0.8);
      font-size: 12px;
    }

    .stat strong {
      color: #a78bfa;
    }

    /* 模拟短视频背景 */
    .node-frame::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 220px;
      background:
        radial-gradient(ellipse at 30% 20%, rgba(139, 92, 246, 0.4) 0%, transparent 50%),
        radial-gradient(ellipse at 70% 60%, rgba(236, 72, 153, 0.3) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 80%, rgba(59, 130, 246, 0.2) 0%, transparent 50%);
      pointer-events: none;
      z-index: 0;
    }

    /* 播放按钮 */
    .node-frame::after {
      content: '▶';
      position: absolute;
      top: 100px;
      left: 50%;
      transform: translateX(-50%);
      width: 50px;
      height: 50px;
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(10px);
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 20px;
      color: #fff;
      z-index: 1;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎨 ${escapeHtml(design.name)}</h1>
    <p>从 Figma JSON 自动生成的 HTML 预览</p>
  </div>

  <div class="preview-wrapper">
    <div class="canvas" style="width: ${width}; height: ${height};">
${nodesHtml}
    </div>
  </div>

  <div class="footer">
    <p>Generated from simplified Figma JSON</p>
    <div class="stats">
      <div class="stat">尺寸: <strong>${width} × ${height}</strong></div>
      <div class="stat">节点数: <strong>${countNodes(design.nodes)}</strong></div>
      <div class="stat">最后修改: <strong>${design.lastModified || "N/A"}</strong></div>
    </div>
  </div>
</body>
</html>`;
}

// 主程序
async function main() {
  const inputPath = path.join(__dirname, "test-output", "new-simplified-data.json");
  const outputPath = path.join(__dirname, "test-output", "auto-generated-preview.html");

  console.log("读取简化数据...");
  const data = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as SimplifiedDesign;

  console.log("生成 HTML...");
  const html = generateHTML(data);

  console.log("保存文件...");
  fs.writeFileSync(outputPath, html);

  console.log();
  console.log("✅ HTML 预览已生成!");
  console.log(`📄 文件路径: ${outputPath}`);
  console.log();
  console.log("打开预览:");
  console.log(`  open "${outputPath}"`);
}

main().catch(console.error);
