import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../src/common/errors/AppError.js';
import { ERROR_CODES } from '../../src/common/errors/errorCodes.js';

describe('AppError Unit Tests', () => {
  it('should instantiate AppError with custom attributes and preserve stack', () => {
    const error = new AppError('Sample error', 400, ERROR_CODES.BAD_REQUEST, [{ field: 'sku', message: 'Required' }]);
    assert.equal(error.message, 'Sample error');
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, ERROR_CODES.BAD_REQUEST);
    assert.equal(error.isOperational, true);
    assert.deepEqual(error.details, [{ field: 'sku', message: 'Required' }]);
    assert.ok(error.stack);
  });

  it('should create notFound error via factory method', () => {
    const error = AppError.notFound('Product not found');
    assert.equal(error.statusCode, 404);
    assert.equal(error.code, ERROR_CODES.NOT_FOUND);
    assert.equal(error.message, 'Product not found');
  });

  it('should create unauthorized error via factory method', () => {
    const error = AppError.unauthorized();
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, ERROR_CODES.UNAUTHORIZED);
  });

  it('should create conflict error with details', () => {
    const details = [{ field: 'email', message: 'Already registered' }];
    const error = AppError.conflict('Email exists', ERROR_CODES.CONFLICT, details);
    assert.equal(error.statusCode, 409);
    assert.deepEqual(error.details, details);
  });
});
