# 设计稿转代码 - 图片/图层识别算法研究报告

## 一、背景与问题

### 1.1 核心问题：碎片化图层 (Fragmented Layers)

在设计稿转代码的过程中，最常见的问题是 **碎片化图层**：
- 设计师创建一个图标时，会使用多个独立图层（矩形、圆形、路径等）组合
- 直接按图层生成代码会产生冗余的 DOM 结构
- 影响代码的可维护性、可读性和性能

**示例：一个简单的搜索图标**
```
设计稿结构（碎片化）:
├── Group "搜索图标"
│   ├── Ellipse (圆圈)
│   ├── Line (手柄)
│   └── Rectangle (装饰)

错误的代码输出:
<div class="search-icon">
  <div class="ellipse"></div>
  <div class="line"></div>
  <div class="rect"></div>
</div>

正确的代码输出:
<img src="search-icon.svg" alt="搜索" />
```

### 1.2 问题分类

| 问题类型 | 描述 | 检测难度 |
|---------|------|---------|
| 图层未合并 | 多个图层应合并为单一图片 | 中等 |
| 图层交叉重叠 | 图层位置有重叠 | 困难 |
| 复杂背景 | 背景与前景混合 | 困难 |
| Icon vs 布局元素 | 区分图标和页面结构元素 | 中等 |

---

## 二、业界解决方案

### 2.1 阿里 Imgcook

**官方链接**: https://www.imgcook.com/

**技术架构**:
```
设计稿输入 → CV分析 + NLP分析 → 智能识别 → 可视化干预 → 代码生成
```

**图层处理层次**:
1. **图层处理层**: 分离设计稿中的图层，整理元信息
2. **图层再加工层**: 规范化处理
3. **布局算法层**: 绝对定位 → Flex 布局
4. **语义化层**: 多维特征语义化表达

**Icon 识别方案**:
- 使用 **ResNet** 深度学习模型
- 训练集覆盖 105 种 icon 分类
- 模型测试集准确度: **83%**
- 支持图片聚类推测语义

**合并策略**:
- Sketch 插件提供 `merge` 功能
- 自动检测 + 人工可视化干预

**参考**:
- https://www.alibabacloud.com/blog/imgcook-intelligent-code-generation-from-design-drafts-with-a-100%25-accuracy-rate_598093

### 2.2 美团 UI2DSL

**官方链接**: https://tech.meituan.com/2021/03/25/ui2dsl-dsl2code.html

**核心理念**: 事前干预 > 事后修复

```
Imgcook: 自动处理 → 出错后可视化干预 (更智能,出错概率更大)
美团:    生成前可视化干预 → 更稳定,效果更好
```

**图层问题处理**:

| 问题 | 解决方案 |
|-----|---------|
| 图层未合并 | 提供工具快速合并删除冗余图层 |
| 图层交叉 | 检测工具 + 快速修复 |
| 复杂背景 | 边干预边生成 |

**布局生成算法**:
1. 将设计稿区域视为子区域
2. 基于图层位置/大小计算边缘坐标关系
3. 寻找切割点，递归切割
4. 横向切割 → 列布局，纵向切割 → 行布局
5. 直到所有子区域只剩不可切割的图层

### 2.3 UILM (浙江大学)

**论文**: UI Layers Merger: Merging UI Layers via Visual Learning and Boundary Prior

**GitHub**: https://github.com/zju-d3/UILM

**两阶段算法**:

```
阶段1: MAD (Merging Area Detector)
- 基于目标检测的合并区域检测
- 融入边界先验知识提升检测精度

阶段2: Layer Merging Algorithm
- 基于检测框的规则合并
- 将框内图层合并为单一组件
```

**局限性**:
- 假设边界框内所有图层都属于同一组
- 视觉重叠时可能误判背景图层

### 2.4 EGFE (ICSE 2024)

**论文**: EGFE: End-to-end Grouping of Fragmented Elements in UI Designs with Multimodal Learning

**GitHub**: https://github.com/test2975/EGFE

**创新点**:
- 端到端学习，避免两阶段误差累积
- Transformer 编码器建模 UI 元素关系
- 多模态表示学习 (视觉 + 结构信息)

**性能提升** (相比 UILM):
- Precision: +29.75%
- Recall: +31.07%
- F1-score: +30.39%

---

## 三、Figma 生态最佳实践

### 3.1 Icon 处理标准流程

```
1. 识别: 检测 Group/Frame 是否为 Icon 单元
2. 展平: Flatten 所有子图层为单一 Vector
3. 清理: 移除空图层、优化路径
4. 导出: SVG (路径化，无 stroke) 或 PNG
```

### 3.2 推荐 Figma 插件

| 插件 | 功能 | 链接 |
|-----|------|-----|
| Flatten for Icon | 一键展平，移除空图层 | figma.com/community/plugin/1466407474947737326 |
| Flatten Wizard | 合并重叠路径，简化结构 | figma.com/community/plugin/1513933733767623504 |
| IconLab | 清理优化 icon | figma.com/community/plugin/1470150361236399232 |
| Really Flatten Vectors | 深度展平为最少路径 | figma.com/community/plugin/1099596352042014853 |

### 3.3 SVG 导出标准

