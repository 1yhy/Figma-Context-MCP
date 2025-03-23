# Figma MCP 服务器

这是一个基于[模型上下文协议(MCP)](https://modelcontextprotocol.io/introduction)的服务器，允许您将Figma设计文件与[Cursor](https://cursor.sh/)、[Windsurf](https://codeium.com/windsurf)、[Cline](https://cline.bot/)等AI编码工具无缝集成。

当AI工具能够访问Figma设计数据时，它们能够更准确地一次性生成符合设计的代码，比截图等传统方式效果更好。

## 功能特点

- 将Figma设计数据转换为AI模型易于理解的格式
- 支持获取Figma文件、画板或组件的布局和样式信息
- 支持下载Figma中的图片和图标资源
- 减少提供给模型的上下文量，提高AI响应的准确性和相关性

## 安装与使用

### 本地开发和打包

1. 克隆本仓库
2. 安装依赖：`pnpm install`
3. 复制`.env.example`为`.env`并填入您的[Figma API访问令牌](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens)
4. 本地开发：`pnpm run dev`
5. 构建项目：`pnpm run build`
6. 本地打包：`pnpm run publish:local`

打包后会在项目根目录生成一个`.tgz`文件，如`figma-mcp-server-1.0.0.tgz`

### 本地安装使用

有两种方式可以在本地使用打包好的服务：

#### 方式1：全局安装

```bash
# 全局安装本地包
npm install -g ./figma-mcp-server-1.0.0.tgz

# 启动服务
figma-mcp --figma-api-key=<your-figma-api-key>
```

#### 方式2：本地项目安装

```bash
# 在您的项目中安装
npm install ./figma-mcp-server-1.0.0.tgz

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
{
  "mcpServers": {
    "Figma MCP": {
      "command": "npx",
      "args": ["figma-mcp", "--figma-api-key=<your-figma-api-key>", "--stdio"]
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
