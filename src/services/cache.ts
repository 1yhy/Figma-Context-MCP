import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Cache directory */
  cacheDir: string;
  /** Cache expiration time (milliseconds), default 24 hours */
  ttl: number;
  /** Whether cache is enabled */
  enabled: boolean;
}

/**
 * Cache metadata
 */
interface CacheMetadata {
  /** Creation time */
  createdAt: number;
  /** Expiration time */
  expiresAt: number;
  /** File key */
  fileKey: string;
  /** Node ID */
  nodeId?: string;
  /** Depth */
  depth?: number;
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  cacheDir: path.join(os.homedir(), ".figma-mcp-cache"),
  ttl: 24 * 60 * 60 * 1000, // 24 hours
  enabled: true,
};

/**
 * File cache manager
 * Used for caching Figma API response data and images
 */
export class CacheManager {
  private config: CacheConfig;
  private dataDir: string;
  private imageDir: string;
  private metadataDir: string;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dataDir = path.join(this.config.cacheDir, "data");
    this.imageDir = path.join(this.config.cacheDir, "images");
    this.metadataDir = path.join(this.config.cacheDir, "metadata");

    if (this.config.enabled) {
      this.ensureCacheDirectories();
    }
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
      this.config.enabled = false;
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(fileKey: string, nodeId?: string, depth?: number): string {
    const keyParts = [fileKey];
    if (nodeId) keyParts.push(`node-${nodeId}`);
    if (depth !== undefined) keyParts.push(`depth-${depth}`);

    const keyString = keyParts.join("_");
    return crypto.createHash("md5").update(keyString).digest("hex");
  }

  /**
   * Generate image cache key
   */
  private generateImageCacheKey(fileKey: string, nodeId: string, format: string): string {
    const keyString = `${fileKey}_${nodeId}_${format}`;
    return crypto.createHash("md5").update(keyString).digest("hex");
  }

  /**
   * Get cached node data
   */
  async getNodeData<T>(fileKey: string, nodeId?: string, depth?: number): Promise<T | null> {
    if (!this.config.enabled) return null;

    try {
      const cacheKey = this.generateCacheKey(fileKey, nodeId, depth);
      const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
      const metadataPath = path.join(this.metadataDir, `${cacheKey}.meta.json`);

      // Check if files exist
      if (!fs.existsSync(dataPath) || !fs.existsSync(metadataPath)) {
        return null;
      }

      // Read metadata and check if expired
      const metadata: CacheMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      if (Date.now() > metadata.expiresAt) {
        // Cache has expired, delete files
        this.deleteCache(cacheKey);
        return null;
      }

      // Read and return cached data
      const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      return data as T;
    } catch (error) {
      console.warn("Failed to read cache:", error);
      return null;
    }
  }

  /**
   * Set node data cache
   */
  async setNodeData<T>(data: T, fileKey: string, nodeId?: string, depth?: number): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const cacheKey = this.generateCacheKey(fileKey, nodeId, depth);
      const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
      const metadataPath = path.join(this.metadataDir, `${cacheKey}.meta.json`);

      // Create metadata
      const metadata: CacheMetadata = {
        createdAt: Date.now(),
        expiresAt: Date.now() + this.config.ttl,
        fileKey,
        nodeId,
        depth,
      };

