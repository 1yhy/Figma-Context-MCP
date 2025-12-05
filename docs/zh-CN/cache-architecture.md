# 缓存系统架构设计

## 1. 系统概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        应用层 (Application)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   FigmaService          SimplifyService         其他服务         │
│        │                      │                    │            │
│        └──────────────────────┴────────────────────┘            │
│                               │                                 │
│                               ▼                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                  CacheManager (统一入口)                  │   │
│   │                                                         │   │
│   │  ┌─────────────┐    ┌─────────────┐    ┌────────────┐   │   │
│   │  │ NodeCache   │    │ ImageCache  │    │ MetaCache  │   │   │
│   │  │ (节点数据)   │    │ (图片资源)   │    │ (元数据)    │   │   │
│   │  └─────────────┘    └─────────────┘    └────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
├───────────────────────────────┼─────────────────────────────────┤
│                               ▼                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    L1: 内存缓存层                         │   │
│   │                                                         │   │
│   │  ┌─────────────────────────────────────────────────┐    │   │
│   │  │              LRUCache<T>                        │    │   │
│   │  │  • 容量限制 (maxSize)                            │    │   │
│   │  │  • LRU 淘汰策略                                  │    │   │
│   │  │  • TTL 过期                                     │    │   │
│   │  │  • O(1) 读写                                    │    │   │
│   │  └─────────────────────────────────────────────────┘    │   │
│   │                                                         │   │
│   │  实例:                                                   │   │
│   │  • nodeMemoryCache (100 items, 5min TTL)               │   │
│   │  • imageMemoryCache (50 items, 10min TTL)              │   │
│   └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
│                               ▼ (miss)                          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    L2: 磁盘缓存层                         │   │
│   │                                                         │   │
│   │  ~/.figma-mcp-cache/                                    │   │
│   │  ├── data/          # 节点 JSON 数据                     │   │
│   │  ├── images/        # 导出的图片                         │   │
│   │  └── metadata/      # 缓存元数据                         │   │
│   │                                                         │   │
│   │  特性:                                                   │   │
│   │  • 持久化存储                                            │   │
│   │  • 24h TTL                                              │   │
│   │  • 大小限制 (可配置)                                      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
│                               ▼ (miss)                          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    L3: Figma API                         │   │
│   │                    (远程数据源)                            │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 目录结构

```
src/services/
├── cache/
│   ├── index.ts              # 统一导出
│   ├── types.ts              # 类型定义
│   ├── lru-cache.ts          # LRU 内存缓存
│   ├── disk-cache.ts         # 磁盘缓存
│   ├── cache-manager.ts      # 统一缓存管理器
│   └── strategies/
│       ├── node-cache.ts     # 节点缓存策略
│       └── image-cache.ts    # 图片缓存策略
└── figma.ts                  # 使用 CacheManager
```

---

## 3. 核心类设计

### 3.1 类型定义 (`types.ts`)

```typescript
// 缓存配置
interface CacheConfig {
  enabled: boolean;

  // 内存缓存配置
  memory: {
    maxNodeItems: number; // 节点缓存条目数 (默认 100)
    maxImageItems: number; // 图片缓存条目数 (默认 50)
    nodeTTL: number; // 节点 TTL (默认 5 分钟)
    imageTTL: number; // 图片 TTL (默认 10 分钟)
  };

  // 磁盘缓存配置
  disk: {
    cacheDir: string; // 缓存目录
    maxSize: number; // 最大占用空间 (bytes)
    ttl: number; // TTL (默认 24 小时)
  };
}

// 缓存条目元数据
interface CacheEntryMeta {
  key: string;
  createdAt: number;
  expiresAt: number;
  fileKey: string;
  nodeId?: string;
  version?: string; // Figma 文件版本
  size?: number; // 数据大小
}

// 缓存统计
interface CacheStatistics {
  memory: {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  };
  disk: {
    hits: number;
    misses: number;
    size: number;
    fileCount: number;
  };
}
```

### 3.2 LRU 缓存 (`lru-cache.ts`)

```typescript
class LRUCache<T> {
  constructor(config: LRUCacheConfig);

  get(key: string): T | null;
  set(key: string, value: T, ttl?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;

  getStats(): CacheStats;
  cleanExpired(): number;
}

// 节点专用 LRU 缓存
class NodeLRUCache extends LRUCache<NodeCacheEntry> {
  getNode(fileKey, nodeId?, depth?, version?): unknown | null;
  setNode(data, fileKey, nodeId?, depth?, version?, ttl?): void;
  invalidateFile(fileKey): number;
  invalidateNode(fileKey, nodeId): number;
}
```

### 3.3 磁盘缓存 (`disk-cache.ts`)

```typescript
class DiskCache {
  constructor(config: DiskCacheConfig);

  // 异步操作
  async get<T>(key: string): Promise<T | null>;
  async set<T>(key: string, data: T, meta: CacheEntryMeta): Promise<void>;
  async has(key: string): Promise<boolean>;
  async delete(key: string): Promise<boolean>;

  // 维护操作
  async cleanExpired(): Promise<number>;
  async enforceSize(): Promise<number>; // 强制大小限制
  async getStats(): Promise<DiskCacheStats>;
}
```

