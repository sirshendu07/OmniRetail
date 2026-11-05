import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { ERROR_CODES } from '../errors/errorCodes.js';
import { logger } from '../utils/logger.js';

/**
 * Formats Zod validation errors into a clean array of error details.
 * @param {ZodError} err 
 * @returns {AppError}
 */
function handleZodError(err) {
  const formatted = err.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    rule: issue.code
  }));
  return new AppError('Validation failed', 400, ERROR_CODES.VALIDATION_ERROR, formatted);
}

/**
 * Formats MongoDB duplicate key (11000) errors into a conflict AppError.
 * @param {Error} err 
 * @returns {AppError}
 */
function handleMongoDuplicateKey(err) {
  const keys = Object.keys(err.keyPattern || {});
  const field = keys.length > 0 ? keys[0] : 'field';
  const message = `A resource with this ${field} already exists`;
  return new AppError(message, 409, ERROR_CODES.CONFLICT, [{ field, message }]);
}

/**
 * Converts generic or framework-specific errors to standard AppError instances.
 * @param {Error} err 
 * @returns {AppError}
 */
function normalizeError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return handleZodError(err);
  if (err.name === 'MongoServerError' && err.code === 11000) return handleMongoDuplicateKey(err);
  if (err.name === 'CastError') {
    return new AppError(`Invalid format for ${err.path}: ${err.value}`, 400, ERROR_CODES.BAD_REQUEST);
  }
  return new AppError(err.message || 'An unexpected error occurred', 500, ERROR_CODES.INTERNAL_SERVER_ERROR, [], false);
}

/**
 * Centralized Express Error Handling Middleware.
 * Catches all errors from async handlers, normalizes them, and returns standard JSON.
 */
export function errorHandler(err, req, res, next) {
  const normalized = normalizeError(err);
  const isProduction = process.env.NODE_ENV === 'production';

  if (!normalized.isOperational) {
    logger.error({ err, correlationId: req.id, url: req.originalUrl }, 'Unhandled internal application error');
  }

  const message = isProduction && !normalized.isOperational
    ? 'An unexpected internal server error occurred'
    : normalized.message;

  const response = {
    success: false,
    message,
    code: normalized.code,
    errors: normalized.details || []
  };

  if (!isProduction && !normalized.isOperational) {
    response.stack = err.stack;
  }

  return res.status(normalized.statusCode).json(response);
}
