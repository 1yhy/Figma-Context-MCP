# Figma MCP 服务器

[![smithery badge](https://smithery.ai/badge/@1yhy/Figma-Context-MCP)](https://smithery.ai/server/@1yhy/Figma-Context-MCP)

> 本项目基于开源项目 [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP) 改进，优化了数据结构和转换逻辑。

[English Version](./README.en.md) | 中文版

这是一个基于[模型上下文协议(MCP)](https://modelcontextprotocol.io/introduction)的服务器，允许您将Figma设计文件与[Cursor](https://cursor.sh/)、[Windsurf](https://codeium.com/windsurf)、[Cline](https://cline.bot/)等AI编码工具无缝集成。

当AI工具能够访问Figma设计数据时，它们能够更准确地一次性生成符合设计的代码，比截图等传统方式效果更好。

## 功能特点

- 将Figma设计数据转换为AI模型易于理解的格式
- 支持获取Figma文件、画板或组件的布局和样式信息
- 支持下载Figma中的图片和图标资源
- 减少提供给模型的上下文量，提高AI响应的准确性和相关性

## 与原版的主要区别

### 设计稿返回数据格式

```json
{
  // 设计文件基本信息
  "name": "设计文件名称",
  "lastModified": "最后修改时间",
  "thumbnailUrl": "缩略图URL",

  // 节点数组，包含所有页面元素
  "nodes": [
    {
      // 节点基本信息
      "id": "节点ID，例如 1:156",
      "name": "节点名称",
      "type": "节点类型，如 FRAME, TEXT, RECTANGLE, GROUP 等",

      // 文本内容（仅文本节点有此属性）
      "text": "文本节点的内容",

      // CSS样式对象，包含节点的所有样式属性
      "cssStyles": {
        // 尺寸和位置
        "width": "100px",
        "height": "50px",
        "position": "absolute",
        "left": "10px",
        "top": "20px",

        // 文本样式（主要用于TEXT节点）
        "fontFamily": "Inter",
        "fontSize": "16px",
        "fontWeight": 500,
        "textAlign": "center",
        "lineHeight": "24px",
        "color": "#333333",

        // 背景和边框
        "backgroundColor": "#ffffff",
        "borderRadius": "8px",
        "border": "1px solid #eeeeee",

        // 特效
        "boxShadow": "0px 4px 8px rgba(0, 0, 0, 0.1)",

        // 其他CSS属性...
      },

      // 填充信息（渐变、图片等）
      "fills": [
        {
          "type": "SOLID",
          "color": "#ff0000",
          "opacity": 0.5
        }
      ],

      // 导出信息（用于图片和SVG节点）
      "exportInfo": {
        "type": "IMAGE",
        "format": "PNG",
        "nodeId": "节点ID",
        "fileName": "suggested-file-name.png"
      },

      // 子节点
      "children": [
        // 递归的节点对象...
      ]
    }
  ]
}
```

### 数据结构说明

#### SimplifiedDesign
设计文件的顶层结构，包含基本信息和所有可见节点。

#### SimplifiedNode
代表设计中的一个元素，可以是画板、框架、文本或形状等。主要字段包括：
- `id`: 节点唯一标识符
- `name`: 节点在Figma中的名称
- `type`: 节点类型（FRAME, TEXT, RECTANGLE等）
- `text`: 文本内容（仅文本节点有）
- `cssStyles`: CSS样式对象，包含所有样式属性
- `fills`: 填充信息数组
- `exportInfo`: 导出信息（图片和SVG节点）
- `children`: 子节点数组

### CSSStyle
包含转换为Web标准的CSS样式属性，如字体、颜色、边框、阴影等。

### ExportInfo
图片和SVG节点的导出信息，包含：
- `type`: 导出类型（IMAGE或IMAGE_GROUP）
- `format`: 推荐的导出格式（PNG, JPG, SVG）
- `nodeId`: 用于API调用的节点ID
- `fileName`: 建议的文件名


## 安装与使用

### 安装及使用

### Installing via Smithery

To install Figma MCP 服务器 for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@1yhy/Figma-Context-MCP):

```bash
npx -y @smithery/cli install @1yhy/Figma-Context-MCP --client claude
```

### 本地开发和打包

1. 克隆本仓库
2. 安装依赖：`pnpm install`
3. 复制`.env.example`为`.env`并填入您的[Figma API访问令牌](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens)
4. 本地开发：`pnpm run dev`
5. 构建项目：`pnpm run build`
6. 本地打包：`pnpm run publish:local`

打包后会在项目根目录生成一个`.tgz`文件，如`figma-mcp-server-1.0.0.tgz`

### 本地安装使用

有两种方式可以使用该服务：

#### 方式1：从NPM安装（推荐）

```bash
# 全局安装
npm install -g @yhy2001/figma-mcp-server

# 启动服务
figma-mcp --figma-api-key=<your-figma-api-key>
```

#### 方式2：从本地包安装

```bash
# 全局安装本地包
npm install -g ./figma-mcp-server-1.0.0.tgz

# 启动服务
figma-mcp --figma-api-key=<your-figma-api-key>
```

#### 方式3：在项目中使用

```bash
# 在项目中安装
npm install @yhy2001/figma-mcp-server --save

# 在package.json的scripts中添加
# "start-figma-mcp": "figma-mcp --figma-api-key=<your-figma-api-key>"

# 或者直接运行
npx figma-mcp --figma-api-key=<your-figma-api-key>
```

### 命令行参数

- `--version`: 显示版本号
- `--figma-api-key`: 您的Figma API访问令牌（必需）
- `--port`: 服务器运行的端口（默认：3333）
- `--stdio`: 以命令模式运行服务器，而不是默认的HTTP/SSE模式
- `--help`: 显示帮助菜单

## 与AI工具连接

### 在配置文件中使用

许多工具如Cursor、Windsurf和Claude Desktop使用配置文件来启动MCP服务器。
您可以在配置文件中添加以下内容：

```json
# MCP Client使用
{
  "mcpServers": {
    "Figma MCP": {
      "command": "npx",
      "args": ["figma-mcp", "--figma-api-key=<your-figma-api-key>", "--stdio"]
    }
  }
}
# 本地使用
{
  "mcpServers": {
    "Figma MCP": {
      "url": "http://localhost:3333/sse",
      "env": {
        "API_KEY": "<your-figma-api-key>"
      }
    }
  }
}
```

### 与Cursor连接

1. 启动服务器：`figma-mcp --figma-api-key=<your-figma-api-key>`
2. 在Cursor的设置→功能选项卡中连接MCP服务器：`http://localhost:3333`
3. 确认连接成功后，在Agent模式下使用Composer
4. 粘贴Figma文件链接并要求Cursor实现设计

## 可用工具

服务器提供以下MCP工具：

### get_figma_data

获取Figma文件或特定节点的信息。

参数：
- `fileKey`：Figma文件的密钥
- `nodeId`：节点ID（强烈推荐使用）
- `depth`：遍历节点树的深度

### download_figma_images

下载Figma文件中的图片和图标资源。

参数：
- `fileKey`：包含节点的Figma文件密钥
- `nodes`：要获取的图像节点数组
- `localPath`：项目中存储图像的目录路径