### 3.4 统一缓存管理器 (`cache-manager.ts`)

```typescript
class CacheManager {
  private memoryCache: NodeLRUCache;
  private diskCache: DiskCache;

  constructor(config?: Partial<CacheConfig>);

  // 多层缓存读取 (L1 -> L2 -> API)
  async getNodeData<T>(
    fileKey: string,
    nodeId?: string,
    depth?: number,
    version?: string,
  ): Promise<T | null>;

  // 写入 (同时写入 L1 和 L2)
  async setNodeData<T>(
    data: T,
    fileKey: string,
    nodeId?: string,
    depth?: number,
    version?: string,
  ): Promise<void>;

  // 失效操作
  invalidateFile(fileKey: string): Promise<void>;
  invalidateNode(fileKey: string, nodeId: string): Promise<void>;

  // 统计
  getStats(): CacheStatistics;
}
```

---

## 4. 缓存流程

### 4.1 读取流程

```
getNodeData(fileKey, nodeId, depth, version)
    │
    ▼
┌───────────────────┐
│ L1: 内存缓存查询   │
│ memoryCache.get() │
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    │   命中?   │
    └─────┬─────┘
      yes │ no
    ┌─────┘ └─────┐
    ▼             ▼
  返回数据    ┌───────────────────┐
              │ L2: 磁盘缓存查询   │
              │ diskCache.get()   │
              └─────────┬─────────┘
                        │
                  ┌─────┴─────┐
                  │   命中?   │
                  └─────┬─────┘
                    yes │ no
                  ┌─────┘ └─────┐
                  ▼             ▼
            ┌──────────┐    返回 null
            │ 回填 L1   │    (调用方请求 API)
            │ 返回数据  │
            └──────────┘
```

### 4.2 写入流程

```
setNodeData(data, fileKey, nodeId, depth, version)
    │
    ├────────────────────────┐
    ▼                        ▼
┌───────────────────┐  ┌───────────────────┐
│ L1: 写入内存缓存   │  │ L2: 写入磁盘缓存   │
│ memoryCache.set() │  │ diskCache.set()   │
└───────────────────┘  └───────────────────┘
                             │
                             ▼
                       ┌───────────────┐
                       │ 检查大小限制   │
                       │ enforceSize() │
                       └───────────────┘
```

### 4.3 失效流程

```
invalidateFile(fileKey)
    │
    ├────────────────────────┐
    ▼                        ▼
┌───────────────────────┐  ┌───────────────────────┐
│ L1: 清除相关条目       │  │ L2: 删除相关文件       │
│ memoryCache           │  │ diskCache             │
│ .invalidateFile()     │  │ .deleteByPrefix()     │
└───────────────────────┘  └───────────────────────┘
```

---

## 5. 版本感知策略

```typescript
// 获取时检查版本
async getNodeData(fileKey, nodeId, depth, version) {
  const cached = await this.get(fileKey, nodeId, depth);

  if (cached && version) {
    // 版本不匹配，缓存过期
    if (cached.version !== version) {
      await this.invalidate(fileKey, nodeId);
      return null;
    }
  }

  return cached?.data;
}

// 调用方获取版本
async fetchWithCache(fileKey, nodeId) {
  // 1. 轻量请求获取文件元数据
  const meta = await figmaApi.getFileMeta(fileKey);
  const version = meta.lastModified;

  // 2. 带版本查询缓存
  const cached = await cacheManager.getNodeData(
    fileKey, nodeId, undefined, version
  );

  if (cached) return cached;

  // 3. 缓存未命中，请求 API
  const fresh = await figmaApi.getFileNodes(fileKey, [nodeId]);

  // 4. 存入缓存（带版本）
  await cacheManager.setNodeData(
    fresh, fileKey, nodeId, undefined, version
  );

  return fresh;
}
```

---

## 6. 配置示例

```typescript
const cacheConfig: CacheConfig = {
  enabled: true,

  memory: {
    maxNodeItems: 100, // 最多缓存 100 个节点
    maxImageItems: 50, // 最多缓存 50 张图片引用
    nodeTTL: 5 * 60 * 1000, // 节点 5 分钟过期
    imageTTL: 10 * 60 * 1000, // 图片 10 分钟过期
  },

  disk: {
    cacheDir: "~/.figma-mcp-cache",
    maxSize: 500 * 1024 * 1024, // 500MB
    ttl: 24 * 60 * 60 * 1000, // 24 小时
  },
};
```

---

## 7. 实现阶段

| 阶段    | 内容                        | 状态      |
| ------- | --------------------------- | --------- |
| Phase 1 | LRU 内存缓存基础类          | ✅ 完成   |
| Phase 2 | 重构 CacheManager，集成 LRU | ⏳ 进行中 |
| Phase 3 | 添加版本感知缓存            | 待做      |
| Phase 4 | 磁盘缓存大小限制            | 待做      |
| Phase 5 | 单元测试完善                | 待做      |

---

_最后更新: 2025-12-05_
