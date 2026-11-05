import Redis from 'ioredis';
import { redisConfig } from '../../config/redis.config.js';
import { logger } from '../../common/utils/logger.js';

let isConnected = false;

export const redisClient = new Redis(redisConfig.url, redisConfig.options);

redisClient.on('connect', () => {
  logger.info('Redis client socket connected');
});

redisClient.on('ready', () => {
  isConnected = true;
  logger.info('Redis client initialized and ready for commands');
});

redisClient.on('error', (err) => {
  isConnected = false;
  logger.error({ err: err.message }, 'Redis client encountered connection error');
});

redisClient.on('close', () => {
  isConnected = false;
  logger.warn('Redis client connection closed');
});

redisClient.on('reconnecting', (delay) => {
  logger.warn({ delay }, 'Redis client attempting to reconnect');
});

/**
 * Explicitly connects to Redis server if not already connected.
 * @returns {Promise<boolean>}
 */
export async function connectRedis() {
  if (redisClient.status === 'ready' || redisClient.status === 'connecting') {
    return true;
  }
  try {
    await redisClient.connect();
    return true;
  } catch (err) {
    logger.warn({ err: err.message }, 'Unable to connect to Redis. Running in degraded mode.');
    return false;
  }
}

/**
 * Checks Redis connectivity by issuing a PING command.
 * @returns {Promise<boolean>}
 */
export async function isRedisHealthy() {
  if (!isConnected || redisClient.status !== 'ready') return false;
  try {
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis ping health check failed');
    return false;
  }
}

/**
 * Gracefully terminates the Redis client connection.
 * @returns {Promise<void>}
 */
export async function disconnectRedis() {
  if (redisClient.status !== 'end' && redisClient.status !== 'wait') {
    await redisClient.quit();
    isConnected = false;
    logger.info('Redis connection closed gracefully');
  }
}
