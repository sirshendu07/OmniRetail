/**
 * Middleware factory for validating incoming Express HTTP requests against Zod schemas.
 * Validates request body, query params, and route params before delegating to controllers.
 * 
 * @param {import('zod').ZodSchema} schema - Zod schema (can validate req.body or { body, query, params })
 * @returns {import('express').RequestHandler}
 */
export function validateRequest(schema) {
  return async (req, _res, next) => {
    try {
      // If the schema defines root properties for body/query/params, validate against req directly
      const isComposite = schema.shape && ('body' in schema.shape || 'query' in schema.shape || 'params' in schema.shape);
      const dataToValidate = isComposite ? { body: req.body, query: req.query, params: req.params } : req.body;
      
      const parsed = await schema.parseAsync(dataToValidate);
      if (isComposite) {
        if (parsed.body) req.body = parsed.body;
        if (parsed.query) req.query = parsed.query;
        if (parsed.params) req.params = parsed.params;
      } else {
        req.body = parsed;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
