# Figma MCP Server

> This project is an enhanced version of the open-source [Figma-Context-MCP](https://github.com/GLips/Figma-Context-MCP), providing localization support and additional features.

English | [中文版](./README.md)

A server based on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) that enables seamless integration of Figma design files with AI coding tools like [Cursor](https://cursor.sh/), [Windsurf](https://codeium.com/windsurf), [Cline](https://cline.bot/), and more.

When AI tools can access Figma design data, they can generate code that accurately matches designs in a single pass, performing much better than traditional methods like screenshots.

## Key Enhancements Over the Original

- Optimized data structures and conversion logic

## Features

- Extract structured design information from Figma files
- Convert Figma styles to CSS properties with high fidelity
- Automatically handle image exports and provide optimized image references
- Support both HTTP and command-line modes for flexible integration
- Simplify design data to provide only the most relevant information to AI models

## Installation

### Method 1: Install from NPM (Recommended)

```bash
# Global installation
npm install -g @yhy2001/figma-mcp-server

# Start the service
figma-mcp --figma-api-key=<your-figma-api-key>
```

### Method 2: Install from Local Package

```bash
# Global installation of local package
npm install -g ./figma-mcp-server-1.0.0.tgz

# Start the service
figma-mcp --figma-api-key=<your-figma-api-key>
```

### Method 3: Use in a Project

```bash
# Install in a project
npm install @yhy2001/figma-mcp-server --save

# Add to package.json scripts:
# "figma-mcp": "figma-mcp --figma-api-key=<your-figma-api-key>"

# Or run directly with npx
npx figma-mcp --figma-api-key=<your-figma-api-key>
```

## Connecting with AI Tools

### Configuration Example

Most AI tools that support MCP require a configuration file. Below is a standard example:

```json
# Use in MCP Client
{
  "mcpServers": {
    "Figma MCP": {
      "command": "npx",
      "args": ["@yhy2001/figma-mcp-server", "--figma-api-key=<your-figma-api-key>", "--stdio"]
    }
  }
}

# Use in Local
{
  "mcpServers": {
    "Figma MCP": {
      "url": "http://localhost:3333/sse",
      "env": {
        "API_KEY": "your_key"
      }
    }
  }
}
```

### Connecting with Cursor

1. Install and start Cursor
2. Go to Settings → Features
3. In the "Model Context Protocol" section, enter the MCP server URL or update your config file at `~/.cursor/mcp.json`
4. Restart Cursor
5. In the Composer (Agent mode), you can now paste a Figma link and ask the AI to implement it

## Switching Modes

The MCP server can run in two modes:

### HTTP Mode (Default)

```bash
figma-mcp --figma-api-key=<your-figma-api-key>
```

This starts an HTTP server on port 3333 that provides SSE endpoints.

### Command Mode

```bash
figma-mcp --figma-api-key=<your-figma-api-key> --stdio
```

This mode is used when the service is launched by AI tools via command line.

## Design Data Format

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

## Data Structure Reference

### SimplifiedDesign
The top-level structure of the design file, containing basic information and all visible nodes.

### SimplifiedNode
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

## License

MIT
