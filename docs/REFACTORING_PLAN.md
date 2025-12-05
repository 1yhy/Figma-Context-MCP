# Figma-Context-MCP 项目重构计划

## 一、当前问题总结

### 1.1 结构问题
- 测试文件过多 (11个)，缺乏统一框架
- 布局相关代码分散在 3 个文件 (50KB+)
- `simplify-node-response.ts` 混合了类型定义和业务逻辑 (21KB)
- `utils/` 目录是杂物箱 (70KB)

### 1.2 代码规范问题
- 参数命名不清晰 (`n`, `e`, `c`)
- 动词使用不一致 (`build` vs `create` vs `generate`)
- 部分死代码未清理

### 1.3 文档问题
- 缺乏清晰的项目架构说明
- API 文档不完整

## 二、目标架构

```
figma-context-mcp/
├── src/
│   ├── index.ts                    # 入口
│   ├── server.ts                   # MCP 服务器
│   ├── config.ts                   # 配置管理
│   │
│   ├── types/                      # 类型定义 (新建)
│   │   ├── index.ts                # 类型导出
│   │   ├── figma.ts                # Figma 相关类型
│   │   └── simplified.ts           # 简化后的类型
│   │
│   ├── services/                   # 外部服务
│   │   ├── figma.ts                # Figma API
│   │   └── cache.ts                # 缓存服务
│   │
│   ├── core/                       # 核心处理 (重命名 transformers)
│   │   ├── parser.ts               # 响应解析 (从 simplify-node-response 拆分)
│   │   ├── layout.ts               # 布局转换
│   │   ├── style.ts                # 样式转换
│   │   └── effects.ts              # 特效转换
│   │
│   ├── algorithms/                 # 算法模块 (新建)
│   │   ├── layout/                 # 布局检测算法
│   │   │   ├── index.ts            # 导出
│   │   │   ├── detector.ts         # 布局检测
│   │   │   ├── optimizer.ts        # 布局优化
│   │   │   └── spatial.ts          # 空间分析
│   │   └── icon/                   # 图标检测算法
│   │       ├── index.ts            # 导出
│   │       └── detector.ts         # 图标检测
│   │
│   └── utils/                      # 工具函数 (精简)
│       ├── color.ts                # 颜色处理
│       ├── css.ts                  # CSS 工具
│       ├── file.ts                 # 文件工具
│       └── validation.ts           # 类型守卫
│
├── tests/                          # 测试目录 (重组)
│   ├── unit/                       # 单元测试
│   │   ├── algorithms/
│   │   │   ├── layout.test.ts
│   │   │   └── icon.test.ts
│   │   └── core/
│   │       └── parser.test.ts
│   ├── integration/                # 集成测试
│   │   └── figma-api.test.ts
│   ├── fixtures/                   # 测试数据
│   │   └── figma-response.json
│   └── utils/                      # 测试工具
│       └── preview-generator.ts
│
├── docs/                           # 文档
│   ├── architecture.md             # 架构说明
│   ├── algorithms.md               # 算法说明
│   └── api.md                      # API 文档
│
└── 配置文件
    ├── package.json
    ├── tsconfig.json
    ├── tsup.config.ts
    └── vitest.config.ts            # 测试配置 (新增)
```

## 三、重构步骤

### Phase 1: 类型整理 (30min)
1. 创建 `src/types/` 目录
2. 从 `simplify-node-response.ts` 提取类型到 `types/simplified.ts`
3. 更新所有导入

### Phase 2: 算法模块化 (45min)
1. 创建 `src/algorithms/layout/` 目录
2. 移动并重命名:
   - `layout-detection.ts` → `algorithms/layout/detector.ts`
   - `spatial-projection.ts` → `algorithms/layout/spatial.ts`
   - `layout-optimizer.ts` → `algorithms/layout/optimizer.ts`
3. 创建 `src/algorithms/icon/` 目录
4. 移动 `icon-detection.ts` → `algorithms/icon/detector.ts`

### Phase 3: 核心模块重组 (30min)
1. 重命名 `transformers/` → `core/`
2. 从 `simplify-node-response.ts` 提取解析逻辑到 `core/parser.ts`
3. 清理 `node.ts` (合并到其他模块或删除)

