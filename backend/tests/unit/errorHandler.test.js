import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { errorHandler } from '../../src/common/middleware/errorHandler.js';
import { AppError } from '../../src/common/errors/AppError.js';
import { ERROR_CODES } from '../../src/common/errors/errorCodes.js';

function createMockResponse() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

describe('errorHandler Middleware Unit Tests', () => {
  const req = { id: 'req-test-1', originalUrl: '/test' };

  it('correctly handles AppError with custom status and error code', () => {
    const res = createMockResponse();
    const err = AppError.notFound('Item missing');

    errorHandler(err, req, res, () => {});
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, ERROR_CODES.NOT_FOUND);
    assert.equal(res.body.message, 'Item missing');
  });

  it('correctly formats Zod validation errors with field details', () => {
    const res = createMockResponse();
    const schema = z.object({ email: z.string().email(), quantity: z.number().min(1) });
    const result = schema.safeParse({ email: 'invalid-email', quantity: 0 });

    assert.equal(result.success, false);
    errorHandler(result.error, req, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, ERROR_CODES.VALIDATION_ERROR);
    assert.equal(res.body.errors.length, 2);
    assert.equal(res.body.errors[0].field, 'email');
  });

  it('correctly formats Mongo duplicate key error (code 11000) into 409 Conflict', () => {
    const res = createMockResponse();
    const mongoErr = new Error('E11000 duplicate key error');
    mongoErr.name = 'MongoServerError';
    mongoErr.code = 11000;
    mongoErr.keyPattern = { sku: 1 };

    errorHandler(mongoErr, req, res, () => {});
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, ERROR_CODES.CONFLICT);
    assert.ok(res.body.message.includes('sku'));
  });

  it('masks internal error messages in production environment', () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = createMockResponse();
      const internalErr = new TypeError('Cannot read property of undefined in secret db query');

      errorHandler(internalErr, req, res, () => {});
      assert.equal(res.statusCode, 500);
      assert.equal(res.body.message, 'An unexpected internal server error occurred');
      assert.equal(res.body.stack, undefined);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});
