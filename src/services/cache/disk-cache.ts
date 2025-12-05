/**
 * Disk Cache
 *
 * Persistent file-based cache for Figma data and images.
 * Acts as L2 cache layer after in-memory LRU cache.
 *
 * @module services/cache/disk-cache
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import type { DiskCacheConfig, CacheEntryMeta, DiskCacheStats } from "./types.js";

/**
 * Default disk cache configuration
 */
const DEFAULT_CONFIG: DiskCacheConfig = {
  cacheDir: path.join(os.homedir(), ".figma-mcp-cache"),
  maxSize: 500 * 1024 * 1024, // 500MB
  ttl: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Disk-based persistent cache
 */
export class DiskCache {
  private config: DiskCacheConfig;
  private dataDir: string;
  private imageDir: string;
  private metadataDir: string;
  private stats: { hits: number; misses: number };

  constructor(config: Partial<DiskCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dataDir = path.join(this.config.cacheDir, "data");
    this.imageDir = path.join(this.config.cacheDir, "images");
    this.metadataDir = path.join(this.config.cacheDir, "metadata");
    this.stats = { hits: 0, misses: 0 };

    this.ensureCacheDirectories();
  }

  /**
   * Ensure cache directories exist
   */
  private ensureCacheDirectories(): void {
    try {
      [this.config.cacheDir, this.dataDir, this.imageDir, this.metadataDir].forEach((dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });
    } catch (error) {
      console.warn("Failed to create cache directories:", error);
    }
  }

  /**
   * Generate cache key from components
   */
  static generateKey(fileKey: string, nodeId?: string, depth?: number): string {
    const keyParts = [fileKey];
    if (nodeId) keyParts.push(`node-${nodeId}`);
    if (depth !== undefined) keyParts.push(`depth-${depth}`);

    const keyString = keyParts.join("_");
    return crypto.createHash("md5").update(keyString).digest("hex");
  }

  /**
   * Generate image cache key
   */
  static generateImageKey(fileKey: string, nodeId: string, format: string): string {
    const keyString = `${fileKey}_${nodeId}_${format}`;
    return crypto.createHash("md5").update(keyString).digest("hex");
  }

  // ==================== Node Data Operations ====================

  /**
   * Get cached node data
   */
  async get<T>(
    fileKey: string,
    nodeId?: string,
    depth?: number,
    version?: string,
  ): Promise<T | null> {
    try {
      const cacheKey = DiskCache.generateKey(fileKey, nodeId, depth);
      const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
      const metadataPath = path.join(this.metadataDir, `${cacheKey}.meta.json`);

      // Check if files exist
      if (!fs.existsSync(dataPath) || !fs.existsSync(metadataPath)) {
        this.stats.misses++;
        return null;
      }

      // Read metadata and check expiration
      const metadata: CacheEntryMeta = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

      // Check TTL expiration
      if (Date.now() > metadata.expiresAt) {
        this.deleteByKey(cacheKey);
        this.stats.misses++;
        return null;
      }

      // Check version mismatch
      if (version && metadata.version && metadata.version !== version) {
        this.deleteByKey(cacheKey);
        this.stats.misses++;
        return null;
      }

      // Read and return cached data
      const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      this.stats.hits++;
      return data as T;
    } catch (error) {
      console.warn("Failed to read disk cache:", error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Set node data cache
   */
  async set<T>(
    data: T,
    fileKey: string,
    nodeId?: string,
    depth?: number,
    version?: string,
  ): Promise<void> {
    try {
      const cacheKey = DiskCache.generateKey(fileKey, nodeId, depth);
      const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
      const metadataPath = path.join(this.metadataDir, `${cacheKey}.meta.json`);

      const dataString = JSON.stringify(data, null, 2);

      // Create metadata
      const metadata: CacheEntryMeta = {
        key: cacheKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.config.ttl,
        fileKey,
        nodeId,
        depth,
        version,
        size: Buffer.byteLength(dataString, "utf-8"),
      };

      // Write data and metadata
      fs.writeFileSync(dataPath, dataString);
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      // Enforce size limit asynchronously
      this.enforceSizeLimit().catch(() => {});
    } catch (error) {
      console.warn("Failed to write disk cache:", error);
    }
  }

  /**
   * Check if cache entry exists
   */
  async has(fileKey: string, nodeId?: string, depth?: number): Promise<boolean> {
    const cacheKey = DiskCache.generateKey(fileKey, nodeId, depth);
    const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
    const metadataPath = path.join(this.metadataDir, `${cacheKey}.meta.json`);

    if (!fs.existsSync(dataPath) || !fs.existsSync(metadataPath)) {
      return false;
    }

    try {
      const metadata: CacheEntryMeta = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      return Date.now() <= metadata.expiresAt;
    } catch {
      return false;
    }
  }

  /**
   * Delete cache entry by key
   */
  private deleteByKey(cacheKey: string): void {
    try {
      const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
      const metadataPath = path.join(this.metadataDir, `${cacheKey}.meta.json`);

      if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
      if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
    } catch {
      // Ignore deletion errors
    }
  }

  /**
   * Delete cache for a file key
   */
  async delete(fileKey: string, nodeId?: string, depth?: number): Promise<boolean> {
    const cacheKey = DiskCache.generateKey(fileKey, nodeId, depth);
    this.deleteByKey(cacheKey);
    return true;
  }

  /**
   * Invalidate all cache entries for a file
   */
  async invalidateFile(fileKey: string): Promise<number> {
    let invalidated = 0;

    try {
      const metadataFiles = fs.readdirSync(this.metadataDir);

      for (const file of metadataFiles) {
        if (!file.endsWith(".meta.json") || file.startsWith("img_")) continue;

        const metadataPath = path.join(this.metadataDir, file);
        try {
          const metadata: CacheEntryMeta = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

          if (metadata.fileKey === fileKey) {
            const cacheKey = file.replace(".meta.json", "");
            this.deleteByKey(cacheKey);
            invalidated++;
          }
        } catch {
          // Skip individual file errors
        }
      }
    } catch (error) {
      console.warn("Failed to invalidate file cache:", error);
    }

    return invalidated;
  }

  // ==================== Image Operations ====================

  /**
   * Check if image is cached
   */
  async hasImage(fileKey: string, nodeId: string, format: string): Promise<string | null> {
    try {
      const cacheKey = DiskCache.generateImageKey(fileKey, nodeId, format);
      const imagePath = path.join(this.imageDir, `${cacheKey}.${format.toLowerCase()}`);
      const metadataPath = path.join(this.metadataDir, `img_${cacheKey}.meta.json`);

      if (!fs.existsSync(imagePath) || !fs.existsSync(metadataPath)) {
        return null;
      }

      // Check expiration
      const metadata: CacheEntryMeta = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      if (Date.now() > metadata.expiresAt) {
        this.deleteImageByKey(cacheKey, format);
        return null;
      }

      return imagePath;
    } catch {
      return null;
    }
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
    try {
      const cacheKey = DiskCache.generateImageKey(fileKey, nodeId, format);
      const cachedImagePath = path.join(this.imageDir, `${cacheKey}.${format.toLowerCase()}`);
      const metadataPath = path.join(this.metadataDir, `img_${cacheKey}.meta.json`);

      // Copy image to cache
      fs.copyFileSync(sourcePath, cachedImagePath);

      // Get file size
      const stats = fs.statSync(cachedImagePath);

      // Create metadata
      const metadata: CacheEntryMeta = {
        key: cacheKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.config.ttl,
        fileKey,
        nodeId,
        size: stats.size,
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      return cachedImagePath;
    } catch (error) {
      console.warn("Failed to cache image:", error);
      return sourcePath;
    }
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
    const cachedPath = await this.hasImage(fileKey, nodeId, format);
    if (!cachedPath) return false;

    try {
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.copyFileSync(cachedPath, targetPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete image cache by key
   */
  private deleteImageByKey(cacheKey: string, format: string): void {
    try {
      const imagePath = path.join(this.imageDir, `${cacheKey}.${format.toLowerCase()}`);
      const metadataPath = path.join(this.metadataDir, `img_${cacheKey}.meta.json`);

      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
    } catch {
      // Ignore errors
    }
  }

  // ==================== Maintenance Operations ====================

  /**
   * Clean all expired cache entries
   */
  async cleanExpired(): Promise<number> {
    let deletedCount = 0;
    const now = Date.now();

    try {
      const metadataFiles = fs.readdirSync(this.metadataDir);

      for (const file of metadataFiles) {
        if (!file.endsWith(".meta.json")) continue;

        const metadataPath = path.join(this.metadataDir, file);
        try {
          const metadata: CacheEntryMeta = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

          if (now > metadata.expiresAt) {
            const cacheKey = file.replace(".meta.json", "");

            if (file.startsWith("img_")) {
              // Image cache
              const imgCacheKey = cacheKey.replace("img_", "");
              ["png", "jpg", "svg", "pdf"].forEach((format) => {
                const imagePath = path.join(this.imageDir, `${imgCacheKey}.${format}`);
                if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
              });
            } else {
              // Data cache
              const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
              if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
            }

            fs.unlinkSync(metadataPath);
            deletedCount++;
          }
        } catch {
          // Skip individual errors
        }
      }
    } catch (error) {
      console.warn("Failed to clean expired cache:", error);
    }

    return deletedCount;
  }

  /**
   * Enforce size limit by removing oldest entries
   */
  async enforceSizeLimit(): Promise<number> {
    let removedCount = 0;

    try {
      const stats = await this.getStats();
      if (stats.totalSize <= this.config.maxSize) {
        return 0;
      }

      // Get all metadata entries sorted by creation time
      const entries: Array<{ path: string; meta: CacheEntryMeta }> = [];
      const metadataFiles = fs.readdirSync(this.metadataDir);

      for (const file of metadataFiles) {
        if (!file.endsWith(".meta.json")) continue;

        const metadataPath = path.join(this.metadataDir, file);
        try {
          const metadata: CacheEntryMeta = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
          entries.push({ path: metadataPath, meta: metadata });
        } catch {
          // Skip invalid entries
        }
      }

      // Sort by creation time (oldest first)
      entries.sort((a, b) => a.meta.createdAt - b.meta.createdAt);

      // Remove oldest entries until under limit
      let currentSize = stats.totalSize;
      for (const entry of entries) {
        if (currentSize <= this.config.maxSize) break;

        const cacheKey = path.basename(entry.path).replace(".meta.json", "");

        if (cacheKey.startsWith("img_")) {
          const imgKey = cacheKey.replace("img_", "");
          ["png", "jpg", "svg", "pdf"].forEach((format) => {
            const imagePath = path.join(this.imageDir, `${imgKey}.${format}`);
            if (fs.existsSync(imagePath)) {
              currentSize -= fs.statSync(imagePath).size;
              fs.unlinkSync(imagePath);
            }
          });
        } else {
          const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
          if (fs.existsSync(dataPath)) {
            currentSize -= fs.statSync(dataPath).size;
            fs.unlinkSync(dataPath);
          }
        }

        fs.unlinkSync(entry.path);
        currentSize -= entry.meta.size || 0;
        removedCount++;
      }
    } catch (error) {
      console.warn("Failed to enforce size limit:", error);
    }

    return removedCount;
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    try {
      [this.dataDir, this.imageDir, this.metadataDir].forEach((dir) => {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          files.forEach((file) => {
            fs.unlinkSync(path.join(dir, file));
          });
        }
      });
      this.stats = { hits: 0, misses: 0 };
    } catch (error) {
      console.warn("Failed to clear cache:", error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<DiskCacheStats> {
    let totalSize = 0;
    let nodeFileCount = 0;
    let imageFileCount = 0;

    try {
      if (fs.existsSync(this.dataDir)) {
        const dataFiles = fs.readdirSync(this.dataDir);
        nodeFileCount = dataFiles.filter((f) => f.endsWith(".json")).length;
        dataFiles.forEach((file) => {
          const stat = fs.statSync(path.join(this.dataDir, file));
          totalSize += stat.size;
        });
      }

      if (fs.existsSync(this.imageDir)) {
        const imageFiles = fs.readdirSync(this.imageDir);
        imageFileCount = imageFiles.length;
        imageFiles.forEach((file) => {
          const stat = fs.statSync(path.join(this.imageDir, file));
          totalSize += stat.size;
        });
      }
    } catch {
      // Ignore errors
    }

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      totalSize,
      maxSize: this.config.maxSize,
      nodeFileCount,
      imageFileCount,
    };
  }

  /**
   * Get cache directory path
   */
  getCacheDir(): string {
    return this.config.cacheDir;
  }
}
