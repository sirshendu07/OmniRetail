import crypto from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger.js';

/**
 * Resolves or generates a unique correlation ID for end-to-end tracing across distributed calls.
 * @param {import('express').Request} req
 * @returns {string} Correlation ID
 */
function resolveCorrelationId(req) {
  const incomingId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  return (Array.isArray(incomingId) ? incomingId[0] : incomingId) || crypto.randomUUID();
}

/**
 * HTTP Request Logging Middleware configured with Pino.
 * Attaches request ID and correlation ID to each request and response header.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: resolveCorrelationId,
  customProps: (req) => ({
    correlationId: req.id,
    path: req.url,
    method: req.method
  }),
  customSuccessMessage: (req, res, responseTime) => {
    return `${req.method} ${req.url} completed with status ${res.statusCode} in ${responseTime}ms`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed with status ${res.statusCode}: ${err.message}`;
  }
});
