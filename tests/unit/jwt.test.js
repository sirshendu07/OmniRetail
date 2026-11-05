import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateAccessToken, verifyAccessToken } from '../../src/common/utils/jwt.utils.js';
import { AppError } from '../../src/common/errors/AppError.js';

describe('JWT Utilities Unit Tests', () => {
  const payload = {
    userId: '60d5ecb8b5c9c61234567890',
    role: 'ADMIN',
    sessionId: 'session-uuid-123'
  };

  it('generates a valid JWT access token and decodes claims', () => {
    const token = generateAccessToken(payload);
    assert.ok(typeof token === 'string' && token.length > 20);

    const decoded = verifyAccessToken(token);
    assert.equal(decoded.userId, payload.userId);
    assert.equal(decoded.role, payload.role);
    assert.equal(decoded.sessionId, payload.sessionId);
    assert.equal(decoded.iss, 'omni-retail-auth');
  });

  it('throws AppError when verifying an invalid or tampered token', () => {
    assert.throws(
      () => verifyAccessToken('invalid.token.signature'),
      (err) => err instanceof AppError && err.statusCode === 401
    );
  });
});
