/**
 * Cache System Type Definitions
 *
 * @module services/cache/types
 */

// ==================== Configuration ====================

/**
 * Memory cache configuration
 */
export interface MemoryCacheConfig {
  /** Maximum number of node cache items (default: 100) */
  maxNodeItems: number;
  /** Maximum number of image cache items (default: 50) */
  maxImageItems: number;
  /** Node cache TTL in milliseconds (default: 5 minutes) */
  nodeTTL: number;
  /** Image cache TTL in milliseconds (default: 10 minutes) */
  imageTTL: number;
}

/**
 * Disk cache configuration
 */
export interface DiskCacheConfig {
  /** Cache directory path */
  cacheDir: string;
  /** Maximum disk cache size in bytes (default: 500MB) */
  maxSize: number;
  /** Cache TTL in milliseconds (default: 24 hours) */
  ttl: number;
}

/**
 * Complete cache configuration
 */
export interface CacheConfig {
  /** Whether caching is enabled */
  enabled: boolean;
  /** Memory cache configuration */
  memory: MemoryCacheConfig;
  /** Disk cache configuration */
  disk: DiskCacheConfig;
}

// ==================== Cache Entries ====================

/**
 * Cache entry metadata
 */
export interface CacheEntryMeta {
  /** Cache key */
  key: string;
  /** Creation timestamp */
  createdAt: number;
  /** Expiration timestamp */
  expiresAt: number;
  /** Figma file key */
  fileKey: string;
  /** Figma node ID (optional) */
  nodeId?: string;
  /** Figma file version (lastModified) */
  version?: string;
  /** Query depth */
  depth?: number;
  /** Data size in bytes */
  size?: number;
}

/**
 * Node cache entry
 */
export interface NodeCacheEntry {
  /** Cached data */
  data: unknown;
  /** Figma file key */
  fileKey: string;
  /** Figma node ID */
  nodeId?: string;
  /** Figma file version */
  version?: string;
  /** Query depth */
  depth?: number;
}

/**
 * Image cache entry
 */
export interface ImageCacheEntry {
  /** Local file path */
  path: string;
  /** Figma file key */
  fileKey: string;
  /** Figma node ID */
  nodeId: string;
  /** Image format */
  format: string;
  /** File size in bytes */
  size?: number;
}

// ==================== Statistics ====================

/**
 * Memory cache statistics
 */
export interface MemoryCacheStats {
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Current item count */
  size: number;
  /** Maximum item count */
  maxSize: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Eviction count */
  evictions: number;
}

/**
 * Disk cache statistics
 */
export interface DiskCacheStats {
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Total size in bytes */
  totalSize: number;
  /** Maximum size in bytes */
  maxSize: number;
  /** Node data file count */
  nodeFileCount: number;
  /** Image file count */
  imageFileCount: number;
}

/**
 * Combined cache statistics
 */
export interface CacheStatistics {
  /** Whether cache is enabled */
  enabled: boolean;
  /** Memory cache stats */
  memory: MemoryCacheStats;
  /** Disk cache stats */
  disk: DiskCacheStats;
}

// ==================== Default Configurations ====================

/**
 * Default memory cache configuration
 */
export const DEFAULT_MEMORY_CONFIG: MemoryCacheConfig = {
  maxNodeItems: 100,
  maxImageItems: 50,
  nodeTTL: 5 * 60 * 1000, // 5 minutes
  imageTTL: 10 * 60 * 1000, // 10 minutes
};

/**
 * Default disk cache configuration
 */
export const DEFAULT_DISK_CONFIG: Partial<DiskCacheConfig> = {
  maxSize: 500 * 1024 * 1024, // 500MB
  ttl: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Default complete cache configuration
 */
export const DEFAULT_CACHE_CONFIG: Omit<CacheConfig, "disk"> & { disk: Partial<DiskCacheConfig> } =
  {
    enabled: true,
    memory: DEFAULT_MEMORY_CONFIG,
    disk: DEFAULT_DISK_CONFIG,
  };
