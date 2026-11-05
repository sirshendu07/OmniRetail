import { AppError } from '../errors/AppError.js';
import { ERROR_CODES } from '../errors/errorCodes.js';

/**
 * Authorization Middleware Factory for Role-Based Access Control (RBAC).
 * Supports array syntax authorize(['ADMIN', 'MANAGER']) or rest syntax authorize('ADMIN', 'MANAGER').
 * 
 * @param {string[]|...string} args - Authorized roles or role array, with optional callback function at the end
 * @returns {import('express').RequestHandler}
 */
export function authorize(...args) {
  let allowedRoles = [];
  let ownershipCheck = null;

  if (args.length === 1 && Array.isArray(args[0])) {
    allowedRoles = args[0];
  } else {
    for (const arg of args) {
      if (typeof arg === 'function') {
        ownershipCheck = arg;
      } else if (Array.isArray(arg)) {
        allowedRoles.push(...arg);
      } else if (typeof arg === 'string') {
        allowedRoles.push(arg);
      }
    }
  }

  return async (req, _res, next) => {
    if (!req.user || !req.user.role) {
      return next(new AppError('Authentication required before authorization', 401, ERROR_CODES.UNAUTHORIZED));
    }

    const hasRole = allowedRoles.length === 0 || allowedRoles.includes(req.user.role);
    if (!hasRole) {
      return next(new AppError('You do not possess the required permissions for this action', 403, ERROR_CODES.FORBIDDEN));
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
