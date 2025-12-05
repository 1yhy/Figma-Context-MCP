<h1 align="center">
  <br>
  <img src="https://upload.wikimedia.org/wikipedia/commons/3/33/Figma-logo.svg" alt="Figma MCP" width="80">
  <br>
  Figma Context MCP
  <br>
</h1>

<p align="center">
  <strong>用于 AI 编码工具与 Figma 设计无缝集成的 MCP 服务器</strong>
</p>

<p align="center">
  <a href="https://smithery.ai/server/@1yhy/Figma-Context-MCP">
    <img src="https://smithery.ai/badge/@1yhy/Figma-Context-MCP" alt="Smithery Badge">
  </a>
  <a href="https://www.npmjs.com/package/@yhy2001/figma-mcp-server">
    <img src="https://img.shields.io/npm/v/@yhy2001/figma-mcp-server" alt="npm version">
  </a>
  <a href="https://github.com/1yhy/Figma-Context-MCP/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/1yhy/Figma-Context-MCP" alt="License">
  </a>
  <a href="https://github.com/1yhy/Figma-Context-MCP/stargazers">
    <img src="https://img.shields.io/github/stars/1yhy/Figma-Context-MCP" alt="Stars">
  </a>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#安装">安装</a> •
  <a href="#使用方法">使用方法</a> •
  <a href="#api">API</a> •
  <a href="#贡献指南">贡献指南</a> •
  <a href="./README.md">English</a>
</p>

---

## 这是什么？

Figma Context MCP 是一个 [模型上下文协议 (MCP)](https://modelcontextprotocol.io/) 服务器，用于连接 Figma 设计与 AI 编码助手，如 [Cursor](https://cursor.sh/)、[Windsurf](https://codeium.com/windsurf) 和 [Cline](https://cline.bot/)。

当 AI 工具能够直接访问 Figma 设计数据时，它们能够一次性生成更准确的代码——效果远超使用截图。

> **说明**：本项目基于 [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP) 改进，优化了数据结构和智能布局检测算法。

## 功能特性

- **智能布局检测** - 从绝对定位自动推断 Flexbox 布局
- **图标合并** - 智能合并矢量图层为单个可导出图标
- **CSS 生成** - 将 Figma 样式转换为干净可用的 CSS
- **图片导出** - 下载带有正确命名的图片和图标
- **精简上下文** - 输出优化的 JSON，便于 AI 理解

### 核心改进

| 功能 | 改进前 | 改进后 |
|------|--------|--------|
| 图标导出 | ~45 个碎片 | 2 个合并（减少 96%）|
| 布局检测 | 手动绝对定位 | 自动 Flexbox 推断 |
| CSS 输出 | 原始值 | 优化后移除默认值 |

## 安装

### 前提条件

- Node.js >= 18.0.0
- 具有 API 访问权限的 Figma 账户

### 通过 Smithery 安装（推荐）

```bash
npx -y @smithery/cli install @1yhy/Figma-Context-MCP --client claude
```

### 通过 npm 安装

```bash
npm install -g @yhy2001/figma-mcp-server
```

### 从源码安装

```bash
git clone https://github.com/1yhy/Figma-Context-MCP.git
cd Figma-Context-MCP
pnpm install
pnpm build
```

## 配置

### 1. 获取 Figma API 令牌

1. 访问 [Figma 账户设置](https://www.figma.com/settings)
2. 滚动到 "Personal access tokens"
3. 点击 "Create new token"
4. 复制令牌

### 2. 配置 AI 工具

<details>
<summary><strong>Cursor / Windsurf / Cline</strong></summary>

添加到 MCP 配置文件：

```json
{
  "mcpServers": {
    "Figma": {
      "command": "npx",
      "args": ["-y", "@yhy2001/figma-mcp-server", "--stdio"],
      "env": {
        "FIGMA_API_KEY": "your-figma-api-key"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>HTTP/SSE 模式（本地开发）</strong></summary>

```bash
# 启动服务器
figma-mcp --figma-api-key=<your-key> --port=3333

# 通过 SSE 连接
# URL: http://localhost:3333/sse
```

</details>

### 命令行选项

| 选项 | 描述 | 默认值 |
|------|------|--------|
| `--figma-api-key` | Figma API 令牌 | 必需 |
| `--port` | HTTP 模式的服务器端口 | 3333 |
| `--stdio` | 以 stdio 模式运行 | false |
| `--help` | 显示帮助 | - |

## 使用方法

### 获取 Figma URL

1. 打开 Figma 文件
2. 选择要转换的画板/组件
3. 右键 → "Copy link"

URL 格式：`https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}`

### 示例提示词

```
请实现这个 Figma 设计：https://www.figma.com/design/abc123/MyDesign?node-id=1:234

使用 React 和 Tailwind CSS。
```

## API

### MCP 工具

| 工具 | 描述 |
|------|------|
| `get_figma_data` | 从 Figma URL 获取简化的设计数据 |
| `download_figma_images` | 从设计中下载图片/图标 |

### 输出格式

```json
{
  "name": "设计文件名",
  "lastModified": "2024-01-01T00:00:00Z",
  "nodes": [
    {
      "id": "1:234",
      "name": "按钮",
      "type": "FRAME",
      "cssStyles": {
        "width": "120px",
        "height": "40px",
        "backgroundColor": "#3B82F6",
        "borderRadius": "8px"
      },
      "children": [...]
    }
  ]
}
```

## 项目结构

```
src/
├── algorithms/          # 布局和图标检测算法
│   ├── layout/         # Flexbox 推断
│   └── icon/           # 图标合并
├── core/               # 核心解析
├── services/           # Figma API 客户端
├── types/              # TypeScript 类型
└── utils/              # 工具函数
```

## 文档

| 中文 | English |
|------|---------|
| [布局检测算法](./docs/zh-CN/layout-detection.md) | [Layout Detection](./docs/en/layout-detection.md) |
| [图标检测算法](./docs/zh-CN/icon-detection.md) | [Icon Detection](./docs/en/icon-detection.md) |

## 贡献指南

欢迎贡献！

```bash
# 设置
git clone https://github.com/1yhy/Figma-Context-MCP.git
cd Figma-Context-MCP
pnpm install

# 开发
pnpm dev          # 监听模式
pnpm test         # 运行测试
pnpm lint         # 代码检查
pnpm build        # 构建

# 提交（使用约定式提交）
git commit -m "feat: 添加新功能"
```

### 提交类型

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码风格
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 其他维护

## 许可证

[MIT](./LICENSE) © 1yhy

## 致谢

- [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP) - 原始项目
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP 规范

---

<p align="center">
  为 AI 编码社区用 ❤️ 制作
</p>
