<h1 align="center">
  <br>
  <img src="https://upload.wikimedia.org/wikipedia/commons/3/33/Figma-logo.svg" alt="Figma MCP" width="80">
  <br>
  Figma Context MCP
  <br>
</h1>

<p align="center">
  <strong>MCP server for seamless Figma design integration with AI coding tools</strong>
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
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#api">API</a> •
  <a href="#contributing">Contributing</a> •
  <a href="./README.zh-CN.md">中文文档</a>
</p>

---

## What is This?

Figma Context MCP is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that bridges Figma designs with AI coding assistants like [Cursor](https://cursor.sh/), [Windsurf](https://codeium.com/windsurf), and [Cline](https://cline.bot/).

When AI tools can access Figma design data directly, they generate more accurate code on the first try—far better than using screenshots.

> **Note**: This project is based on [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP), with optimized data structures and intelligent layout detection algorithms.

## Features

- **Smart Layout Detection** - Automatically infers Flexbox layouts from absolute positioning
- **Icon Merging** - Intelligently merges vector layers into single exportable icons
- **CSS Generation** - Converts Figma styles to clean, usable CSS
- **Image Export** - Downloads images and icons with proper naming
- **Reduced Context** - Outputs optimized JSON that's easy for AI to understand

### Key Improvements

| Feature | Before | After |
|---------|--------|-------|
| Icon exports | ~45 fragmented | 2 merged (96% reduction) |
| Layout detection | Manual absolute | Auto Flexbox inference |
| CSS output | Raw values | Optimized with defaults removed |

## Installation

### Prerequisites

- Node.js >= 18.0.0
- A Figma account with API access

### Via Smithery (Recommended)

```bash
npx -y @smithery/cli install @1yhy/Figma-Context-MCP --client claude
```

### Via npm

```bash
npm install -g @yhy2001/figma-mcp-server
```

### From Source

```bash
git clone https://github.com/1yhy/Figma-Context-MCP.git
cd Figma-Context-MCP
pnpm install
pnpm build
```

## Configuration

### 1. Get Figma API Token

1. Go to [Figma Account Settings](https://www.figma.com/settings)
2. Scroll to "Personal access tokens"
3. Click "Create new token"
4. Copy the token

### 2. Configure Your AI Tool

<details>
<summary><strong>Cursor / Windsurf / Cline</strong></summary>

Add to your MCP configuration file:

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
<summary><strong>HTTP/SSE Mode (Local Development)</strong></summary>

```bash
# Start the server
figma-mcp --figma-api-key=<your-key> --port=3333

# Connect via SSE
# URL: http://localhost:3333/sse
```

</details>

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--figma-api-key` | Your Figma API token | Required |
| `--port` | Server port for HTTP mode | 3333 |
| `--stdio` | Run in stdio mode | false |
| `--help` | Show help | - |

## Usage

### Getting a Figma URL

1. Open your Figma file
2. Select the frame/component you want to convert
3. Right-click → "Copy link"

The URL format: `https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}`

### Example Prompt

```
Please implement this Figma design: https://www.figma.com/design/abc123/MyDesign?node-id=1:234

Use React and Tailwind CSS.
```

## API

### MCP Tools

| Tool | Description |
|------|-------------|
| `get_figma_data` | Get simplified design data from a Figma URL |
| `download_figma_images` | Download images/icons from the design |

### Output Format

```json
{
  "name": "Design File Name",
  "lastModified": "2024-01-01T00:00:00Z",
  "nodes": [
    {
      "id": "1:234",
      "name": "Button",
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

## Project Structure

```
src/
├── algorithms/          # Layout & icon detection
│   ├── layout/         # Flexbox inference
│   └── icon/           # Icon merging
├── core/               # Core parsing
├── services/           # Figma API client
├── types/              # TypeScript types
└── utils/              # Utilities
```

## Documentation

| English | 中文 |
|---------|------|
| [Layout Detection](./docs/en/layout-detection.md) | [布局检测算法](./docs/zh-CN/layout-detection.md) |
| [Icon Detection](./docs/en/icon-detection.md) | [图标检测算法](./docs/zh-CN/icon-detection.md) |

## Contributing

Contributions are welcome!

```bash
# Setup
git clone https://github.com/1yhy/Figma-Context-MCP.git
cd Figma-Context-MCP
pnpm install

# Development
pnpm dev          # Watch mode
pnpm test         # Run tests
pnpm lint         # Lint code
pnpm build        # Build

# Commit (uses conventional commits)
git commit -m "feat: add new feature"
```

### Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style
- `refactor`: Refactoring
- `test`: Tests
- `chore`: Maintenance

## License

[MIT](./LICENSE) © 1yhy

## Acknowledgments

- [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP) - Original project
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification

---

<p align="center">
  Made with ❤️ for the AI coding community
</p>