```
✅ 正确的 SVG:
- 所有形状展平为 <path> 元素
- 无 stroke，只有 fill
- 无 clip-path 或复杂 fill-rule
- 路径已优化合并

❌ 错误的 SVG:
- 保留原始 <rect>, <ellipse> 等元素
- 包含 stroke 属性
- 多余的嵌套 <g> 组
```

---

## 四、算法设计方案

### 4.1 检测条件

基于研究，Icon/可合并图层组应满足以下条件:

```typescript
interface IconDetectionCriteria {
  // 1. 容器类型
  containerTypes: ['GROUP', 'FRAME'];

  // 2. 尺寸约束 (典型 icon 尺寸范围)
  sizeConstraints: {
    maxWidth: 200,   // px
    maxHeight: 200,  // px
    minWidth: 8,     // 过小可能是装饰点
    minHeight: 8,
  };

  // 3. 子元素类型分析
  childAnalysis: {
    // 可合并的图形类型
    mergeableTypes: [
      'VECTOR', 'RECTANGLE', 'ELLIPSE',
      'LINE', 'POLYGON', 'STAR',
      'BOOLEAN_OPERATION', 'REGULAR_POLYGON'
    ],
    // 排除类型 (有这些则不合并)
    excludeTypes: ['TEXT', 'INSTANCE', 'COMPONENT'],
    // 可合并类型占比阈值
    mergeableRatioThreshold: 0.7,  // 70%
  };

  // 4. 结构约束
  structureConstraints: {
    maxDepth: 4,           // 最大嵌套深度
    minChildren: 1,        // 最少子元素
    maxChildren: 50,       // 最多子元素 (过多可能是布局容器)
  };

  // 5. 语义特征 (可选)
  semanticFeatures: {
    // 名称包含 icon 相关关键词
    iconKeywords: ['icon', 'logo', 'symbol', '图标', '箭头', 'arrow'],
    // 典型 icon 宽高比范围
    aspectRatioRange: [0.5, 2.0],
  };
}
```

### 4.2 合并决策流程

```
输入: Figma 节点树

对每个节点执行:
│
├─ 是容器节点 (GROUP/FRAME)?
│   ├─ 否 → 检查是否为独立 SVG 元素 → 标记 exportInfo
│   └─ 是 → 继续
│
├─ 尺寸在 Icon 范围内?
│   ├─ 否 → 递归处理子节点
│   └─ 是 → 继续
│
├─ 包含 TEXT/INSTANCE 子元素?
│   ├─ 是 → 递归处理子节点 (不合并)
│   └─ 否 → 继续
│
├─ 可合并类型占比 >= 70%?
│   ├─ 否 → 递归处理子节点
│   └─ 是 → 继续
│
├─ 嵌套深度 <= 4?
│   ├─ 否 → 递归处理子节点
│   └─ 是 → ✅ 标记为 Icon，整体导出
│
输出: 标记了 exportInfo 的节点树
```

### 4.3 导出格式选择

```typescript
function selectExportFormat(node: IconNode): 'SVG' | 'PNG' {
  // 1. 纯矢量图形 → SVG
  if (isAllVectorChildren(node)) {
    return 'SVG';
  }

  // 2. 包含图片填充 → PNG
  if (hasImageFill(node)) {
    return 'PNG';
  }

  // 3. 复杂效果 (阴影、模糊) → PNG
  if (hasComplexEffects(node)) {
    return 'PNG';
  }

  // 4. 默认 SVG
  return 'SVG';
}
```

---

## 五、实现计划

### 5.1 第一阶段: 基础检测

1. 扩展 `SVG_NODE_TYPES` 包含 `RECTANGLE`
2. 实现 `shouldMergeAsIcon()` 检测函数
3. 修改 `processSVGNodesBottomUp()` 使用新检测逻辑

### 5.2 第二阶段: 智能合并

1. 实现 `analyzeChildrenTypes()` 分析子元素类型分布
2. 实现 `calculateMergeScore()` 计算合并得分
3. 支持部分合并 (保留需要独立的子元素)

### 5.3 第三阶段: 双格式导出

1. 同时生成 SVG 和 PNG 导出信息
2. 优化导出文件命名
3. 添加导出统计信息

---

## 六、参考资料

1. **阿里 Imgcook**
   - https://www.imgcook.com/
   - https://www.alibabacloud.com/blog/imgcook-intelligent-code-generation-from-design-drafts-with-a-100%25-accuracy-rate_598093

2. **美团 UI2DSL**
   - https://tech.meituan.com/2021/03/25/ui2dsl-dsl2code.html

3. **UILM (浙江大学)**
   - 论文: https://arxiv.org/abs/2206.13389
   - 代码: https://github.com/zju-d3/UILM

4. **EGFE (ICSE 2024)**
   - 论文: https://arxiv.org/abs/2309.09867
   - 代码: https://github.com/test2975/EGFE

5. **Figma 官方文档**
   - Flatten layers: https://help.figma.com/hc/en-us/articles/30101373312279-Flatten-layers
   - Export formats: https://help.figma.com/hc/en-us/articles/13402894554519-Export-formats-and-settings

---

*文档创建时间: 2025-12-05*
*作者: Claude Code*
