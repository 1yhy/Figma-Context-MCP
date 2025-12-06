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
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/MCP-1.24-green" alt="MCP SDK">
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#mcp-能力">MCP 能力</a> •
  <a href="#架构">架构</a> •
  <a href="#文档">文档</a> •
  <a href="./README.md">English</a>
</p>

---

## 这是什么？

Figma Context MCP 是一个 [模型上下文协议 (MCP)](https://modelcontextprotocol.io/) 服务器，用于连接 Figma 设计与 AI 编码助手，如 [Cursor](https://cursor.sh/)、[Windsurf](https://codeium.com/windsurf) 和 [Cline](https://cline.bot/)。

当 AI 工具能够直接访问 Figma 设计数据时，它们能够一次性生成更准确的代码——效果远超使用截图。

> **说明**：本项目基于 [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP) 改进，优化了数据结构和智能布局检测算法。

## 功能特性

### 核心能力

| 能力                 | 描述                                       |
| -------------------- | ------------------------------------------ |
| **智能布局检测**     | 从绝对定位自动推断 Flexbox/Grid 布局       |
| **图标合并**         | 智能合并矢量图层为单个可导出图标           |
| **CSS 生成**         | 将 Figma 样式转换为干净可用的 CSS          |
| **图片导出**         | 下载带有正确命名的图片和图标               |
| **多层缓存**         | L1 内存 + L2 磁盘缓存，减少 API 调用       |
| **设计转代码提示词** | 内置专业提示词模板，指导 AI 生成高质量代码 |
| **轻量资源访问**     | Resources API 提供低 Token 消耗的数据访问  |

### 核心改进

| 功能     | 改进前       | 改进后                 |
| -------- | ------------ | ---------------------- |
| 图标导出 | ~45 个碎片   | 2 个合并（减少 96%）   |
| 布局检测 | 手动绝对定位 | 自动 Flexbox/Grid 推断 |
| CSS 输出 | 原始值       | 优化后移除默认值       |
| API 调用 | 每次请求     | 24 小时智能缓存        |

## 快速开始

### 前提条件

- Node.js >= 18.0.0
- 具有 API 访问权限的 Figma 账户

### 安装

**通过 Smithery（推荐）**

```bash
npx -y @smithery/cli install @1yhy/Figma-Context-MCP --client claude
```

**通过 npm**

```bash
npm install -g @yhy2001/figma-mcp-server
```

**从源码安装**

```bash
git clone https://github.com/1yhy/Figma-Context-MCP.git
cd Figma-Context-MCP
pnpm install
pnpm build
```

### 配置

#### 1. 获取 Figma API 令牌

1. 访问 [Figma 账户设置](https://www.figma.com/settings)
2. 滚动到 "Personal access tokens"
3. 点击 "Create new token"
4. 复制令牌

#### 2. 配置 AI 工具

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

### 使用示例

```
请实现这个 Figma 设计：https://www.figma.com/design/abc123/MyDesign?node-id=1:234

使用 React 和 Tailwind CSS。
```

---

## MCP 能力

本服务器提供完整的 MCP 能力支持：

```
┌─────────────────────────────────────────────────────────────┐
│                  Figma MCP Server v1.0.2                    │
├─────────────────────────────────────────────────────────────┤
│  Tools (2)                        AI 调用的操作              │
│  ├── get_figma_data              获取设计数据                │
│  └── download_figma_images       下载图片资产                │
├─────────────────────────────────────────────────────────────┤
│  Prompts (3)                      用户选择的提示词模板        │
│  ├── design_to_code              设计转代码完整流程           │
│  ├── analyze_components          组件结构分析                │
│  └── extract_styles              样式 Token 提取            │
├─────────────────────────────────────────────────────────────┤
│  Resources (5)                    轻量级数据资源              │
│  ├── figma://help                使用指南                   │
│  ├── figma://file/{key}          文件元数据 (~200 tokens)    │
│  ├── figma://file/{key}/styles   设计 Tokens (~500 tokens)  │
│  ├── figma://file/{key}/components 组件列表 (~300 tokens)   │
│  └── figma://file/{key}/assets   资产清单 (~400 tokens)     │
└─────────────────────────────────────────────────────────────┘
```

### Tools（工具）

| 工具                    | 描述               | 参数                              |
| ----------------------- | ------------------ | --------------------------------- |
| `get_figma_data`        | 获取简化的设计数据 | `fileKey`, `nodeId?`, `depth?`    |
| `download_figma_images` | 下载图片和图标     | `fileKey`, `nodes[]`, `localPath` |

### Prompts（提示词）

内置的专业提示词模板，帮助 AI 生成高质量代码：

| 提示词               | 描述                   | 参数                               |
| -------------------- | ---------------------- | ---------------------------------- |
| `design_to_code`     | 完整的设计转代码工作流 | `framework?`, `includeResponsive?` |
| `analyze_components` | 分析组件结构和复用性   | -                                  |
| `extract_styles`     | 提取设计 Tokens        | -                                  |

**design_to_code 工作流包含：**

1. **项目分析** - 读取主题配置、全局样式、组件库
2. **结构分析** - 识别页面模式、组件拆分策略
3. **ASCII 布局图** - 生成带组件和资产标注的布局蓝图
4. **资产管理** - 分析、下载和组织图片/图标
5. **代码生成** - 遵循项目规范生成代码
6. **无障碍优化** - 语义化 HTML、ARIA 标签
7. **响应式适配** - 移动端布局调整

### Resources（资源）

轻量级数据访问，节省 Token 消耗：

```bash
# 获取文件元数据（~200 tokens）
figma://file/abc123

# 获取设计 Tokens（~500 tokens）
figma://file/abc123/styles

# 获取组件列表（~300 tokens）
figma://file/abc123/components

# 获取资产清单（~400 tokens）
figma://file/abc123/assets
```

**Resources vs Tools 对比：**

| 特性       | Tools            | Resources           |
| ---------- | ---------------- | ------------------- |
| 控制方     | AI 自动调用      | 用户/客户端主动读取 |
| Token 消耗 | 较高（完整数据） | 较低（精简摘要）    |
| 用途       | 执行操作         | 浏览和探索          |

---

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│                        MCP Server                            │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   Tools     │  │   Prompts   │  │     Resources       │   │
│  │ (2 个工具)   │  │ (3 个模板)   │  │   (5 个资源)        │   │
│  └──────┬──────┘  └─────────────┘  └──────────┬──────────┘   │
│         │                                      │              │
│         └──────────────────┬───────────────────┘              │
│                            ▼                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                   FigmaService                         │  │
│  │          API 调用 • 验证 • 错误处理 • 限流              │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                  │
│         ┌─────────────────┴─────────────────┐                │
│         ▼                                   ▼                │
│  ┌─────────────────┐              ┌─────────────────────┐    │
│  │   CacheManager  │              │    Parser + Algo    │    │
│  │  L1: LRU 内存    │              │  • 布局检测          │    │
│  │  L2: 磁盘持久化   │              │  • 图标合并          │    │
│  └─────────────────┘              │  • CSS 生成          │    │
│                                   └─────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 缓存系统

两层缓存架构，显著减少 API 调用：

| 层级 | 存储     | 容量               | TTL       | 用途           |
| ---- | -------- | ------------------ | --------- | -------------- |
| L1   | 内存 LRU | 100 节点 / 50 图片 | 5-10 分钟 | 热数据快速访问 |
| L2   | 磁盘     | 500MB              | 24 小时   | 持久化缓存     |

### 布局检测算法

自动将绝对定位转换为语义化的 Flexbox/Grid 布局：

```
输入（Figma 绝对定位）:
┌─────────────────────────┐
│ ■ (10,10)  ■ (110,10)   │
│ ■ (10,60)  ■ (110,60)   │
└─────────────────────────┘

输出（推断的 Grid）:
display: grid
grid-template-columns: 100px 100px
grid-template-rows: 50px 50px
gap: 10px
```

---

## 项目结构

```
src/
├── algorithms/           # 智能算法
│   ├── layout/          # 布局检测（Flex/Grid 推断）
│   └── icon/            # 图标合并检测
├── core/                 # 核心解析
│   ├── parser.ts        # Figma 数据解析
│   ├── style.ts         # CSS 样式生成
│   ├── layout.ts        # 布局处理
│   └── effects.ts       # 效果处理
├── services/             # 服务层
│   ├── figma.ts         # Figma API 客户端
│   └── cache/           # 多层缓存系统
├── prompts/              # MCP 提示词模板
├── resources/            # MCP 资源处理器
├── types/                # TypeScript 类型定义
├── utils/                # 工具函数
├── server.ts             # MCP 服务器主入口
└── index.ts              # CLI 入口

tests/
├── fixtures/             # 测试数据
│   ├── figma-data/      # Figma API 返回的原始 JSON
│   └── expected/        # 预期输出快照
├── integration/          # 集成测试
│   ├── layout-optimization.test.ts  # 布局优化测试
│   ├── output-quality.test.ts       # 输出质量验证
│   └── parser.test.ts               # 解析器测试
└── unit/                 # 单元测试
    ├── algorithms/      # 算法测试（布局检测、图标合并）
    ├── resources/       # 资源处理器测试
    └── services/        # 服务层测试

scripts/
└── fetch-test-data.ts   # 获取 Figma 测试数据工具
```

---

## 文档

### 核心算法

| 中文                                               | English                                               |
| -------------------------------------------------- | ----------------------------------------------------- |
| [布局检测算法](./docs/zh-CN/layout-detection.md)   | [Layout Detection](./docs/en/layout-detection.md)     |
| [图标检测算法](./docs/zh-CN/icon-detection.md)     | [Icon Detection](./docs/en/icon-detection.md)         |
| [缓存架构设计](./docs/zh-CN/cache-architecture.md) | [Cache Architecture](./docs/en/cache-architecture.md) |

### 研究文档

| 中文                                                      | English                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| [Grid 布局研究](./docs/zh-CN/grid-layout-research.md)     | [Grid Layout Research](./docs/en/grid-layout-research.md)           |
| [布局检测研究](./docs/zh-CN/layout-detection-research.md) | [Layout Detection Research](./docs/en/layout-detection-research.md) |

### 架构文档

| 中文                                     | English                                   |
| ---------------------------------------- | ----------------------------------------- |
| [系统架构](./docs/zh-CN/architecture.md) | [Architecture](./docs/en/architecture.md) |

---

## 命令行选项

| 选项              | 描述                  | 默认值 |
| ----------------- | --------------------- | ------ |
| `--figma-api-key` | Figma API 令牌        | 必需   |
| `--port`          | HTTP 模式的服务器端口 | 3333   |
| `--stdio`         | 以 stdio 模式运行     | false  |
| `--help`          | 显示帮助              | -      |

---

## 贡献指南

欢迎贡献！

```bash
# 设置
git clone https://github.com/1yhy/Figma-Context-MCP.git
cd Figma-Context-MCP
pnpm install

# 开发
pnpm dev          # 监听模式
pnpm test         # 运行测试（272 个测试用例）
pnpm lint         # 代码检查
pnpm build        # 构建

# 调试
pnpm inspect      # MCP Inspector

# 使用自己的 Figma 数据测试
pnpm tsx scripts/fetch-test-data.ts <fileKey> <nodeId> <outputName>

# 提交（使用约定式提交）
git commit -m "feat: 添加新功能"
```

### 提交类型

| 类型       | 描述     |
| ---------- | -------- |
| `feat`     | 新功能   |
| `fix`      | Bug 修复 |
| `docs`     | 文档更新 |
| `style`    | 代码风格 |
| `refactor` | 代码重构 |
| `test`     | 测试相关 |
| `chore`    | 其他维护 |

### 使用自己的 Figma 数据测试

你可以使用自己的 Figma 设计来测试布局检测和优化效果：

#### 1. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的配置
FIGMA_API_KEY=your_figma_api_key_here
TEST_FIGMA_FILE_KEY=your_file_key      # 可选
TEST_FIGMA_NODE_ID=your_node_id        # 可选
```

#### 2. 获取 Figma 节点数据

```bash
# 方式一：使用命令行参数（推荐）
pnpm tsx scripts/fetch-test-data.ts <fileKey> <nodeId> <outputName>

# 示例：获取指定节点
pnpm tsx scripts/fetch-test-data.ts UgtwrncR3GokKDIS7dpm4Z 402-34955 my-design

# 方式二：使用环境变量
TEST_FIGMA_FILE_KEY=xxx TEST_FIGMA_NODE_ID=123-456 pnpm tsx scripts/fetch-test-data.ts
```

**参数说明：**

| 参数         | 说明           | 获取方式                                                |
| ------------ | -------------- | ------------------------------------------------------- |
| `fileKey`    | Figma 文件标识 | URL 中 `/design/` 后的部分，如 `UgtwrncR3GokKDIS7dpm4Z` |
| `nodeId`     | 节点 ID        | URL 中 `node-id=` 参数，如 `402-34955`                  |
| `outputName` | 输出文件名     | 自定义，如 `my-design`                                  |

**示例 URL 解析：**

```
https://www.figma.com/design/UgtwrncR3GokKDIS7dpm4Z/MyProject?node-id=402-34955
                            ↑ fileKey                              ↑ nodeId
```

#### 3. 运行测试验证输出

```bash
# 运行所有测试
pnpm test

# 只运行集成测试（验证布局优化效果）
pnpm test tests/integration/

# 查看输出的 JSON 文件
ls tests/fixtures/figma-data/
```

#### 4. 分析优化结果

测试会自动验证：

- **数据压缩率** - 通常 >50% 压缩
- **布局检测** - Flex/Grid 布局识别率
- **CSS 属性** - 冗余属性清理
- **输出质量** - 结构一致性检查

如果测试失败，说明输出可能不符合预期，可以根据错误信息调整或报告 issue。

---

## 许可证

[MIT](./LICENSE) © 1yhy

## 致谢

- [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP) - 原始项目
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP 规范
- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) - README 模板参考

---

<p align="center">
  为 AI 编码社区用 ❤️ 制作
</p>
