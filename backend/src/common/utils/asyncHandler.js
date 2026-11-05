/**
 * Wraps asynchronous Express route handlers to automatically catch rejections
 * and forward them to the global error-handling middleware.
 * @param {Function} fn - Async Express route handler
 * @returns {Function} Express middleware handler
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
