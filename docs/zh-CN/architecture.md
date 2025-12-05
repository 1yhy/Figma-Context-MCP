# 架构设计

本文档描述 Figma-Context-MCP 的架构设计。

## 概述

Figma-Context-MCP 是一个 MCP (Model Context Protocol) 服务器，用于连接 Figma 设计与 AI 编程工具。它从 Figma API 获取设计数据，简化复杂的节点结构，并提供优化后的输出供 AI 使用。

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AI 客户端     │────▶│   MCP 服务器    │────▶│   Figma API     │
│ (Cursor 等)    │◀────│                 │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 目录结构

```
src/
├── index.ts                 # 入口文件
├── server.ts                # MCP 服务器实现
├── config.ts                # 配置管理
│
├── types/                   # TypeScript 类型定义
│   ├── figma.ts             # Figma API 类型
│   └── simplified.ts        # 简化输出类型
│
├── services/                # 外部服务集成
│   ├── figma.ts             # Figma API 客户端
│   ├── cache.ts             # 响应缓存
│   └── simplify-node-response.ts  # 主协调器
│
├── core/                    # 核心转换逻辑
│   ├── parser.ts            # 节点解析与转换
│   ├── style.ts             # CSS 样式生成
│   ├── layout.ts            # 布局属性转换
│   └── effects.ts           # 视觉效果处理
│
├── algorithms/              # 专用算法
│   ├── layout/              # 布局检测
│   │   ├── detector.ts      # 从绝对定位推断 Flexbox
│   │   ├── optimizer.ts     # CSS 优化
│   │   └── spatial.ts       # 空间分析工具
│   └── icon/                # 图标检测
│       └── detector.ts      # 向量图层合并
│
└── utils/                   # 工具函数
    ├── color.ts             # 颜色格式转换
    ├── css.ts               # CSS 生成辅助
    ├── file.ts              # 文件路径工具
    └── validation.ts        # 类型守卫与验证器
```

## 数据流

```
Figma API 响应 (94KB)
         │
         ▼
┌─────────────────────────────────────┐
│         parseFigmaResponse          │
│  (simplify-node-response.ts)        │
├─────────────────────────────────────┤
│  1. 递归解析节点                     │
│  2. 应用图标检测                     │
│  3. 应用布局检测                     │
│  4. 生成 CSS 样式                    │
│  5. 移除不必要的属性                 │
└─────────────────────────────────────┘
         │
         ▼
简化输出 (10KB, 减少约 89%)
```

## 核心组件

### MCP 服务器 (`server.ts`)

实现 Model Context Protocol，提供两个工具：

- **`get_figma_data`**: 获取并简化 Figma 设计数据
- **`download_figma_images`**: 从设计中下载图片/图标

支持 stdio 和 HTTP/SSE 两种传输模式。

### 解析器 (`core/parser.ts`)

主要的转换引擎，负责：

- 递归处理 Figma 节点树
- 提取相关属性（边界、填充、描边、效果）
- 为每个节点生成 CSS 样式
- 过滤不可见或无关的节点

### 布局检测 (`algorithms/layout/`)

从绝对定位推断 Flexbox 布局：

```
输入: 带绝对定位的子元素
  ┌──────┐ ┌──────┐ ┌──────┐
  │  A   │ │  B   │ │  C   │
  └──────┘ └──────┘ └──────┘

输出: flex-direction: row; gap: 8px;
```

主要特性：

- 检测行/列布局
- 计算间距值
- 推断对齐方式（start、center、end）
- 处理嵌套布局

### 图标检测 (`algorithms/icon/`)

识别应作为单个图标导出的向量组：

```
输入:
  GROUP "搜索图标"
    ├── ELLIPSE (圆圈)
    └── LINE (手柄)

输出: { shouldMerge: true, exportFormat: "SVG" }
```

优势：

- 减少 96% 的碎片化导出
- 确定最佳导出格式（SVG 或 PNG）
- 尊重设计师指定的导出设置

### CSS 生成 (`core/style.ts`)

将 Figma 属性转换为 CSS：

| Figma 属性     | CSS 输出                               |
| -------------- | -------------------------------------- |
| `fills`        | `background-color`, `background-image` |
| `strokes`      | `border`                               |
| `effects`      | `box-shadow`, `filter`                 |
| `cornerRadius` | `border-radius`                        |
| `opacity`      | `opacity`                              |

## 缓存

缓存服务 (`services/cache.ts`) 实现了：

- 带 TTL 的内存缓存
- 基于文件的图片缓存
- 自动缓存失效

## 测试

```
tests/
├── unit/                    # 单元测试
│   └── algorithms/
│       ├── layout.test.ts   # 布局检测测试
│       └── icon.test.ts     # 图标检测测试
├── integration/             # 集成测试
│   └── parser.test.ts       # 端到端解析测试
├── fixtures/                # 测试数据
│   └── real-node-data.json  # Figma 响应样本
└── utils/                   # 测试工具
    ├── viewer.html          # 可视化对比工具
    └── preview.ts           # 预览生成器
```

运行测试：

```bash
pnpm test           # 所有测试
pnpm test:unit      # 仅单元测试
pnpm test:coverage  # 带覆盖率报告
pnpm preview        # 可视化对比
```

## 性能

| 指标           | 数值   |
| -------------- | ------ |
| 响应大小减少   | ~89%   |
| 图标碎片化减少 | 96%    |
| 平均处理时间   | <100ms |
