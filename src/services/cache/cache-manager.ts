/**
 * Unified Cache Manager
 *
 * Manages multi-layer caching with L1 (memory) and L2 (disk) layers.
 *
 * Cache hierarchy:
 * - L1: In-memory LRU cache (fast, limited size)
 * - L2: Disk-based cache (persistent, larger capacity)
 *
 * @module services/cache/cache-manager
 */

import type { CacheConfig, CacheStatistics } from "./types.js";
import { DEFAULT_MEMORY_CONFIG } from "./types.js";
import { NodeLRUCache } from "./lru-cache.js";
import { DiskCache } from "./disk-cache.js";
import os from "os";
import path from "path";

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  enabled: true,
  memory: DEFAULT_MEMORY_CONFIG,
  disk: {
    cacheDir: path.join(os.homedir(), ".figma-mcp-cache"),
    maxSize: 500 * 1024 * 1024, // 500MB
    ttl: 24 * 60 * 60 * 1000, // 24 hours
  },
};

/**
 * Unified cache manager with multi-layer caching
 */
export class CacheManager {
  private config: CacheConfig;
  private memoryCache: NodeLRUCache;
  private diskCache: DiskCache | null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);

    // Skip initialization if disabled
    if (!this.config.enabled) {
      this.memoryCache = new NodeLRUCache({ maxSize: 0, defaultTTL: 0 });
      this.diskCache = null;
      return;
    }

    // Initialize L1: Memory cache
    this.memoryCache = new NodeLRUCache({
      maxSize: this.config.memory.maxNodeItems,
      defaultTTL: this.config.memory.nodeTTL,
    });

    // Initialize L2: Disk cache
    this.diskCache = new DiskCache(this.config.disk);
  }

  /**
   * Deep merge configuration
   */
  private mergeConfig(defaults: CacheConfig, overrides: Partial<CacheConfig>): CacheConfig {
    return {
      enabled: overrides.enabled ?? defaults.enabled,
      memory: {
        ...defaults.memory,
        ...overrides.memory,
      },
      disk: {
        ...defaults.disk,
        ...overrides.disk,
      },
    };
  }

  // ==================== Node Data Operations ====================

  /**
   * Get node data with multi-layer cache lookup
   *
   * Flow: L1 (memory) -> L2 (disk) -> null (cache miss)
   */
  async getNodeData<T>(
    fileKey: string,
    nodeId?: string,
    depth?: number,
    version?: string,
  ): Promise<T | null> {
    if (!this.config.enabled) return null;

    // L1: Check memory cache
    const memoryData = this.memoryCache.getNode(fileKey, nodeId, depth, version);
    if (memoryData !== null) {
      return memoryData as T;
    }

    // L2: Check disk cache
    if (this.diskCache) {
      const diskData = await this.diskCache.get<T>(fileKey, nodeId, depth, version);
      if (diskData !== null) {
        // Backfill L1 cache
        this.memoryCache.setNode(diskData, fileKey, nodeId, depth, version);
        return diskData;
      }
    }

    return null;
  }

  /**
   * Set node data in both cache layers
   */
  async setNodeData<T>(
    data: T,
    fileKey: string,
    nodeId?: string,
    depth?: number,
    version?: string,
  ): Promise<void> {
    if (!this.config.enabled) return;

    // Write to L1 (memory)
    this.memoryCache.setNode(data, fileKey, nodeId, depth, version);

    // Write to L2 (disk)
    if (this.diskCache) {
      await this.diskCache.set(data, fileKey, nodeId, depth, version);
    }
  }

  /**
   * Check if node data exists in cache
   */
  async hasNodeData(fileKey: string, nodeId?: string, depth?: number): Promise<boolean> {
    if (!this.config.enabled) return false;

    const key = NodeLRUCache.generateKey(fileKey, nodeId, depth);
    if (this.memoryCache.has(key)) {
      return true;
    }

    if (this.diskCache) {
      return this.diskCache.has(fileKey, nodeId, depth);
    }

    return false;
  }

  // ==================== Image Operations ====================

  /**
   * Check if image is cached
   */
  async hasImage(fileKey: string, nodeId: string, format: string): Promise<string | null> {
    if (!this.config.enabled || !this.diskCache) return null;
    return this.diskCache.hasImage(fileKey, nodeId, format);
  }

  /**
   * Cache image file
   */
  async cacheImage(
    sourcePath: string,
    fileKey: string,
    nodeId: string,
    format: string,
  ): Promise<string> {
    if (!this.config.enabled || !this.diskCache) return sourcePath;
    return this.diskCache.cacheImage(sourcePath, fileKey, nodeId, format);
  }

  /**
   * Copy image from cache to target path
   */
  async copyImageFromCache(
    fileKey: string,
    nodeId: string,
    format: string,
    targetPath: string,
  ): Promise<boolean> {
    if (!this.config.enabled || !this.diskCache) return false;
    return this.diskCache.copyImageFromCache(fileKey, nodeId, format, targetPath);
  }

  // ==================== Invalidation Operations ====================

  /**
   * Invalidate all cache entries for a file
   */
  async invalidateFile(fileKey: string): Promise<{ memory: number; disk: number }> {
    const memoryInvalidated = this.memoryCache.invalidateFile(fileKey);
    const diskInvalidated = this.diskCache ? await this.diskCache.invalidateFile(fileKey) : 0;

    return { memory: memoryInvalidated, disk: diskInvalidated };
  }

  /**
   * Invalidate cache for a specific node
   */
  async invalidateNode(fileKey: string, nodeId: string): Promise<{ memory: number; disk: number }> {
    const memoryInvalidated = this.memoryCache.invalidateNode(fileKey, nodeId);
    const diskInvalidated = this.diskCache
      ? (await this.diskCache.delete(fileKey, nodeId))
        ? 1
        : 0
      : 0;

    return { memory: memoryInvalidated, disk: diskInvalidated };
  }

  // ==================== Maintenance Operations ====================

  /**
   * Clean expired cache entries from all layers
   */
  async cleanExpired(): Promise<{ memory: number; disk: number }> {
    const memoryCleaned = this.memoryCache.cleanExpired();
    const diskCleaned = this.diskCache ? await this.diskCache.cleanExpired() : 0;

    return { memory: memoryCleaned, disk: diskCleaned };
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    if (this.diskCache) {
      await this.diskCache.clearAll();
    }
  }

  /**
   * Get combined cache statistics
   */
  async getStats(): Promise<CacheStatistics> {
    const memoryStats = this.memoryCache.getStats();

    if (!this.diskCache) {
      return {
        enabled: this.config.enabled,
        memory: {
          hits: memoryStats.hits,
          misses: memoryStats.misses,
          size: memoryStats.size,
          maxSize: memoryStats.maxSize,
          hitRate: this.memoryCache.getHitRate(),
          evictions: memoryStats.evictions,
        },
        disk: {
          hits: 0,
          misses: 0,
          totalSize: 0,
          maxSize: this.config.disk.maxSize,
          nodeFileCount: 0,
          imageFileCount: 0,
        },
      };
    }

    const diskStats = await this.diskCache.getStats();

    return {
      enabled: this.config.enabled,
      memory: {
        hits: memoryStats.hits,
        misses: memoryStats.misses,
        size: memoryStats.size,
        maxSize: memoryStats.maxSize,
        hitRate: this.memoryCache.getHitRate(),
        evictions: memoryStats.evictions,
      },
      disk: diskStats,
    };
  }

  /**
   * Get cache directory path
   */
  getCacheDir(): string {
    return this.config.disk.cacheDir;
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.memoryCache.resetStats();
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
