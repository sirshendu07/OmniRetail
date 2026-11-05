import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { validateRequest } from '../../src/common/middleware/validateRequest.js';

describe('validateRequest Middleware Unit Tests', () => {
  const testSchema = z.object({
    productId: z.string().min(3),
    quantity: z.number().int().positive()
  });

  it('passes valid request body to next() with parsed data', async () => {
    const middleware = validateRequest(testSchema);
    const req = { body: { productId: 'PROD-001', quantity: 5 } };
    let nextCalled = false;
    let errorPassed = null;

    await middleware(req, {}, (err) => {
      nextCalled = true;
      errorPassed = err;
    });

    assert.equal(nextCalled, true);
    assert.equal(errorPassed, undefined);
    assert.equal(req.body.productId, 'PROD-001');
    assert.equal(req.body.quantity, 5);
  });

  it('forwards Zod validation error to next() when body is invalid', async () => {
    const middleware = validateRequest(testSchema);
    const req = { body: { productId: 'X', quantity: -1 } };
    let nextCalled = false;
    let errorPassed = null;

    await middleware(req, {}, (err) => {
      nextCalled = true;
      errorPassed = err;
    });

    assert.equal(nextCalled, true);
    assert.ok(errorPassed);
    assert.equal(errorPassed.name, 'ZodError');
    assert.equal(errorPassed.issues.length, 2);
  });
});
