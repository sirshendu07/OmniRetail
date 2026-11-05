/**
 * Standardized API Response Utilities.
 * Ensures uniform JSON structure across all API endpoints.
 */

/**
 * Sends a successful JSON response.
 * @param {import('express').Response} res - Express response object
 * @param {string} message - Human-readable success message
 * @param {any} [data={}] - Response payload
 * @param {number} [statusCode=200] - HTTP status code
 * @param {Object} [meta={}] - Optional metadata (e.g. pagination, timestamps)
 */
export function sendSuccess(res, message = 'Success', data = {}, statusCode = 200, meta = {}) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta
  });
}

/**
 * Sends a 201 Created JSON response.
 * @param {import('express').Response} res 
 * @param {string} message 
 * @param {any} [data={}] 
 * @param {Object} [meta={}] 
 */
export function sendCreated(res, message = 'Resource created successfully', data = {}, meta = {}) {
  return sendSuccess(res, message, data, 201, meta);
}
