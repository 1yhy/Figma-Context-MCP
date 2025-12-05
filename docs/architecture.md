# Architecture

This document describes the architecture of Figma-Context-MCP.

## Overview

Figma-Context-MCP is an MCP (Model Context Protocol) server that bridges Figma designs with AI coding tools. It fetches design data from Figma API, simplifies the complex node structure, and provides optimized output for AI consumption.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AI Client     │────▶│   MCP Server    │────▶│   Figma API     │
│ (Cursor, etc.)  │◀────│                 │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Directory Structure

```
src/
├── index.ts                 # Entry point
├── server.ts                # MCP server implementation
├── config.ts                # Configuration management
│
├── types/                   # TypeScript type definitions
│   ├── figma.ts             # Figma API types
│   └── simplified.ts        # Simplified output types
│
├── services/                # External service integrations
│   ├── figma.ts             # Figma API client
│   ├── cache.ts             # Response caching
│   └── simplify-node-response.ts  # Main orchestrator
│
├── core/                    # Core transformation logic
│   ├── parser.ts            # Node parsing and transformation
│   ├── style.ts             # CSS style generation
│   ├── layout.ts            # Layout property conversion
│   └── effects.ts           # Visual effects handling
│
├── algorithms/              # Specialized algorithms
│   ├── layout/              # Layout detection
│   │   ├── detector.ts      # Flexbox inference from absolute positioning
│   │   ├── optimizer.ts     # CSS optimization
│   │   └── spatial.ts       # Spatial analysis utilities
│   └── icon/                # Icon detection
│       └── detector.ts      # Vector layer merging
│
└── utils/                   # Utility functions
    ├── color.ts             # Color format conversion
    ├── css.ts               # CSS generation helpers
    ├── file.ts              # File path utilities
    └── validation.ts        # Type guards and validators
```

## Data Flow

```
Figma API Response (94KB)
         │
         ▼
┌─────────────────────────────────────┐
│         parseFigmaResponse          │
│  (simplify-node-response.ts)        │
├─────────────────────────────────────┤
│  1. Parse nodes recursively         │
│  2. Apply icon detection            │
│  3. Apply layout detection          │
│  4. Generate CSS styles             │
│  5. Remove unnecessary properties   │
└─────────────────────────────────────┘
         │
         ▼
Simplified Output (10KB, ~89% reduction)
```

## Key Components

### MCP Server (`server.ts`)

Implements the Model Context Protocol with two tools:

- **`get_figma_data`**: Fetches and simplifies Figma design data
- **`download_figma_images`**: Downloads images/icons from designs

Supports both stdio and HTTP/SSE transport modes.

### Parser (`core/parser.ts`)

The main transformation engine that:

- Recursively processes Figma node tree
- Extracts relevant properties (bounds, fills, strokes, effects)
- Generates CSS styles for each node
- Filters out invisible or irrelevant nodes

### Layout Detection (`algorithms/layout/`)

Infers Flexbox layout from absolute positioning:

```
Input: Children with absolute positions
  ┌──────┐ ┌──────┐ ┌──────┐
  │  A   │ │  B   │ │  C   │
  └──────┘ └──────┘ └──────┘

Output: flex-direction: row; gap: 8px;
```

Key features:

- Detects row/column layouts
- Calculates gap values
- Infers alignment (start, center, end)
- Handles nested layouts

### Icon Detection (`algorithms/icon/`)

Identifies vector groups that should be exported as single icons:

```
Input:
  GROUP "Search Icon"
    ├── ELLIPSE (circle)
    └── LINE (handle)

Output: { shouldMerge: true, exportFormat: "SVG" }
```

Benefits:

- Reduces fragmented exports by 96%
- Determines optimal export format (SVG vs PNG)
- Respects designer-specified export settings

### CSS Generation (`core/style.ts`)

Converts Figma properties to CSS:

| Figma Property | CSS Output                             |
| -------------- | -------------------------------------- |
| `fills`        | `background-color`, `background-image` |
| `strokes`      | `border`                               |
| `effects`      | `box-shadow`, `filter`                 |
| `cornerRadius` | `border-radius`                        |
| `opacity`      | `opacity`                              |

## Caching

The cache service (`services/cache.ts`) implements:

- In-memory caching with TTL
- File-based image caching
- Automatic cache invalidation

## Testing

```
tests/
├── unit/                    # Unit tests
│   └── algorithms/
│       ├── layout.test.ts   # Layout detection tests
│       └── icon.test.ts     # Icon detection tests
├── integration/             # Integration tests
│   └── parser.test.ts       # End-to-end parsing tests
├── fixtures/                # Test data
│   └── real-node-data.json  # Sample Figma response
└── utils/                   # Test utilities
    ├── viewer.html          # Visual comparison tool
    └── preview.ts           # Preview generator
```

Run tests:

```bash
pnpm test           # All tests
pnpm test:unit      # Unit tests only
pnpm test:coverage  # With coverage report
pnpm preview        # Visual comparison
```

## Performance

| Metric                       | Value  |
| ---------------------------- | ------ |
| Response size reduction      | ~89%   |
| Icon fragmentation reduction | 96%    |
| Average processing time      | <100ms |
