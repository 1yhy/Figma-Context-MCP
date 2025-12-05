/**
 * Cache Module
 *
 * Multi-layer caching system for Figma data.
 *
 * @module services/cache
 */

// Types
export type {
  CacheConfig,
  MemoryCacheConfig,
  DiskCacheConfig,
  CacheEntryMeta,
  NodeCacheEntry,
  ImageCacheEntry,
  MemoryCacheStats,
  DiskCacheStats,
  CacheStatistics,
} from "./types.js";

export { DEFAULT_MEMORY_CONFIG, DEFAULT_DISK_CONFIG, DEFAULT_CACHE_CONFIG } from "./types.js";

// LRU Cache
export { LRUCache, NodeLRUCache, type LRUCacheConfig, type CacheStats } from "./lru-cache.js";

// Disk Cache
export { DiskCache } from "./disk-cache.js";

// Cache Manager
export { CacheManager, cacheManager } from "./cache-manager.js";
