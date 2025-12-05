/**
 * Cache Manager Unit Tests
 *
 * Tests the multi-layer caching system for Figma API responses and images.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { CacheManager } from "~/services/cache/index.js";

describe("CacheManager", () => {
  let cacheManager: CacheManager;
  let testCacheDir: string;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    testCacheDir = path.join(os.tmpdir(), `figma-cache-test-${Date.now()}`);
    cacheManager = new CacheManager({
      enabled: true,
      memory: {
        maxNodeItems: 100,
        maxImageItems: 50,
        nodeTTL: 1000, // 1 second TTL for testing
        imageTTL: 1000,
      },
      disk: {
        cacheDir: testCacheDir,
        maxSize: 100 * 1024 * 1024,
        ttl: 1000, // 1 second TTL for testing
      },
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
        enabled: false,
        disk: {
          cacheDir: disabledCacheDir,
          maxSize: 100 * 1024 * 1024,
          ttl: 1000,
        },
      });

      expect(fs.existsSync(disabledCacheDir)).toBe(false);
    });

    it("should return correct cache stats", async () => {
      const stats = await cacheManager.getStats();

      expect(stats.enabled).toBe(true);
      expect(stats.memory.size).toBe(0);
      expect(stats.disk.nodeFileCount).toBe(0);
      expect(stats.disk.imageFileCount).toBe(0);
      expect(stats.disk.totalSize).toBe(0);
    });

    it("should return cache directory", () => {
      expect(cacheManager.getCacheDir()).toBe(testCacheDir);
    });

    it("should report enabled status", () => {
      expect(cacheManager.isEnabled()).toBe(true);
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
      const stats = await cacheManager.getStats();

      expect(stats.memory.size).toBe(1);
      expect(stats.disk.nodeFileCount).toBe(1);
      expect(stats.disk.totalSize).toBeGreaterThan(0);
    });

    it("should check if node data exists", async () => {
      expect(await cacheManager.hasNodeData(fileKey)).toBe(false);
      await cacheManager.setNodeData(testData, fileKey);
      expect(await cacheManager.hasNodeData(fileKey)).toBe(true);
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
      const stats = await cacheManager.getStats();

      expect(stats.disk.imageFileCount).toBe(1);
    });
  });

  describe("Cache Cleanup", () => {
    it("should clean expired cache entries", async () => {
      const testData = { id: "test" };
      await cacheManager.setNodeData(testData, "file-1");

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = await cacheManager.cleanExpired();
      expect(result.disk).toBeGreaterThanOrEqual(1);

      const stats = await cacheManager.getStats();
      expect(stats.disk.nodeFileCount).toBe(0);
    });

    it("should clear all cache", async () => {
      await cacheManager.setNodeData({ id: "1" }, "file-1");
      await cacheManager.setNodeData({ id: "2" }, "file-2");

      await cacheManager.clearAll();

      const stats = await cacheManager.getStats();
      expect(stats.memory.size).toBe(0);
      expect(stats.disk.nodeFileCount).toBe(0);
      expect(stats.disk.imageFileCount).toBe(0);
    });
  });

  describe("Cache Invalidation", () => {
    it("should invalidate all entries for a file", async () => {
      const fileKey = "test-file";
      await cacheManager.setNodeData({ id: "1" }, fileKey, "node-1");
      await cacheManager.setNodeData({ id: "2" }, fileKey, "node-2");
      await cacheManager.setNodeData({ id: "3" }, "other-file", "node-3");

      const result = await cacheManager.invalidateFile(fileKey);

      expect(result.memory).toBe(2);
      expect(await cacheManager.getNodeData(fileKey, "node-1")).toBeNull();
      expect(await cacheManager.getNodeData(fileKey, "node-2")).toBeNull();
      // Other file should still be cached
      expect(await cacheManager.getNodeData("other-file", "node-3")).not.toBeNull();
    });

    it("should invalidate a specific node", async () => {
      const fileKey = "test-file";
      await cacheManager.setNodeData({ id: "1" }, fileKey, "node-1");
      await cacheManager.setNodeData({ id: "2" }, fileKey, "node-2");

      const result = await cacheManager.invalidateNode(fileKey, "node-1");

      expect(result.memory).toBe(1);
      expect(await cacheManager.getNodeData(fileKey, "node-1")).toBeNull();
      expect(await cacheManager.getNodeData(fileKey, "node-2")).not.toBeNull();
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

    it("should return zero for cleanExpired when disabled", async () => {
      const result = await disabledCacheManager.cleanExpired();
      expect(result.memory).toBe(0);
      expect(result.disk).toBe(0);
    });

    it("should report disabled in stats", async () => {
      const stats = await disabledCacheManager.getStats();
      expect(stats.enabled).toBe(false);
    });

    it("should report disabled status", () => {
      expect(disabledCacheManager.isEnabled()).toBe(false);
    });
  });

  describe("Memory Cache (L1)", () => {
    it("should serve from memory cache on second read", async () => {
      const testData = { id: "memory-test" };
      const fileKey = "memory-file";

      await cacheManager.setNodeData(testData, fileKey);

      // First read - populates memory from disk if needed
      const first = await cacheManager.getNodeData(fileKey);
      expect(first).toEqual(testData);

      // Second read should hit memory cache
      const second = await cacheManager.getNodeData(fileKey);
      expect(second).toEqual(testData);

      const stats = await cacheManager.getStats();
      expect(stats.memory.hits).toBeGreaterThan(0);
    });

    it("should track cache statistics", async () => {
      // Initial stats
      let stats = await cacheManager.getStats();
      expect(stats.memory.hits).toBe(0);
      expect(stats.memory.misses).toBe(0);

      // Miss
      await cacheManager.getNodeData("non-existent");
      stats = await cacheManager.getStats();
      expect(stats.memory.misses).toBe(1);

      // Set and hit
      await cacheManager.setNodeData({ test: 1 }, "key");
      await cacheManager.getNodeData("key");
      stats = await cacheManager.getStats();
      expect(stats.memory.hits).toBe(1);
    });

    it("should reset statistics", async () => {
      await cacheManager.setNodeData({ test: 1 }, "key");
      await cacheManager.getNodeData("key");
      await cacheManager.getNodeData("non-existent");

      cacheManager.resetStats();
      const stats = await cacheManager.getStats();
      expect(stats.memory.hits).toBe(0);
      expect(stats.memory.misses).toBe(0);
    });
  });
});
