# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Comprehensive project configuration (ESLint, Prettier, Husky, Commitlint)
- GitHub Actions CI/CD workflow
- Issue and PR templates
- Contributing guidelines
- Bilingual documentation (English/Chinese)

### Changed

- Refactored codebase structure with modular architecture
- Updated ESLint to flat config format
- Improved TypeScript type safety

### Fixed

- All ESLint errors resolved
- Type narrowing issues in parser module

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

[Unreleased]: https://github.com/1yhy/Figma-Context-MCP/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/1yhy/Figma-Context-MCP/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/1yhy/Figma-Context-MCP/releases/tag/v1.0.0
