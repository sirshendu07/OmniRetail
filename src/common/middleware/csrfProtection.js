import { AppError } from '../errors/AppError.js';
import { ERROR_CODES } from '../errors/errorCodes.js';
import { env } from '../../config/env.config.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Validates request Origin / Referer header against configured frontend host.
 * @param {import('express').Request} req 
 * @returns {boolean}
 */
function isOriginAllowed(req) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // Non-browser server-to-server or test clients without origin are allowed if custom header is present
    return true;
  }
  const allowedOrigin = env.FRONTEND_URL.replace(/\/$/, '');
  return origin.startsWith(allowedOrigin);
}

/**
 * CSRF Protection Middleware for state-changing HTTP methods.
 * Combines strict Origin verification with custom header checks (X-Requested-With / X-CSRF-Token).
 * Prevents unauthorized cross-site form submissions using ambient cookies.
 */
export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Webhook paths are cryptographically signed by payment gateways and exempt from CSRF
  if (req.originalUrl.includes('/webhooks/')) {
    return next();
  }

  if (!isOriginAllowed(req)) {
    return next(new AppError('Forbidden: Cross-site request rejected', 403, ERROR_CODES.FORBIDDEN));
  }

  // Require custom header which cross-origin form submissions cannot forge without CORS preflight
  const customHeader = req.headers['x-requested-with'] || req.headers['x-csrf-token'];
  if (!customHeader && req.cookies && req.cookies.accessToken) {
    return next(new AppError('Missing required CSRF protection header', 403, ERROR_CODES.FORBIDDEN));
  }

  return next();
}
