# Cache System Architecture Design

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   FigmaService          SimplifyService      Other Services     │
│        │                      │                    │            │
│        └──────────────────────┴────────────────────┘            │
│                               │                                 │
│                               ▼                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │               CacheManager (Unified Entry)              │   │
│   │                                                         │   │
│   │  ┌─────────────┐    ┌─────────────┐    ┌────────────┐   │   │
│   │  │ NodeCache   │    │ ImageCache  │    │ MetaCache  │   │   │
│   │  │ (Node Data) │    │ (Image      │    │ (Metadata) │   │   │
│   │  │             │    │  Resources) │    │            │   │   │
│   │  └─────────────┘    └─────────────┘    └────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
├───────────────────────────────┼─────────────────────────────────┤
│                               ▼                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                  L1: Memory Cache Layer                  │   │
│   │                                                         │   │
│   │  ┌─────────────────────────────────────────────────┐    │   │
│   │  │              LRUCache<T>                        │    │   │
│   │  │  • Capacity Limit (maxSize)                     │    │   │
│   │  │  • LRU Eviction Policy                          │    │   │
│   │  │  • TTL Expiration                               │    │   │
│   │  │  • O(1) Read/Write                              │    │   │
│   │  └─────────────────────────────────────────────────┘    │   │
│   │                                                         │   │
│   │  Instances:                                              │   │
│   │  • nodeMemoryCache (100 items, 5min TTL)               │   │
│   │  • imageMemoryCache (50 items, 10min TTL)              │   │
│   └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
│                               ▼ (miss)                          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   L2: Disk Cache Layer                   │   │
│   │                                                         │   │
│   │  ~/.figma-mcp-cache/                                    │   │
│   │  ├── data/          # Node JSON data                    │   │
│   │  ├── images/        # Exported images                   │   │
│   │  └── metadata/      # Cache metadata                    │   │
│   │                                                         │   │
│   │  Features:                                               │   │
│   │  • Persistent storage                                    │   │
│   │  • 24h TTL                                              │   │
│   │  • Size limit (configurable)                            │   │
│   └─────────────────────────────────────────────────────────┘   │
│                               │                                 │
│                               ▼ (miss)                          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    L3: Figma API                         │   │
│   │                  (Remote Data Source)                    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

```
src/services/
├── cache/
│   ├── index.ts              # Unified exports
│   ├── types.ts              # Type definitions
│   ├── lru-cache.ts          # LRU memory cache
│   ├── disk-cache.ts         # Disk cache
│   ├── cache-manager.ts      # Unified cache manager
│   └── strategies/
│       ├── node-cache.ts     # Node cache strategy
│       └── image-cache.ts    # Image cache strategy
└── figma.ts                  # Uses CacheManager
```

---

## 3. Core Class Design

### 3.1 Type Definitions (`types.ts`)

```typescript
// Cache configuration
interface CacheConfig {
  enabled: boolean;

  // Memory cache configuration
  memory: {
    maxNodeItems: number; // Number of node cache entries (default 100)
    maxImageItems: number; // Number of image cache entries (default 50)
    nodeTTL: number; // Node TTL (default 5 minutes)
    imageTTL: number; // Image TTL (default 10 minutes)
  };

  // Disk cache configuration
  disk: {
    cacheDir: string; // Cache directory
    maxSize: number; // Maximum storage space (bytes)
    ttl: number; // TTL (default 24 hours)
  };
}

// Cache entry metadata
interface CacheEntryMeta {
  key: string;
  createdAt: number;
  expiresAt: number;
  fileKey: string;
  nodeId?: string;
  version?: string; // Figma file version
  size?: number; // Data size
}

// Cache statistics
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

### 3.2 LRU Cache (`lru-cache.ts`)

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

// Node-specific LRU cache
class NodeLRUCache extends LRUCache<NodeCacheEntry> {
  getNode(fileKey, nodeId?, depth?, version?): unknown | null;
  setNode(data, fileKey, nodeId?, depth?, version?, ttl?): void;
  invalidateFile(fileKey): number;
  invalidateNode(fileKey, nodeId): number;
}
```

### 3.3 Disk Cache (`disk-cache.ts`)

```typescript
class DiskCache {
  constructor(config: DiskCacheConfig);

  // Asynchronous operations
  async get<T>(key: string): Promise<T | null>;
  async set<T>(key: string, data: T, meta: CacheEntryMeta): Promise<void>;
  async has(key: string): Promise<boolean>;
  async delete(key: string): Promise<boolean>;

  // Maintenance operations
  async cleanExpired(): Promise<number>;
  async enforceSize(): Promise<number>; // Enforce size limit
  async getStats(): Promise<DiskCacheStats>;
}
```

### 3.4 Unified Cache Manager (`cache-manager.ts`)

