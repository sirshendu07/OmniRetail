import { redisClient } from '../../infrastructure/redis/redis.client.js';
import { AppError } from '../errors/AppError.js';
import { ERROR_CODES } from '../errors/errorCodes.js';
import { logger } from '../utils/logger.js';

/**
 * Creates a distributed rate limiter middleware using Redis atomic counters.
 * Degrades gracefully if Redis is temporarily unreachable.
 * 
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum permitted requests within window
 * @param {string} [options.keyPrefix='rate'] - Namespace prefix
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiter({ windowMs = 60000, max = 100, keyPrefix = 'rate' }) {
  const windowSeconds = Math.ceil(windowMs / 1000);

  return async (req, res, next) => {
    if (process.env.NODE_ENV === 'test') {
      return next();
    }
    const identifier = req.ip || req.headers['x-forwarded-for'] || 'anonymous';
    const key = `${keyPrefix}:${identifier}`;

    try {
      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, windowSeconds);
      }

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - current));

      if (current > max) {
        const ttl = await redisClient.ttl(key);
        res.setHeader('Retry-After', ttl);
        return next(new AppError('Too many requests, please try again later', 429, ERROR_CODES.RATE_LIMIT_EXCEEDED));
      }

      return next();
    } catch (err) {
      // In case of Redis partition, fail-open to preserve API availability while logging warning
      logger.warn({ err: err.message, key }, 'Rate limiter Redis failure. Failing open.');
      return next();
    }
  };
}
