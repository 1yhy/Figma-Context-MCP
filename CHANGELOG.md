# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-01-06

### Added

- **Grid Layout Detection** - Automatically detect and convert grid-like arrangements to CSS Grid
- **Background Element Merging** - Smart merge of background layers with padding inference
- **Multi-layer Cache System** - LRU memory cache (L1) + disk cache (L2) for 24h data persistence
- **MCP Resources** - Lightweight resource endpoints (`figma://file`, `/styles`, `/components`, `/assets`) for token-efficient metadata browsing
- **MCP Prompts** - Professional `design_to_code` prompt for guided AI code generation workflow
- **Comprehensive Test Suite** - 272 tests covering layout optimization, icon detection, parser, and resources (Vitest)

### Changed

- **Improved Flexbox Detection** - Enhanced stack detection with better gap/padding inference
- **Icon Detection Optimization** - Single-pass tree traversal for better performance
- **Modular Architecture** - Reorganized codebase (`transformers` → `core/algorithms`) for better maintainability
- **Bilingual Documentation** - Complete English and Chinese docs for all algorithms and architecture

### Fixed

- **Gradient Alpha Channel** - Preserve alpha values in gradient color stops
- **Non-grid Element Positioning** - Correct position handling for elements outside grid containers
- **Security Dependencies** - Updated dependencies to resolve vulnerabilities

## [1.0.1] - 2024-12-05

### Added

- Smart layout detection algorithm (Flexbox inference from absolute positioning)
- Icon layer merge algorithm (reduces fragmented exports by 96%)
- CSS generation with optimized output
- HTML preview generation from Figma JSON
- Comprehensive documentation for algorithms

### Changed

- Optimized data structures for AI consumption
- Reduced output size by ~87% through intelligent simplification
- Improved node processing with better type handling

### Fixed

- Round all px values to integers
- Proper handling of gradient and image fills
- Border style extraction improvements

## [1.0.0] - 2024-12-01

### Added

- Initial release
- MCP server implementation for Figma integration
- `get_figma_data` tool for fetching design data
- `download_figma_images` tool for image export
- Support for stdio and HTTP/SSE modes
- Basic CSS style generation
- Figma API integration with caching

[1.1.0]: https://github.com/1yhy/Figma-Context-MCP/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/1yhy/Figma-Context-MCP/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/1yhy/Figma-Context-MCP/releases/tag/v1.0.0