      // Write data and metadata
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.warn("Failed to write cache:", error);
    }
  }

  /**
   * Check if image is cached
   */
  async hasImage(fileKey: string, nodeId: string, format: string): Promise<string | null> {
    if (!this.config.enabled) return null;

    try {
      const cacheKey = this.generateImageCacheKey(fileKey, nodeId, format);
      const imagePath = path.join(this.imageDir, `${cacheKey}.${format.toLowerCase()}`);
      const metadataPath = path.join(this.metadataDir, `img_${cacheKey}.meta.json`);

      if (!fs.existsSync(imagePath) || !fs.existsSync(metadataPath)) {
        return null;
      }

      // Check if expired
      const metadata: CacheMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      if (Date.now() > metadata.expiresAt) {
        this.deleteImageCache(cacheKey, format);
        return null;
      }

      return imagePath;
    } catch (error) {
      return null;
    }
  }

  /**
   * Cache image
   */
  async cacheImage(
    sourcePath: string,
    fileKey: string,
    nodeId: string,
    format: string,
  ): Promise<string> {
    if (!this.config.enabled) return sourcePath;

    try {
      const cacheKey = this.generateImageCacheKey(fileKey, nodeId, format);
      const cachedImagePath = path.join(this.imageDir, `${cacheKey}.${format.toLowerCase()}`);
      const metadataPath = path.join(this.metadataDir, `img_${cacheKey}.meta.json`);

      // Copy image to cache directory
      fs.copyFileSync(sourcePath, cachedImagePath);

      // Create metadata
      const metadata: CacheMetadata = {
        createdAt: Date.now(),
        expiresAt: Date.now() + this.config.ttl,
        fileKey,
        nodeId,
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
      // Ensure target directory exists
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.copyFileSync(cachedPath, targetPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete cache
   */
  private deleteCache(cacheKey: string): void {
    try {
      const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
      const metadataPath = path.join(this.metadataDir, `${cacheKey}.meta.json`);

      if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
      if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
    } catch (error) {
      // Ignore deletion errors
    }
  }

  /**
   * Delete image cache
   */
  private deleteImageCache(cacheKey: string, format: string): void {
    try {
      const imagePath = path.join(this.imageDir, `${cacheKey}.${format.toLowerCase()}`);
      const metadataPath = path.join(this.metadataDir, `img_${cacheKey}.meta.json`);

      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
    } catch (error) {
      // Ignore deletion errors
    }
  }

  /**
   * Clean all expired cache
   */
  async cleanExpiredCache(): Promise<{ deletedCount: number }> {
    if (!this.config.enabled) return { deletedCount: 0 };

    let deletedCount = 0;
    const now = Date.now();

    try {
      const metadataFiles = fs.readdirSync(this.metadataDir);

      for (const file of metadataFiles) {
        if (!file.endsWith(".meta.json")) continue;

        const metadataPath = path.join(this.metadataDir, file);
        try {
          const metadata: CacheMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

          if (now > metadata.expiresAt) {
            const cacheKey = file.replace(".meta.json", "");

            if (file.startsWith("img_")) {
              // Image cache
              const imgCacheKey = cacheKey.replace("img_", "");
              // Try to delete various formats
              ["png", "jpg", "svg"].forEach((format) => {
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
          // Ignore individual file errors
        }
      }
    } catch (error) {
      console.warn("Failed to clean expired cache:", error);
    }

    return { deletedCount };
  }

  /**
   * Clear all cache
   */
  async clearAllCache(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      [this.dataDir, this.imageDir, this.metadataDir].forEach((dir) => {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          files.forEach((file) => {
            fs.unlinkSync(path.join(dir, file));
          });
        }
      });
    } catch (error) {
      console.warn("Failed to clear cache:", error);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    enabled: boolean;
    cacheDir: string;
    dataCount: number;
    imageCount: number;
    totalSize: number;
  } {
    if (!this.config.enabled) {
      return {
        enabled: false,
        cacheDir: this.config.cacheDir,
        dataCount: 0,
        imageCount: 0,
        totalSize: 0,
      };
    }

    let dataCount = 0;
    let imageCount = 0;
    let totalSize = 0;

    try {
      if (fs.existsSync(this.dataDir)) {
        const dataFiles = fs.readdirSync(this.dataDir);
        dataCount = dataFiles.filter((f) => f.endsWith(".json")).length;
        dataFiles.forEach((file) => {
          const stat = fs.statSync(path.join(this.dataDir, file));
          totalSize += stat.size;
        });
      }

      if (fs.existsSync(this.imageDir)) {
        const imageFiles = fs.readdirSync(this.imageDir);
        imageCount = imageFiles.length;
        imageFiles.forEach((file) => {
          const stat = fs.statSync(path.join(this.imageDir, file));
          totalSize += stat.size;
        });
      }
    } catch {
      // Ignore errors
    }

    return {
      enabled: this.config.enabled,
      cacheDir: this.config.cacheDir,
      dataCount,
      imageCount,
      totalSize,
    };
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
