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
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/MCP-1.24-green" alt="MCP SDK">
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#mcp-capabilities">MCP Capabilities</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#documentation">Documentation</a> •
  <a href="./README.zh-CN.md">中文文档</a>
</p>

---

## What is This?

Figma Context MCP is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that bridges Figma designs with AI coding assistants like [Cursor](https://cursor.sh/), [Windsurf](https://codeium.com/windsurf), and [Cline](https://cline.bot/).

When AI tools can access Figma design data directly, they generate more accurate code on the first try—far better than using screenshots.

> **Note**: This project is based on [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP), with optimized data structures and intelligent layout detection algorithms.

## Features

### Core Capabilities

| Capability                      | Description                                                         |
| ------------------------------- | ------------------------------------------------------------------- |
| **Smart Layout Detection**      | Automatically infers Flexbox/Grid layouts from absolute positioning |
| **Icon Merging**                | Intelligently merges vector layers into single exportable icons     |
| **CSS Generation**              | Converts Figma styles to clean, usable CSS                          |
| **Image Export**                | Downloads images and icons with proper naming                       |
| **Multi-layer Caching**         | L1 memory + L2 disk cache to reduce API calls                       |
| **Design-to-Code Prompts**      | Built-in professional prompt templates to guide AI code generation  |
| **Lightweight Resource Access** | Resources API provides low-token data access                        |

### Key Improvements

| Feature          | Before          | After                           |
| ---------------- | --------------- | ------------------------------- |
| Icon exports     | ~45 fragmented  | 2 merged (96% reduction)        |
| Layout detection | Manual absolute | Auto Flexbox/Grid inference     |
| CSS output       | Raw values      | Optimized with defaults removed |
| API calls        | Every request   | 24-hour smart caching           |

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- A Figma account with API access

### Installation

**Via Smithery (Recommended)**

```bash
npx -y @smithery/cli install @1yhy/Figma-Context-MCP --client claude
```

**Via npm**

```bash
npm install -g @yhy2001/figma-mcp-server
```

**From Source**

```bash
git clone https://github.com/1yhy/Figma-Context-MCP.git
cd Figma-Context-MCP
pnpm install
pnpm build
```

### Configuration

#### 1. Get Figma API Token

1. Go to [Figma Account Settings](https://www.figma.com/settings)
2. Scroll to "Personal access tokens"
3. Click "Create new token"
4. Copy the token

#### 2. Configure Your AI Tool

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

### Usage Example

```
Please implement this Figma design: https://www.figma.com/design/abc123/MyDesign?node-id=1:234

Use React and Tailwind CSS.
```

---

## MCP Capabilities

This server provides full MCP capabilities support:

```
┌─────────────────────────────────────────────────────────────┐
│                  Figma MCP Server v1.0.2                    │
├─────────────────────────────────────────────────────────────┤
│  Tools (2)                        AI-invoked operations     │
│  ├── get_figma_data              Fetch design data          │
│  └── download_figma_images       Download image assets      │
├─────────────────────────────────────────────────────────────┤
│  Prompts (3)                      User-selected templates   │
│  ├── design_to_code              Full design-to-code flow   │
│  ├── analyze_components          Component structure        │
│  └── extract_styles              Style token extraction     │
├─────────────────────────────────────────────────────────────┤
│  Resources (5)                    Lightweight data sources  │
│  ├── figma://help                Usage guide                │
│  ├── figma://file/{key}          File metadata (~200 tok)   │
│  ├── figma://file/{key}/styles   Design tokens (~500 tok)   │
│  ├── figma://file/{key}/components Component list (~300 tok)│
│  └── figma://file/{key}/assets   Asset inventory (~400 tok) │
└─────────────────────────────────────────────────────────────┘
```

### Tools

| Tool                    | Description                  | Parameters                        |
| ----------------------- | ---------------------------- | --------------------------------- |
| `get_figma_data`        | Fetch simplified design data | `fileKey`, `nodeId?`, `depth?`    |
| `download_figma_images` | Download images and icons    | `fileKey`, `nodes[]`, `localPath` |

### Prompts

Built-in professional prompt templates to help AI generate high-quality code:

| Prompt               | Description                                 | Parameters                         |
| -------------------- | ------------------------------------------- | ---------------------------------- |
| `design_to_code`     | Complete design-to-code workflow            | `framework?`, `includeResponsive?` |
| `analyze_components` | Analyze component structure and reusability | -                                  |
| `extract_styles`     | Extract design tokens                       | -                                  |

**design_to_code workflow includes:**

1. **Project Analysis** - Read theme config, global styles, component library
2. **Structure Analysis** - Identify page patterns, component splitting strategy
3. **ASCII Layout Blueprint** - Generate layout diagram with component and asset annotations
4. **Asset Management** - Analyze, download, and organize images/icons
5. **Code Generation** - Generate code following project conventions
6. **Accessibility Optimization** - Semantic HTML, ARIA labels
7. **Responsive Adaptation** - Mobile layout adjustments

### Resources

Lightweight data access to save tokens:

```bash
# Get file metadata (~200 tokens)
figma://file/abc123

# Get design tokens (~500 tokens)
figma://file/abc123/styles

# Get component list (~300 tokens)
figma://file/abc123/components

# Get asset inventory (~400 tokens)
figma://file/abc123/assets
```

**Resources vs Tools comparison:**

| Feature    | Tools              | Resources             |
| ---------- | ------------------ | --------------------- |
| Controller | AI auto-invoked    | User/client initiated |
| Token cost | Higher (full data) | Lower (summaries)     |
| Use case   | Execute actions    | Browse and explore    |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        MCP Server                            │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   Tools     │  │   Prompts   │  │     Resources       │   │
│  │ (2 tools)   │  │ (3 prompts) │  │   (5 resources)     │   │
│  └──────┬──────┘  └─────────────┘  └──────────┬──────────┘   │
│         │                                      │              │
│         └──────────────────┬───────────────────┘              │
│                            ▼                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                   FigmaService                         │  │
│  │          API Calls • Validation • Error Handling       │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                  │
│         ┌─────────────────┴─────────────────┐                │
│         ▼                                   ▼                │
│  ┌─────────────────┐              ┌─────────────────────┐    │
│  │   CacheManager  │              │    Parser + Algo    │    │
│  │  L1: LRU Memory │              │  • Layout Detection │    │
│  │  L2: Disk Store │              │  • Icon Merging     │    │
│  └─────────────────┘              │  • CSS Generation   │    │
│                                   └─────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### Cache System

Two-layer cache architecture significantly reduces API calls:

| Layer | Storage    | Capacity              | TTL      | Purpose              |
| ----- | ---------- | --------------------- | -------- | -------------------- |
| L1    | Memory LRU | 100 nodes / 50 images | 5-10 min | Hot data fast access |
| L2    | Disk       | 500MB                 | 24 hours | Persistent cache     |

### Layout Detection Algorithm

Automatically converts absolute positioning to semantic Flexbox/Grid layouts:

```
Input (Figma absolute positioning):
┌─────────────────────────┐
│ ■ (10,10)  ■ (110,10)   │
│ ■ (10,60)  ■ (110,60)   │
└─────────────────────────┘

Output (Inferred Grid):
display: grid
grid-template-columns: 100px 100px
grid-template-rows: 50px 50px
gap: 10px
```

---

## Project Structure

```
src/
├── algorithms/           # Smart algorithms
│   ├── layout/          # Layout detection (Flex/Grid inference)
│   └── icon/            # Icon merge detection
├── core/                 # Core parsing
│   ├── parser.ts        # Figma data parser
│   ├── style.ts         # CSS style generation
│   ├── layout.ts        # Layout processing
│   └── effects.ts       # Effects handling
├── services/             # Service layer
│   ├── figma.ts         # Figma API client
│   └── cache/           # Multi-layer cache system
├── prompts/              # MCP prompt templates
├── resources/            # MCP resource handlers
├── types/                # TypeScript type definitions
├── utils/                # Utility functions
├── server.ts             # MCP server main entry
└── index.ts              # CLI entry

tests/
├── fixtures/             # Test data
│   ├── figma-data/      # Raw JSON from Figma API
│   └── expected/        # Expected output snapshots
├── integration/          # Integration tests
│   ├── layout-optimization.test.ts  # Layout optimization tests
│   ├── output-quality.test.ts       # Output quality validation
│   └── parser.test.ts               # Parser tests
└── unit/                 # Unit tests
    ├── algorithms/      # Algorithm tests (layout, icon detection)
    ├── resources/       # Resource handler tests
    └── services/        # Service layer tests

scripts/
└── fetch-test-data.ts   # Figma test data fetcher
```

---

## Documentation

### Core Algorithms

| English                                               | 中文                                               |
| ----------------------------------------------------- | -------------------------------------------------- |
| [Layout Detection](./docs/en/layout-detection.md)     | [布局检测算法](./docs/zh-CN/layout-detection.md)   |
| [Icon Detection](./docs/en/icon-detection.md)         | [图标检测算法](./docs/zh-CN/icon-detection.md)     |
| [Cache Architecture](./docs/en/cache-architecture.md) | [缓存架构设计](./docs/zh-CN/cache-architecture.md) |

### Research Documents

| English                                                             | 中文                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| [Grid Layout Research](./docs/en/grid-layout-research.md)           | [Grid 布局研究](./docs/zh-CN/grid-layout-research.md)     |
| [Layout Detection Research](./docs/en/layout-detection-research.md) | [布局检测研究](./docs/zh-CN/layout-detection-research.md) |

### Architecture Documents

| English                                   | 中文                                     |
| ----------------------------------------- | ---------------------------------------- |
| [Architecture](./docs/en/architecture.md) | [系统架构](./docs/zh-CN/architecture.md) |

---

## Command Line Options

| Option            | Description               | Default  |
| ----------------- | ------------------------- | -------- |
| `--figma-api-key` | Figma API token           | Required |
| `--port`          | Server port for HTTP mode | 3333     |
| `--stdio`         | Run in stdio mode         | false    |
| `--help`          | Show help                 | -        |

---

## Contributing

Contributions are welcome!

```bash
# Setup
git clone https://github.com/1yhy/Figma-Context-MCP.git
cd Figma-Context-MCP
pnpm install

# Development
pnpm dev          # Watch mode
pnpm test         # Run tests (272 test cases)
pnpm lint         # Lint code
pnpm build        # Build

# Debug
pnpm inspect      # MCP Inspector

# Test with your own Figma data
pnpm tsx scripts/fetch-test-data.ts <fileKey> <nodeId> <outputName>

# Commit (uses conventional commits)
git commit -m "feat: add new feature"
```

### Commit Types

| Type       | Description   |
| ---------- | ------------- |
| `feat`     | New feature   |
| `fix`      | Bug fix       |
| `docs`     | Documentation |
| `style`    | Code style    |
| `refactor` | Refactoring   |
| `test`     | Tests         |
| `chore`    | Maintenance   |

### Testing with Your Own Figma Data

You can test the layout detection and optimization with your own Figma designs:

#### 1. Configure Environment Variables

```bash
# Copy the environment template
cp .env.example .env

# Edit .env file with your configuration
FIGMA_API_KEY=your_figma_api_key_here
TEST_FIGMA_FILE_KEY=your_file_key      # Optional
TEST_FIGMA_NODE_ID=your_node_id        # Optional
```

#### 2. Fetch Figma Node Data

```bash
# Method 1: Using command line arguments (recommended)
pnpm tsx scripts/fetch-test-data.ts <fileKey> <nodeId> <outputName>

# Example: Fetch a specific node
pnpm tsx scripts/fetch-test-data.ts UgtwrncR3GokKDIS7dpm4Z 402-34955 my-design

# Method 2: Using environment variables
TEST_FIGMA_FILE_KEY=xxx TEST_FIGMA_NODE_ID=123-456 pnpm tsx scripts/fetch-test-data.ts
```

**Parameters:**

| Parameter    | Description           | How to Get                                                   |
| ------------ | --------------------- | ------------------------------------------------------------ |
| `fileKey`    | Figma file identifier | Part after `/design/` in URL, e.g., `UgtwrncR3GokKDIS7dpm4Z` |
| `nodeId`     | Node ID               | `node-id=` parameter in URL, e.g., `402-34955`               |
| `outputName` | Output filename       | Custom name, e.g., `my-design`                               |

**Example URL Parsing:**

```
https://www.figma.com/design/UgtwrncR3GokKDIS7dpm4Z/MyProject?node-id=402-34955
                            ↑ fileKey                              ↑ nodeId
```

#### 3. Run Tests to Validate Output

```bash
# Run all tests
pnpm test

# Run only integration tests (validate layout optimization)
pnpm test tests/integration/

# View output JSON files
ls tests/fixtures/figma-data/
```

#### 4. Analyze Optimization Results

Tests automatically validate:

- **Data Compression** - Typically >50% compression
- **Layout Detection** - Flex/Grid layout recognition rate
- **CSS Properties** - Redundant property cleanup
- **Output Quality** - Structural consistency checks

If tests fail, the output may not meet expectations. Check error messages to adjust or report an issue.

---

## License

[MIT](./LICENSE) © 1yhy

## Acknowledgments

- [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP) - Original project
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification
- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) - README template reference

---

<p align="center">
  Made with ❤️ for the AI coding community
</p>
