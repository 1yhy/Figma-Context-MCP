# Contributing to Figma Context MCP

Thank you for your interest in contributing to Figma Context MCP! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors from all backgrounds and experience levels.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/Figma-Context-MCP.git`
3. Add upstream remote: `git remote add upstream https://github.com/1yhy/Figma-Context-MCP.git`

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run in development mode (with watch)
pnpm dev
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test suites
pnpm test:layout    # Layout detection tests
pnpm test:icon      # Icon detection tests
pnpm test:all       # All tests including final output
```

### Code Quality

```bash
# Type checking
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix

# Formatting
pnpm format
```

## Making Changes

1. Create a new branch from `main`:

   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. Make your changes following the code style guidelines

3. Test your changes locally

4. Commit your changes following the commit guidelines

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type       | Description                                        |
| ---------- | -------------------------------------------------- |
| `feat`     | New feature                                        |
| `fix`      | Bug fix                                            |
| `docs`     | Documentation only                                 |
| `style`    | Code style (formatting, missing semi-colons, etc.) |
| `refactor` | Code refactoring (no functional changes)           |
| `perf`     | Performance improvement                            |
| `test`     | Adding or updating tests                           |
| `chore`    | Maintenance tasks                                  |

### Examples

```bash
feat(layout): add support for grid layout detection
fix(parser): handle empty node arrays correctly
docs: update installation instructions
refactor(core): simplify node processing logic
```

## Pull Request Process

1. Update documentation if needed
2. Ensure all tests pass: `pnpm test`
3. Ensure code quality checks pass: `pnpm lint && pnpm type-check`
4. Fill out the pull request template completely
5. Request review from maintainers

### PR Title

Use the same format as commit messages:

```
feat(layout): add support for grid layout detection
```

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types for public functions
- Avoid `any` - use `unknown` if type is truly unknown

### Formatting

- We use Prettier for code formatting
- Run `pnpm format` before committing
- EditorConfig is provided for consistent editor settings

### File Organization

```
src/
├── algorithms/     # Detection algorithms (layout, icon)
├── core/           # Core parsing logic
├── services/       # External services (Figma API, cache)
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

### Naming Conventions

| Type       | Convention                            | Example              |
| ---------- | ------------------------------------- | -------------------- |
| Files      | kebab-case                            | `layout-detector.ts` |
| Classes    | PascalCase                            | `LayoutOptimizer`    |
| Functions  | camelCase                             | `detectLayout()`     |
| Constants  | UPPER_SNAKE_CASE                      | `MAX_ICON_SIZE`      |
| Interfaces | PascalCase with `I` prefix (optional) | `SimplifiedNode`     |

## Questions?

If you have questions, feel free to:

- Open an issue with the "question" label
- Check existing issues and discussions

Thank you for contributing!
