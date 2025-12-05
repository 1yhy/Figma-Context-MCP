/**
 * LRU (Least Recently Used) Memory Cache
 *
 * A generic in-memory cache with LRU eviction policy.
 * Used as a fast cache layer before disk cache.
 *
 * Features:
 * - O(1) get/set operations
 * - Automatic eviction of least recently used items
 * - Optional TTL (time-to-live) per item
 * - Size limiting by item count
 * - Statistics tracking
 *
 * @module services/cache/lru-cache
 */

import type { NodeCacheEntry } from "./types.js";

export interface LRUCacheConfig {
  /** Maximum number of items in cache */
  maxSize: number;
  /** Default TTL in milliseconds (0 = no expiration) */
  defaultTTL: number;
}

interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number | null;
  size?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
}

const DEFAULT_CONFIG: LRUCacheConfig = {
  maxSize: 100,
  defaultTTL: 0, // No expiration by default
};

/**
 * Generic LRU Cache implementation using Map
 * Map maintains insertion order, making it ideal for LRU
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private config: LRUCacheConfig;
  private stats: CacheStats;

  constructor(config: Partial<LRUCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      maxSize: this.config.maxSize,
    };
  }

  /**
   * Get an item from cache
   * Returns null if not found or expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set an item in cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Optional TTL in milliseconds (overrides default)
   */
  set(key: string, value: T, ttl?: number): void {
    // If key exists, delete it first (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else {
      // Evict if at capacity
      while (this.cache.size >= this.config.maxSize) {
        this.evictOldest();
      }
    }

    const effectiveTTL = ttl ?? this.config.defaultTTL;
    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      expiresAt: effectiveTTL > 0 ? Date.now() + effectiveTTL : null,
    };

    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
  }

  /**
   * Check if key exists (without updating access time)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete an item from cache
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.stats.size = this.cache.size;
    }
    return existed;
  }

  /**
   * Clear all items from cache
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Get all keys in cache (most recent last)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
  }

  /**
   * Get hit rate (0-1)
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total === 0 ? 0 : this.stats.hits / total;
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    this.stats.size = this.cache.size;
    return cleaned;
  }

  /**
   * Evict the oldest (least recently used) item
   */
  private evictOldest(): void {
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
    }
  }

  /**
   * Peek at an item without updating access time
   */
  peek(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      return null;
    }

    return entry.value;
  }

  /**
   * Update config (applies to new entries only)
   */
  updateConfig(config: Partial<LRUCacheConfig>): void {
    this.config = { ...this.config, ...config };
    this.stats.maxSize = this.config.maxSize;

    // Evict if new maxSize is smaller
    while (this.cache.size > this.config.maxSize) {
      this.evictOldest();
    }
  }
}

/**
 * Specialized LRU cache for Figma node data
 * Includes version-aware caching
 */
export class NodeLRUCache extends LRUCache<NodeCacheEntry> {
  /**
   * Generate cache key for node data
   */
  static generateKey(fileKey: string, nodeId?: string, depth?: number): string {
    const parts = [fileKey];
    if (nodeId) parts.push(`n:${nodeId}`);
    if (depth !== undefined) parts.push(`d:${depth}`);
    return parts.join(":");
  }

  /**
   * Get node data with version check
   */
  getNode(fileKey: string, nodeId?: string, depth?: number, version?: string): unknown | null {
    const key = NodeLRUCache.generateKey(fileKey, nodeId, depth);
    const entry = this.get(key);

    if (!entry) return null;

    // Version mismatch - cache is stale
    if (version && entry.version && entry.version !== version) {
      this.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set node data with metadata
   */
  setNode(
    data: unknown,
    fileKey: string,
    nodeId?: string,
    depth?: number,
    version?: string,
    ttl?: number,
  ): void {
    const key = NodeLRUCache.generateKey(fileKey, nodeId, depth);
    const entry: NodeCacheEntry = {
      data,
      fileKey,
      nodeId,
      version,
      depth,
    };
    this.set(key, entry, ttl);
  }

  /**
   * Invalidate all cache entries for a file
   */
  invalidateFile(fileKey: string): number {
    let invalidated = 0;
    for (const key of this.keys()) {
      if (key.startsWith(fileKey)) {
        this.delete(key);
        invalidated++;
      }
    }
    return invalidated;
  }

  /**
   * Invalidate cache entries for a specific node and its descendants
   */
  invalidateNode(fileKey: string, nodeId: string): number {
    let invalidated = 0;
    const prefix = NodeLRUCache.generateKey(fileKey, nodeId);
    for (const key of this.keys()) {
      if (key.startsWith(prefix)) {
        this.delete(key);
        invalidated++;
      }
    }
    return invalidated;
  }
}
