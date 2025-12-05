/**
 * Cache Service (Backward Compatibility)
 *
 * This file re-exports from the new cache module for backward compatibility.
 * New code should import directly from './cache/index.js'
 *
 * @deprecated Import from './cache/index.js' instead
 * @module services/cache
 */

export {
  CacheManager,
  cacheManager,
  type CacheConfig,
  type CacheStatistics,
} from "./cache/index.js";

// Re-export for backward compatibility with existing imports
export type { DiskCacheConfig as CacheConfig_Legacy } from "./cache/index.js";
