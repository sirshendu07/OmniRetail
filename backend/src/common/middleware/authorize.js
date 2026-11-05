import { AppError } from '../errors/AppError.js';
import { ERROR_CODES } from '../errors/errorCodes.js';

/**
 * Authorization Middleware Factory for Role-Based Access Control (RBAC).
 * Supports array syntax authorize(['ADMIN', 'MANAGER']) or rest syntax authorize('ADMIN', 'MANAGER').
 * 
 * @param {string[]|...string} args - Authorized roles or role array, with optional callback function at the end
 * @returns {import('express').RequestHandler}
 */
function parseAuthorizeArgs(args) {
  let allowedRoles = [];
  let ownershipCheck = null;

  for (const arg of args) {
    if (typeof arg === 'function') ownershipCheck = arg;
    else if (Array.isArray(arg)) allowedRoles.push(...arg);
    else if (typeof arg === 'string') allowedRoles.push(arg);
  }
  return { allowedRoles, ownershipCheck };
}

export function authorize(...args) {
  const { allowedRoles, ownershipCheck } = parseAuthorizeArgs(args);

  return async (req, _res, next) => {
    if (!req.user?.role) {
      return next(new AppError('Authentication required', 401, ERROR_CODES.UNAUTHORIZED));
    }
    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      return next(new AppError('Forbidden: Insufficient permissions', 403, ERROR_CODES.FORBIDDEN));
    }
    if (ownershipCheck) {
      try {
        const isOwner = await ownershipCheck(req);
        if (!isOwner && req.user.role !== 'ADMIN') {
          return next(new AppError('Access denied: You do not own this resource', 403, ERROR_CODES.FORBIDDEN));
        }
      } catch (err) {
        return next(err);
      }
    }
    return next();
  };
}
