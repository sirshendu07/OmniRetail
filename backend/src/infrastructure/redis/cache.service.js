import { redisClient } from './redis.client.js';
import { logger } from '../../common/utils/logger.js';

/**
 * Retrieves a cached object from Redis using Cache-Aside strategy.
 * Returns null if cache misses or Redis is unavailable.
 */
export async function getCached(key) {
  try {
    const raw = await redisClient.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn({ err: err.message, key }, 'Redis cache read error. Falling back to DB.');
    return null;
  }
}

/**
 * Persists an object in Redis with a time-to-live.
 */
export async function setCached(key, value, ttlSeconds = 3600) {
  try {
    const serialized = JSON.stringify(value);
    await redisClient.set(key, serialized, 'EX', ttlSeconds);
    return true;
  } catch (err) {
    logger.warn({ err: err.message, key }, 'Redis cache write error');
    return false;
  }
}

/**
 * Invalidates a specific cache key.
 */
export async function invalidateCache(key) {
  try {
    await redisClient.del(key);
    return true;
  } catch (err) {
    logger.warn({ err: err.message, key }, 'Redis cache invalidation error');
    return false;
  }
}

/**
 * Invalidates multiple cache keys matching a pattern.
 */
export async function invalidateCachePattern(pattern) {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
    return true;
  } catch (err) {
    logger.warn({ err: err.message, pattern }, 'Redis cache pattern invalidation error');
    return false;
  }
}
