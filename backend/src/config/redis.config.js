import { env } from './env.config.js';

/**
 * Calculates exponential backoff with jitter for Redis reconnection.
 * @param {number} times - Reconnection attempt count
 * @returns {number} Delay in milliseconds
 */
function calculateReconnectDelay(times) {
  const maxDelay = 3000;
  const baseDelay = Math.min(times * 200, maxDelay);
  const jitter = Math.floor(Math.random() * 200);
  return baseDelay + jitter;
}

/**
 * Redis Connection Configuration for ioredis.
 * Supports TLS for Upstash Redis and plain TCP for local Docker Redis.
 */
export const redisConfig = Object.freeze({
  url: env.REDIS_URL,
  options: {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 10000,
    retryStrategy: (times) => {
      if (times > 10) {
        return null; // Stop retrying after 10 attempts to prevent unbounded loops
      }
      return calculateReconnectDelay(times);
    }
  }
});
