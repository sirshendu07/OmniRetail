import { ERROR_CODES } from './errorCodes.js';

/**
 * Custom Application Error class for predictable operational error handling.
 * Inherits from native Error and preserves error stack traces.
 */
export class AppError extends Error {
  /**
   * @param {string} message - Human-readable error description
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Application-specific error code from ERROR_CODES
   * @param {Array|Object} [details=[]] - Optional structured validation or contextual errors
   * @param {boolean} [isOperational=true] - Indicates trusted operational errors vs fatal bugs
   */
  constructor(message, statusCode = 500, code = ERROR_CODES.INTERNAL_SERVER_ERROR, details = [], isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', code = ERROR_CODES.BAD_REQUEST, details = []) {
    return new AppError(message, 400, code, details);
  }

  static unauthorized(message = 'Unauthorized access', code = ERROR_CODES.UNAUTHORIZED) {
    return new AppError(message, 401, code);
  }

  static forbidden(message = 'Forbidden action', code = ERROR_CODES.FORBIDDEN) {
    return new AppError(message, 403, code);
  }

  static notFound(message = 'Resource not found', code = ERROR_CODES.NOT_FOUND) {
    return new AppError(message, 404, code);
  }

  static conflict(message = 'Resource state conflict', code = ERROR_CODES.CONFLICT, details = []) {
    return new AppError(message, 409, code, details);
  }

  static internal(message = 'Internal server error', code = ERROR_CODES.INTERNAL_SERVER_ERROR) {
    return new AppError(message, 500, code, [], false);
  }
}
