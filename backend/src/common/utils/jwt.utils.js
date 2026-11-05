import jwt from 'jsonwebtoken';
import { env } from '../../config/env.config.js';
import { AppError } from '../errors/AppError.js';
import { ERROR_CODES } from '../errors/errorCodes.js';

/**
 * Signs a short-lived JWT access token containing essential authorization claims.
 * @param {Object} payload 
 * @param {string} payload.userId 
 * @param {string} payload.role 
 * @param {string} payload.sessionId 
 * @returns {string} Signed JWT
 */
export function generateAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
    issuer: 'omni-retail-auth',
    audience: 'omni-retail-api'
  });
}

/**
 * Verifies and decodes a JWT access token.
 * Maps JWT verification errors to standard AppError instances.
 * @param {string} token 
 * @returns {Object} Decoded payload
 */
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'omni-retail-auth',
      audience: 'omni-retail-api'
    });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Access token has expired', 401, ERROR_CODES.TOKEN_EXPIRED);
    }
    throw new AppError('Invalid access token', 401, ERROR_CODES.INVALID_TOKEN);
  }
}