### Phase 4: 工具函数精简 (20min)
1. 合并颜色相关函数到 `utils/color.ts`
2. 合并 CSS 相关函数到 `utils/css.ts`
3. 删除 `svg.ts` (已废弃)
4. 精简 `identity.ts` → `utils/validation.ts`

### Phase 5: 测试重组 (30min)
1. 创建 `tests/` 目录结构
2. 合并测试文件:
   - `test-layout-detection.ts` + `test-full-layout-analysis.ts` → `tests/unit/algorithms/layout.test.ts`
   - `test-icon-detection.ts` + `test-final-output.ts` → `tests/unit/algorithms/icon.test.ts`
   - `test-cache.ts` + `test-image-download.ts` → `tests/integration/figma-api.test.ts`
3. 移动测试数据到 `tests/fixtures/`
4. 删除冗余测试文件

### Phase 6: 文档更新 (20min)
1. 更新 `README.md` - 添加架构说明
2. 创建 `docs/architecture.md` - 详细架构
3. 更新 `CLAUDE.md` - 项目指南

### Phase 7: 验证 (15min)
1. 运行构建 `pnpm build`
2. 运行测试 `pnpm test`
3. 验证 MCP 服务

## 四、命名规范

### 4.1 文件命名
- 使用 kebab-case: `layout-detector.ts`
- 测试文件: `*.test.ts`
- 类型文件: `*.types.ts` 或放在 `types/` 目录

### 4.2 变量命名
```typescript
// ❌ 不推荐
function process(n: Node, e: Effect) {}

// ✅ 推荐
function process(node: Node, effect: Effect) {}
```

### 4.3 函数命名动词规范
| 动词 | 用途 | 示例 |
|------|------|------|
| `parse` | 解析原始数据 | `parseResponse()` |
| `transform` | 转换数据格式 | `transformNode()` |
| `detect` | 检测/识别 | `detectLayout()` |
| `optimize` | 优化处理 | `optimizeCSS()` |
| `build` | 构建复杂对象 | `buildStyles()` |
| `format` | 格式化输出 | `formatColor()` |
| `validate` | 验证数据 | `validateNodeId()` |

### 4.4 类型命名
```typescript
// 接口: I 前缀 (可选) 或直接 PascalCase
interface SimplifiedNode {}
interface FigmaNode {}

// 类型别名: PascalCase
type CSSStyle = {}
type ExportFormat = 'PNG' | 'SVG'

// 常量: SCREAMING_SNAKE_CASE
const MAX_ICON_SIZE = 300
const SVG_NODE_TYPES = ['VECTOR', 'ELLIPSE'] as const
```

## 五、测试文件合并对照表

| 原文件 | 目标文件 | 操作 |
|--------|----------|------|
| test-layout-detection.ts | tests/unit/algorithms/layout.test.ts | 合并 |
| test-full-layout-analysis.ts | tests/unit/algorithms/layout.test.ts | 合并 |
| test-icon-detection.ts | tests/unit/algorithms/icon.test.ts | 合并 |
| test-final-output.ts | tests/unit/algorithms/icon.test.ts | 合并 |
| test-cache.ts | tests/integration/figma-api.test.ts | 合并 |
| test-image-download.ts | tests/integration/figma-api.test.ts | 合并 |
| test-merged-icon-download.ts | tests/integration/figma-api.test.ts | 合并 |
| test-simplify.ts | tests/unit/core/parser.test.ts | 移动 |
| generate-html-preview.ts | tests/utils/preview-generator.ts | 移动 |
| run-simplification.ts | tests/utils/run-simplification.ts | 移动 |
| verify-optimizations.ts | 删除 | 功能合并到其他测试 |

## 六、待删除文件

```
src/utils/svg.ts                    # 已废弃，被 icon-detection 替代
test/test-output/*.json             # 移动到 fixtures
test/test-output/*.html             # 仅保留一个示例
docs/research-*.md                  # 合并到 docs/algorithms.md
```

## 七、预期成果

- **代码量**: 200KB → ~180KB (-10%)
- **测试文件**: 11 个 → 4 个 (-64%)
- **目录层级**: 更清晰的模块划分
- **可维护性**: 显著提升
- **新手友好**: 清晰的入口和文档

---

*计划创建时间: 2025-12-05*
*预计执行时间: 3-4 小时*
