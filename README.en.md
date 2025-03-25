# Figma MCP Server

> This project is an improved version of the open-source [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP), with optimized data structures and conversion logic.

English | [中文版](./README.md)

This is a server based on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) that enables seamless integration of Figma design files with AI coding tools like [Cursor](https://cursor.sh/), [Windsurf](https://codeium.com/windsurf), [Cline](https://cline.bot/), and more.

When AI tools can access Figma design data, they can generate code that accurately matches designs in a single pass, performing much better than traditional methods like screenshots.

## Features

- Convert Figma design data into AI model-friendly formats
- Support retrieving layout and style information for Figma files, artboards, or components
- Support downloading images and icon resources from Figma
- Reduce the context provided to models, improving AI response accuracy and relevance

## Key Differences from Original Version

### Design Data Return Format

```json
{
  // Design file basic information
  "name": "Design file name",
  "lastModified": "Last modification time",
  "thumbnailUrl": "Thumbnail URL",

  // Node array containing all page elements
  "nodes": [
    {
      // Node basic information
      "id": "Node ID, e.g. 1:156",
      "name": "Node name",
      "type": "Node type, such as FRAME, TEXT, RECTANGLE, GROUP, etc.",

      // Text content (only for text nodes)
      "text": "Content of text node",

      // CSS style object containing all style properties
      "cssStyles": {
        // Dimensions and position
        "width": "100px",
        "height": "50px",
        "position": "absolute",
        "left": "10px",
        "top": "20px",

        // Text styles (mainly for TEXT nodes)
        "fontFamily": "Inter",
        "fontSize": "16px",
        "fontWeight": 500,
        "textAlign": "center",
        "lineHeight": "24px",
        "color": "#333333",

        // Background and borders
        "backgroundColor": "#ffffff",
        "borderRadius": "8px",
        "border": "1px solid #eeeeee",

        // Effects
        "boxShadow": "0px 4px 8px rgba(0, 0, 0, 0.1)",

        // Other CSS properties...
      },

      // Fill information (gradients, images, etc.)
      "fills": [
        {
          "type": "SOLID",
          "color": "#ff0000",
          "opacity": 0.5
        }
      ],

      // Export information (for image and SVG nodes)
      "exportInfo": {
        "type": "IMAGE",
        "format": "PNG",
        "nodeId": "Node ID",
        "fileName": "suggested-file-name.png"
      },

      // Child nodes
      "children": [
        // Recursive node objects...
      ]
    }
  ]
}
```

### Data Structure Description

#### SimplifiedDesign
The top-level structure of the design file, containing basic information and all visible nodes.

#### SimplifiedNode
Represents an element in the design, which can be an artboard, frame, text, or shape. Key fields include:
- `id`: Unique node identifier
- `name`: Node name in Figma
- `type`: Node type (FRAME, TEXT, RECTANGLE, etc.)
- `text`: Text content (text nodes only)
- `cssStyles`: CSS style object containing all style properties
- `fills`: Fill information array
- `exportInfo`: Export information (image and SVG nodes)
- `children`: Array of child nodes

### CSSStyle
Contains CSS style properties converted to web standards, such as fonts, colors, borders, shadows, etc.

### ExportInfo
Export information for image and SVG nodes, including:
- `type`: Export type (IMAGE or IMAGE_GROUP)
- `format`: Recommended export format (PNG, JPG, SVG)
- `nodeId`: Node ID for API calls
- `fileName`: Suggested file name

## Installation and Usage

### Local Development and Packaging

1. Clone this repository
2. Install dependencies: `pnpm install`
3. Copy `.env.example` to `.env` and fill in your [Figma API access token](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens)
4. Local development: `pnpm run dev`
5. Build project: `pnpm run build`
6. Local packaging: `pnpm run publish:local`

After packaging, a `.tgz` file will be generated in the project root directory, like `figma-mcp-server-1.0.0.tgz`

### Local Installation and Usage

There are three ways to use this service:

#### Method 1: Install from NPM (Recommended)

```bash
# Global installation
npm install -g @yhy2001/figma-mcp-server

# Start the service
figma-mcp --figma-api-key=<your-figma-api-key>
```

#### Method 2: Install from Local Package

```bash
# Global installation of local package
npm install -g ./figma-mcp-server-1.0.0.tgz

# Start the service
figma-mcp --figma-api-key=<your-figma-api-key>
```

#### Method 3: Use in a Project

```bash
# Install in project
npm install @yhy2001/figma-mcp-server --save

# Add to package.json scripts
# "start-figma-mcp": "figma-mcp --figma-api-key=<your-figma-api-key>"

# Or run directly
npx figma-mcp --figma-api-key=<your-figma-api-key>
```

### Command Line Arguments

- `--version`: Show version number
- `--figma-api-key`: Your Figma API access token (required)
- `--port`: Port for the server to run on (default: 3333)
- `--stdio`: Run server in command mode instead of default HTTP/SSE mode
- `--help`: Show help menu

## Connecting with AI Tools

### Using in Configuration Files

Many tools like Cursor, Windsurf, and Claude Desktop use configuration files to start MCP servers.
You can add the following to your configuration file:

```json
# Use in MCP Client
{
  "mcpServers": {
    "Figma MCP": {
      "command": "npx",
      "args": ["figma-mcp", "--figma-api-key=<your-figma-api-key>", "--stdio"]
    }
  }
}

# Use in Local
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

### Connecting with Cursor

1. Start the server: `figma-mcp --figma-api-key=<your-figma-api-key>`
2. Connect MCP server in Cursor's Settings → Features tab: `http://localhost:3333`
3. After confirming successful connection, use Composer in Agent mode
4. Paste Figma file link and ask Cursor to implement the design

## Available Tools

The server provides the following MCP tools:

### get_figma_data

Get information about a Figma file or specific node.

Parameters:
- `fileKey`: The key of the Figma file
- `nodeId`: Node ID (strongly recommended)
- `depth`: How deep to traverse the node tree

### download_figma_images

Download image and icon resources from a Figma file.

Parameters:
- `fileKey`: The key of the Figma file containing the node
- `nodes`: Array of image nodes to fetch
- `localPath`: Directory path in the project where images are stored

## License

MIT
