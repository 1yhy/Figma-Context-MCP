# 功能增强待办清单

> 渐进式迭代优化计划

## 已完成

- [x] Grid 布局检测算法实现
- [x] Grid 集成到 layout optimizer
- [x] 拆分 `convertAlign` 为 `convertJustifyContent` 和 `convertAlignItems`
- [x] 单元测试覆盖 (88 tests)

---

## 待办事项

### 1. 性能优化 (大型设计文件)

#### 1.1 节点缓存机制

- [ ] 实现 LRU 缓存策略
- [ ] 缓存已解析的节点树
- [ ] 添加缓存失效策略 (基于文件修改时间)

#### 1.2 懒加载/分页获取

- [ ] 支持按深度级别获取节点
- [ ] 实现分页 API (`offset`, `limit`)
- [ ] 添加 `shallow` 模式 (只获取直接子节点)

#### 1.3 算法优化

- [ ] 优化递归遍历 (尾递归/迭代)
- [ ] 减少不必要的节点复制
- [ ] 并行处理独立子树

---

### 2. CSS 属性支持

#### 2.1 Transform 变换

- [ ] `transform: rotate()`
- [ ] `transform: scale()`
- [ ] `transform: skew()`
- [ ] `transform: translate()`
- [ ] `transform-origin`

#### 2.2 滤镜效果

- [ ] `filter: blur()`
- [ ] `filter: drop-shadow()`
- [ ] `filter: brightness()`, `contrast()`, `saturate()`
- [ ] `backdrop-filter`

#### 2.3 混合模式

- [ ] `mix-blend-mode`
- [ ] `isolation`

#### 2.4 溢出处理

- [ ] `overflow` (visible, hidden, scroll, auto)
- [ ] `overflow-x`, `overflow-y`
- [ ] `text-overflow: ellipsis`
- [ ] `white-space: nowrap`

#### 2.5 其他常用属性

- [ ] `cursor`
- [ ] `pointer-events`
- [ ] `user-select`
- [ ] `visibility`
- [ ] `clip-path`

---

### 3. 布局增强

#### 3.1 Grid 布局增强

- [ ] 支持 `grid-area` 命名区域
- [ ] 支持 `auto-fill` / `auto-fit`
- [ ] 支持 `minmax()`
- [ ] 支持不规则网格 (span)

#### 3.2 Flex 布局增强

- [ ] 更精准的 `flex-grow` / `flex-shrink` 检测
- [ ] 支持 `flex-wrap: wrap`
- [ ] 支持 `align-content`

#### 3.3 定位增强

- [ ] 检测 `position: sticky` 场景
- [ ] 支持 `z-index` 层级推断
- [ ] 检测固定定位元素 (header, footer)

---

### 4. 智能检测

#### 4.1 组件识别

- [ ] 按钮组件检测
- [ ] 输入框组件检测
- [ ] 卡片组件检测
- [ ] 导航栏检测
- [ ] 列表/表格检测

#### 4.2 响应式推断

- [ ] 检测可能的断点
- [ ] 推断弹性宽度 vs 固定宽度
- [ ] 建议媒体查询

---

### 5. 代码生成优化

#### 5.1 CSS 输出优化

- [ ] CSS 变量提取 (颜色、间距、字体)
- [ ] 类名语义化
- [ ] 减少冗余样式

#### 5.2 框架适配

- [ ] Tailwind CSS 类名生成
- [ ] CSS Modules 支持
- [ ] Styled Components 模板

---

## 优先级建议

| 优先级 | 任务                | 原因           |
| ------ | ------------------- | -------------- |
| P0     | 性能优化 - 缓存机制 | 大文件卡顿问题 |
| P0     | Transform 变换支持  | 常用属性缺失   |
| P1     | 滤镜效果支持        | 视觉效果还原   |
| P1     | 溢出处理            | 文本截断常见   |
| P2     | Grid 布局增强       | 复杂布局支持   |
| P2     | 组件识别            | 提升代码质量   |
| P3     | 响应式推断          | 高级功能       |
| P3     | 框架适配            | 可选增强       |

---

## 贡献指南

1. 选择一个待办项
2. 创建 feature 分支
3. 实现功能 + 单元测试
4. 提交 PR

---

_最后更新: 2025-12-05_
