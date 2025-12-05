import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 缓存目录 */
  cacheDir: string;
  /** 缓存过期时间（毫秒），默认 24 小时 */
  ttl: number;
  /** 是否启用缓存 */
  enabled: boolean;
}

/**
 * 缓存元数据
 */
interface CacheMetadata {
  /** 创建时间 */
  createdAt: number;
  /** 过期时间 */
  expiresAt: number;
  /** 文件 key */
  fileKey: string;
  /** 节点 ID */
  nodeId?: string;
  /** 深度 */
  depth?: number;
}

/**
 * 默认缓存配置
 */
const DEFAULT_CONFIG: CacheConfig = {
  cacheDir: path.join(os.homedir(), ".figma-mcp-cache"),
  ttl: 24 * 60 * 60 * 1000, // 24 小时
  enabled: true,
};

/**
 * 文件缓存管理器
 * 用于缓存 Figma API 响应数据和图片
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
   * 确保缓存目录存在
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
   * 生成缓存 key
   */
  private generateCacheKey(fileKey: string, nodeId?: string, depth?: number): string {
    const keyParts = [fileKey];
    if (nodeId) keyParts.push(`node-${nodeId}`);
    if (depth !== undefined) keyParts.push(`depth-${depth}`);

    const keyString = keyParts.join("_");
    return crypto.createHash("md5").update(keyString).digest("hex");
  }

  /**
   * 生成图片缓存 key
   */
  private generateImageCacheKey(fileKey: string, nodeId: string, format: string): string {
    const keyString = `${fileKey}_${nodeId}_${format}`;
    return crypto.createHash("md5").update(keyString).digest("hex");
  }

  /**
   * 获取缓存的节点数据
   */
  async getNodeData<T>(fileKey: string, nodeId?: string, depth?: number): Promise<T | null> {
    if (!this.config.enabled) return null;

    try {
      const cacheKey = this.generateCacheKey(fileKey, nodeId, depth);
      const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
      const metadataPath = path.join(this.metadataDir, `${cacheKey}.meta.json`);

      // 检查文件是否存在
      if (!fs.existsSync(dataPath) || !fs.existsSync(metadataPath)) {
        return null;
      }

      // 读取元数据检查是否过期
      const metadata: CacheMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      if (Date.now() > metadata.expiresAt) {
        // 缓存已过期，删除文件
        this.deleteCache(cacheKey);
        return null;
      }

      // 读取并返回缓存数据
      const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      return data as T;
    } catch (error) {
      console.warn("Failed to read cache:", error);
      return null;
    }
  }

  /**
   * 设置节点数据缓存
   */
  async setNodeData<T>(data: T, fileKey: string, nodeId?: string, depth?: number): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const cacheKey = this.generateCacheKey(fileKey, nodeId, depth);
      const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
      const metadataPath = path.join(this.metadataDir, `${cacheKey}.meta.json`);

      // 创建元数据
      const metadata: CacheMetadata = {
        createdAt: Date.now(),
        expiresAt: Date.now() + this.config.ttl,
        fileKey,
        nodeId,
        depth,
      };

      // 写入数据和元数据
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.warn("Failed to write cache:", error);
    }
  }

  /**
   * 检查图片是否已缓存
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

      // 检查是否过期
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
   * 缓存图片
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

      // 复制图片到缓存目录
      fs.copyFileSync(sourcePath, cachedImagePath);

      // 创建元数据
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
   * 从缓存复制图片到目标路径
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
      // 确保目标目录存在
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
   * 删除缓存
   */
  private deleteCache(cacheKey: string): void {
    try {
      const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
      const metadataPath = path.join(this.metadataDir, `${cacheKey}.meta.json`);

      if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
      if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
    } catch (error) {
      // 忽略删除错误
    }
  }

  /**
   * 删除图片缓存
   */
  private deleteImageCache(cacheKey: string, format: string): void {
    try {
      const imagePath = path.join(this.imageDir, `${cacheKey}.${format.toLowerCase()}`);
      const metadataPath = path.join(this.metadataDir, `img_${cacheKey}.meta.json`);

      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
    } catch (error) {
      // 忽略删除错误
    }
  }

  /**
   * 清理所有过期缓存
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
              // 图片缓存
              const imgCacheKey = cacheKey.replace("img_", "");
              // 尝试删除各种格式
              ["png", "jpg", "svg"].forEach((format) => {
                const imagePath = path.join(this.imageDir, `${imgCacheKey}.${format}`);
                if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
              });
            } else {
              // 数据缓存
              const dataPath = path.join(this.dataDir, `${cacheKey}.json`);
              if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
            }

            fs.unlinkSync(metadataPath);
            deletedCount++;
          }
        } catch {
          // 忽略单个文件的错误
        }
      }
    } catch (error) {
      console.warn("Failed to clean expired cache:", error);
    }

    return { deletedCount };
  }

  /**
   * 清空所有缓存
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
   * 获取缓存统计信息
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
      // 忽略错误
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

// 导出单例实例
export const cacheManager = new CacheManager();
