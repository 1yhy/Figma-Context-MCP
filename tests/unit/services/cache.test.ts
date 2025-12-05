/**
 * Cache Manager Unit Tests
 *
 * Tests the file-based caching system for Figma API responses and images.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CacheManager } from "~/services/cache.js";

describe("CacheManager", () => {
  let cacheManager: CacheManager;
  let testCacheDir: string;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    testCacheDir = path.join(os.tmpdir(), `figma-cache-test-${Date.now()}`);
    cacheManager = new CacheManager({
      cacheDir: testCacheDir,
      ttl: 1000, // 1 second TTL for testing
      enabled: true,
    });
  });

  afterEach(() => {
    // Clean up test cache directory
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  describe("Configuration", () => {
    it("should create cache directories on initialization", () => {
      expect(fs.existsSync(testCacheDir)).toBe(true);
      expect(fs.existsSync(path.join(testCacheDir, "data"))).toBe(true);
      expect(fs.existsSync(path.join(testCacheDir, "images"))).toBe(true);
      expect(fs.existsSync(path.join(testCacheDir, "metadata"))).toBe(true);
    });

    it("should not create directories when disabled", () => {
      const disabledCacheDir = path.join(os.tmpdir(), `figma-cache-disabled-${Date.now()}`);
      new CacheManager({
        cacheDir: disabledCacheDir,
        enabled: false,
      });

      expect(fs.existsSync(disabledCacheDir)).toBe(false);
    });

    it("should return correct cache stats", () => {
      const stats = cacheManager.getCacheStats();

      expect(stats.enabled).toBe(true);
      expect(stats.cacheDir).toBe(testCacheDir);
      expect(stats.dataCount).toBe(0);
      expect(stats.imageCount).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe("Node Data Caching", () => {
    const testData = { id: "123", name: "Test Node", type: "FRAME" };
    const fileKey = "test-file-key";

    it("should cache and retrieve node data", async () => {
      await cacheManager.setNodeData(testData, fileKey);
      const cached = await cacheManager.getNodeData(fileKey);

      expect(cached).toEqual(testData);
    });

    it("should cache with nodeId parameter", async () => {
      const nodeId = "node-456";
      await cacheManager.setNodeData(testData, fileKey, nodeId);
      const cached = await cacheManager.getNodeData(fileKey, nodeId);

      expect(cached).toEqual(testData);
    });

    it("should cache with depth parameter", async () => {
      const nodeId = "node-789";
      const depth = 3;
      await cacheManager.setNodeData(testData, fileKey, nodeId, depth);
      const cached = await cacheManager.getNodeData(fileKey, nodeId, depth);

      expect(cached).toEqual(testData);
    });

    it("should return null for non-existent cache", async () => {
      const cached = await cacheManager.getNodeData("non-existent-key");

      expect(cached).toBeNull();
    });

    it("should return null for expired cache", async () => {
      await cacheManager.setNodeData(testData, fileKey);

      // Wait for cache to expire (TTL is 1 second)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const cached = await cacheManager.getNodeData(fileKey);
      expect(cached).toBeNull();
    });

    it("should update cache stats after caching data", async () => {
      await cacheManager.setNodeData(testData, fileKey);
      const stats = cacheManager.getCacheStats();

      expect(stats.dataCount).toBe(1);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });

  describe("Image Caching", () => {
    const fileKey = "test-file";
    const nodeId = "image-node";
    const format = "png";
    let testImagePath: string;

    beforeEach(() => {
      // Create a test image file
      testImagePath = path.join(os.tmpdir(), `test-image-${Date.now()}.png`);
      fs.writeFileSync(testImagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG header
    });

    afterEach(() => {
      if (fs.existsSync(testImagePath)) {
        fs.unlinkSync(testImagePath);
      }
    });

    it("should return null for uncached image", async () => {
      const result = await cacheManager.hasImage(fileKey, nodeId, format);
      expect(result).toBeNull();
    });

    it("should cache and find image", async () => {
      await cacheManager.cacheImage(testImagePath, fileKey, nodeId, format);
      const cachedPath = await cacheManager.hasImage(fileKey, nodeId, format);

      expect(cachedPath).not.toBeNull();
      expect(fs.existsSync(cachedPath!)).toBe(true);
    });

    it("should copy image from cache to target path", async () => {
      await cacheManager.cacheImage(testImagePath, fileKey, nodeId, format);

      const targetPath = path.join(os.tmpdir(), `target-${Date.now()}.png`);
      const success = await cacheManager.copyImageFromCache(fileKey, nodeId, format, targetPath);

      expect(success).toBe(true);
      expect(fs.existsSync(targetPath)).toBe(true);

      // Clean up
      fs.unlinkSync(targetPath);
    });

    it("should return false when copying non-existent image", async () => {
      const targetPath = path.join(os.tmpdir(), `target-${Date.now()}.png`);
      const success = await cacheManager.copyImageFromCache(
        "non-existent",
        "non-existent",
        format,
        targetPath,
      );

      expect(success).toBe(false);
    });

    it("should update cache stats after caching image", async () => {
      await cacheManager.cacheImage(testImagePath, fileKey, nodeId, format);
      const stats = cacheManager.getCacheStats();

      expect(stats.imageCount).toBe(1);
    });
  });

  describe("Cache Cleanup", () => {
    it("should clean expired cache entries", async () => {
      const testData = { id: "test" };
      await cacheManager.setNodeData(testData, "file-1");

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = await cacheManager.cleanExpiredCache();
      expect(result.deletedCount).toBe(1);

      const stats = cacheManager.getCacheStats();
      expect(stats.dataCount).toBe(0);
    });

    it("should clear all cache", async () => {
      await cacheManager.setNodeData({ id: "1" }, "file-1");
      await cacheManager.setNodeData({ id: "2" }, "file-2");

      await cacheManager.clearAllCache();

      const stats = cacheManager.getCacheStats();
      expect(stats.dataCount).toBe(0);
      expect(stats.imageCount).toBe(0);
    });
  });

  describe("Disabled Cache", () => {
    let disabledCacheManager: CacheManager;

    beforeEach(() => {
      disabledCacheManager = new CacheManager({ enabled: false });
    });

    it("should return null for getNodeData when disabled", async () => {
      const result = await disabledCacheManager.getNodeData("any-key");
      expect(result).toBeNull();
    });

    it("should do nothing for setNodeData when disabled", async () => {
      await disabledCacheManager.setNodeData({ id: "test" }, "file-key");
      const result = await disabledCacheManager.getNodeData("file-key");
      expect(result).toBeNull();
    });

    it("should return null for hasImage when disabled", async () => {
      const result = await disabledCacheManager.hasImage("file", "node", "png");
      expect(result).toBeNull();
    });

    it("should return source path for cacheImage when disabled", async () => {
      const sourcePath = "/path/to/image.png";
      const result = await disabledCacheManager.cacheImage(sourcePath, "file", "node", "png");
      expect(result).toBe(sourcePath);
    });

    it("should return zero for cleanExpiredCache when disabled", async () => {
      const result = await disabledCacheManager.cleanExpiredCache();
      expect(result.deletedCount).toBe(0);
    });

    it("should report disabled in stats", () => {
      const stats = disabledCacheManager.getCacheStats();
      expect(stats.enabled).toBe(false);
    });
  });
});