```typescript
class CacheManager {
  private memoryCache: NodeLRUCache;
  private diskCache: DiskCache;

  constructor(config?: Partial<CacheConfig>);

  // Multi-tier cache read (L1 -> L2 -> API)
  async getNodeData<T>(
    fileKey: string,
    nodeId?: string,
    depth?: number,
    version?: string,
  ): Promise<T | null>;

  // Write (write to both L1 and L2)
  async setNodeData<T>(
    data: T,
    fileKey: string,
    nodeId?: string,
    depth?: number,
    version?: string,
  ): Promise<void>;

  // Invalidation operations
  invalidateFile(fileKey: string): Promise<void>;
  invalidateNode(fileKey: string, nodeId: string): Promise<void>;

  // Statistics
  getStats(): CacheStatistics;
}
```

---

## 4. Cache Flow

### 4.1 Read Flow

```
getNodeData(fileKey, nodeId, depth, version)
    │
    ▼
┌───────────────────┐
│ L1: Memory cache  │
│   query           │
│ memoryCache.get() │
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    │   Hit?    │
    └─────┬─────┘
      yes │ no
    ┌─────┘ └─────┐
    ▼             ▼
Return data   ┌───────────────────┐
              │ L2: Disk cache    │
              │     query         │
              │ diskCache.get()   │
              └─────────┬─────────┘
                        │
                  ┌─────┴─────┐
                  │   Hit?    │
                  └─────┬─────┘
                    yes │ no
                  ┌─────┘ └─────┐
                  ▼             ▼
            ┌──────────┐    Return null
            │ Backfill │    (caller requests API)
            │    L1    │
            │ Return   │
            │  data    │
            └──────────┘
```

### 4.2 Write Flow

```
setNodeData(data, fileKey, nodeId, depth, version)
    │
    ├────────────────────────┐
    ▼                        ▼
┌───────────────────┐  ┌───────────────────┐
│ L1: Write to      │  │ L2: Write to      │
│     memory cache  │  │     disk cache    │
│ memoryCache.set() │  │ diskCache.set()   │
└───────────────────┘  └───────────────────┘
                             │
                             ▼
                       ┌───────────────┐
                       │ Check size    │
                       │   limit       │
                       │ enforceSize() │
                       └───────────────┘
```

### 4.3 Invalidation Flow

```
invalidateFile(fileKey)
    │
    ├────────────────────────┐
    ▼                        ▼
┌───────────────────────┐  ┌───────────────────────┐
│ L1: Clear related     │  │ L2: Delete related    │
│     entries           │  │     files             │
│ memoryCache           │  │ diskCache             │
│ .invalidateFile()     │  │ .deleteByPrefix()     │
└───────────────────────┘  └───────────────────────┘
```

---

## 5. Version-Aware Strategy

```typescript
// Check version on retrieval
async getNodeData(fileKey, nodeId, depth, version) {
  const cached = await this.get(fileKey, nodeId, depth);

  if (cached && version) {
    // Version mismatch, cache expired
    if (cached.version !== version) {
      await this.invalidate(fileKey, nodeId);
      return null;
    }
  }

  return cached?.data;
}

// Caller retrieves version
async fetchWithCache(fileKey, nodeId) {
  // 1. Lightweight request to get file metadata
  const meta = await figmaApi.getFileMeta(fileKey);
  const version = meta.lastModified;

  // 2. Query cache with version
  const cached = await cacheManager.getNodeData(
    fileKey, nodeId, undefined, version
  );

  if (cached) return cached;

  // 3. Cache miss, request API
  const fresh = await figmaApi.getFileNodes(fileKey, [nodeId]);

  // 4. Store in cache (with version)
  await cacheManager.setNodeData(
    fresh, fileKey, nodeId, undefined, version
  );

  return fresh;
}
```

---

## 6. Configuration Example

```typescript
const cacheConfig: CacheConfig = {
  enabled: true,

  memory: {
    maxNodeItems: 100, // Cache up to 100 nodes
    maxImageItems: 50, // Cache up to 50 image references
    nodeTTL: 5 * 60 * 1000, // Node expires in 5 minutes
    imageTTL: 10 * 60 * 1000, // Image expires in 10 minutes
  },

  disk: {
    cacheDir: "~/.figma-mcp-cache",
    maxSize: 500 * 1024 * 1024, // 500MB
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  },
};
```

---

## 7. Implementation Phases

| Phase   | Content                              | Status         |
| ------- | ------------------------------------ | -------------- |
| Phase 1 | LRU memory cache base class          | ✅ Completed   |
| Phase 2 | Refactor CacheManager, integrate LRU | ⏳ In Progress |
| Phase 3 | Add version-aware caching            | To Do          |
| Phase 4 | Disk cache size limit                | To Do          |
| Phase 5 | Improve unit tests                   | To Do          |

---

_Last updated: 2025-12-05_
