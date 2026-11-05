import { verifyAccessToken } from '../utils/jwt.utils.js';
import { findSessionBySessionId } from '../../modules/auth/session.repository.js';
import { AppError } from '../errors/AppError.js';
import { ERROR_CODES } from '../errors/errorCodes.js';

/**
 * Extracts raw bearer access token from cookie or Authorization header.
 * @param {import('express').Request} req 
 * @returns {string|null}
 */
function extractToken(req) {
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

/**
 * Authentication Middleware.
 * Enforces valid short-lived JWT and verifies that the parent session has not been revoked.
 */
export async function authenticate(req, _res, next) {
  const token = extractToken(req);
  if (!token) {
    return next(new AppError('Authentication required. Missing token.', 401, ERROR_CODES.UNAUTHORIZED));
  }

  try {
    const payload = verifyAccessToken(token);

    // Verify session has not been revoked
    const session = await findSessionBySessionId(payload.sessionId);
    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      return next(new AppError('Session has expired or was revoked. Please log in again.', 401, ERROR_CODES.UNAUTHORIZED));
    }

    req.user = {
      id: payload.userId,
      _id: payload.userId,
      role: payload.role
    };
    req.sessionId = payload.sessionId;

    return next();
  } catch (err) {
    return next(err);
  }
}
