/**
 * Unified Cache Manager
 *
 * Manages multi-layer caching with L1 (memory) and L2 (disk) layers.
 * Provides a single interface for all caching operations.
 *
 * Cache hierarchy:
 * - L1: In-memory LRU cache (fast, limited size)
 * - L2: Disk-based cache (persistent, larger capacity)
 *
 * @module services/cache/cache-manager
 */

import fs from "fs";
import os from "os";
import path from "path";
import type { CacheConfig, CacheStatistics } from "./types.js";
import { NodeLRUCache } from "./lru-cache.js";
import { DiskCache } from "./disk-cache.js";

/**
 * Legacy config format for backward compatibility
 */
interface LegacyCacheConfig {
  cacheDir?: string;
  ttl?: number;
  enabled?: boolean;
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  enabled: true,
  memory: {
    maxNodeItems: 100,
    maxImageItems: 50,
    nodeTTL: 5 * 60 * 1000, // 5 minutes
    imageTTL: 10 * 60 * 1000, // 10 minutes
  },
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
  private diskCache: DiskCache;

  constructor(config: Partial<CacheConfig> | LegacyCacheConfig = {}) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);

    // Skip initialization if disabled
    if (!this.config.enabled) {
      // Create dummy instances that won't create directories
      this.memoryCache = new NodeLRUCache({ maxSize: 0, defaultTTL: 0 });
      this.diskCache = null as unknown as DiskCache;
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
   * Deep merge configuration with legacy format support
   */
  private mergeConfig(
    defaults: CacheConfig,
    overrides: Partial<CacheConfig> | LegacyCacheConfig,
  ): CacheConfig {
    // Check if using legacy format (has cacheDir or ttl at top level)
    const legacy = overrides as LegacyCacheConfig;
    if (legacy.cacheDir !== undefined || legacy.ttl !== undefined) {
      const ttl = legacy.ttl ?? defaults.disk.ttl;
      return {
        enabled: legacy.enabled ?? defaults.enabled,
        memory: {
          ...defaults.memory,
          // Use same TTL for memory cache in legacy mode
          nodeTTL: ttl,
          imageTTL: ttl,
        },
        disk: {
          ...defaults.disk,
          cacheDir: legacy.cacheDir ?? defaults.disk.cacheDir,
          ttl,
        },
      };
    }

    // New format
    const newConfig = overrides as Partial<CacheConfig>;
    return {
      enabled: newConfig.enabled ?? defaults.enabled,
      memory: {
        ...defaults.memory,
        ...newConfig.memory,
      },
      disk: {
        ...defaults.disk,
        ...newConfig.disk,
      },
    };
  }

  // ==================== Node Data Operations ====================

  /**
   * Get node data with multi-layer cache lookup
   *
   * Flow: L1 (memory) -> L2 (disk) -> null (cache miss)
   *
   * @param fileKey Figma file key
   * @param nodeId Optional node ID
   * @param depth Optional query depth
   * @param version Optional file version (for staleness check)
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
    const diskData = await this.diskCache.get<T>(fileKey, nodeId, depth, version);
    if (diskData !== null) {
      // Backfill L1 cache
      this.memoryCache.setNode(diskData, fileKey, nodeId, depth, version);
      return diskData;
    }

    // Cache miss
    return null;
  }

  /**
   * Set node data in both cache layers
   *
   * @param data Data to cache
   * @param fileKey Figma file key
   * @param nodeId Optional node ID
   * @param depth Optional query depth
   * @param version Optional file version
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

    // Write to L2 (disk) asynchronously
    await this.diskCache.set(data, fileKey, nodeId, depth, version);
  }

  /**
   * Check if node data exists in cache
   */
  async hasNodeData(fileKey: string, nodeId?: string, depth?: number): Promise<boolean> {
    if (!this.config.enabled) return false;

    // Check L1 first
    const key = NodeLRUCache.generateKey(fileKey, nodeId, depth);
    if (this.memoryCache.has(key)) {
      return true;
    }

    // Check L2
    return this.diskCache.has(fileKey, nodeId, depth);
  }

  // ==================== Image Operations ====================

  /**
   * Check if image is cached
   */
  async hasImage(fileKey: string, nodeId: string, format: string): Promise<string | null> {
    if (!this.config.enabled) return null;
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
    if (!this.config.enabled) return sourcePath;
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
    if (!this.config.enabled) return false;
    return this.diskCache.copyImageFromCache(fileKey, nodeId, format, targetPath);
  }

  // ==================== Invalidation Operations ====================

  /**
   * Invalidate all cache entries for a file
   */
  async invalidateFile(fileKey: string): Promise<{ memory: number; disk: number }> {
    const memoryInvalidated = this.memoryCache.invalidateFile(fileKey);
    const diskInvalidated = await this.diskCache.invalidateFile(fileKey);

    return {
      memory: memoryInvalidated,
      disk: diskInvalidated,
    };
  }

  /**
   * Invalidate cache for a specific node
   */
  async invalidateNode(fileKey: string, nodeId: string): Promise<{ memory: number; disk: number }> {
    const memoryInvalidated = this.memoryCache.invalidateNode(fileKey, nodeId);
    // For disk cache, we invalidate the whole file as node-level invalidation
    // is more complex and may have child dependencies
    const diskInvalidated = await this.diskCache.delete(fileKey, nodeId);

    return {
      memory: memoryInvalidated,
      disk: diskInvalidated ? 1 : 0,
    };
  }

  // ==================== Maintenance Operations ====================

  /**
   * Clean expired cache entries from all layers
   */
  async cleanExpired(): Promise<{ memory: number; disk: number }> {
    const memoryCleaned = this.memoryCache.cleanExpired();
    const diskCleaned = await this.diskCache.cleanExpired();

    return {
      memory: memoryCleaned,
      disk: diskCleaned,
    };
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    await this.diskCache.clearAll();
  }

  /**
   * Get combined cache statistics
   */
  async getStats(): Promise<CacheStatistics> {
    const memoryStats = this.memoryCache.getStats();
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
    return this.diskCache.getCacheDir();
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable caching
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.memoryCache.resetStats();
  }

  // ==================== Legacy API (Backward Compatibility) ====================

  /**
   * Get cache stats in legacy format
   * @deprecated Use getStats() instead
   */
  getCacheStats(): {
    enabled: boolean;
    cacheDir: string;
    dataCount: number;
    imageCount: number;
    totalSize: number;
  } {
    if (!this.config.enabled || !this.diskCache) {
      return {
        enabled: false,
        cacheDir: this.config.disk.cacheDir,
        dataCount: 0,
        imageCount: 0,
        totalSize: 0,
      };
    }

    // Synchronous version for legacy compatibility
    let totalSize = 0;
    let dataCount = 0;
    let imageCount = 0;

    try {
      const dataDir = path.join(this.config.disk.cacheDir, "data");
      const imageDir = path.join(this.config.disk.cacheDir, "images");

      if (fs.existsSync(dataDir)) {
        const files = fs.readdirSync(dataDir);
        dataCount = files.filter((f: string) => f.endsWith(".json")).length;
        for (const file of files) {
          try {
            const stat = fs.statSync(path.join(dataDir, file));
            totalSize += stat.size;
          } catch {
            // Ignore individual file stat errors
          }
        }
      }

      if (fs.existsSync(imageDir)) {
        const files = fs.readdirSync(imageDir);
        imageCount = files.length;
        for (const file of files) {
          try {
            const stat = fs.statSync(path.join(imageDir, file));
            totalSize += stat.size;
          } catch {
            // Ignore individual file stat errors
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return {
      enabled: this.config.enabled,
      cacheDir: this.config.disk.cacheDir,
      dataCount,
      imageCount,
      totalSize,
    };
  }

  /**
   * Clean expired cache entries (legacy format)
   * @deprecated Use cleanExpired() instead
   */
  async cleanExpiredCache(): Promise<{ deletedCount: number }> {
    if (!this.config.enabled || !this.diskCache) {
      return { deletedCount: 0 };
    }

    const result = await this.cleanExpired();
    // Return only disk count for backward compatibility
    // (old API only had disk cache)
    return { deletedCount: result.disk };
  }

  /**
   * Clear all cache (legacy method name)
   * @deprecated Use clearAll() instead
   */
  async clearAllCache(): Promise<void> {
    if (!this.config.enabled || !this.diskCache) {
      return;
    }
    return this.clearAll();
  }
}

// Export singleton instance for backward compatibility
export const cacheManager = new CacheManager();
