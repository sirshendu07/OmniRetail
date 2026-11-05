import { AppError } from '../errors/AppError.js';
import { ERROR_CODES } from '../errors/errorCodes.js';

/**
 * Authorization Middleware Factory for Role-Based Access Control (RBAC).
 * Enforces that req.user.role matches one of the permitted roles.
 * 
 * @param {string[]} allowedRoles - Array of authorized role strings
 * @param {Function} [resourceOwnershipCheck] - Optional callback (req) => boolean | Promise<boolean>
 * @returns {import('express').RequestHandler}
 */
export function authorize(allowedRoles = [], resourceOwnershipCheck = null) {
  return async (req, _res, next) => {
    if (!req.user || !req.user.role) {
      return next(new AppError('Authentication required before authorization', 401, ERROR_CODES.UNAUTHORIZED));
    }

    const hasRole = allowedRoles.length === 0 || allowedRoles.includes(req.user.role);
    if (!hasRole) {
      return next(new AppError('You do not possess the required permissions for this action', 403, ERROR_CODES.FORBIDDEN));
    }

    if (resourceOwnershipCheck) {
      try {
        const isOwner = await resourceOwnershipCheck(req);
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
