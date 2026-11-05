process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/database/connection.js';
import { connectRedis, disconnectRedis, redisClient } from '../../src/infrastructure/redis/redis.client.js';
import { User } from '../../src/modules/users/user.model.js';
import { Session } from '../../src/modules/auth/session.model.js';
import { hashOtp } from '../../src/common/utils/crypto.utils.js';

describe('Auth & Session Management Integration Tests', () => {
  let server = null;
  let baseUrl = '';
  const testEmail = `test.user.${Date.now()}@example.com`;
  const testPassword = 'Password#12345';
  let accessTokenCookie = '';
  let refreshTokenCookie = '';
  let oldRefreshToken = '';

  before(async () => {
    await connectDatabase();
    await connectRedis();
    const rateKeys = await redisClient.keys('rate:*');
    if (rateKeys.length > 0) await redisClient.del(...rateKeys);
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await User.deleteMany({ email: testEmail });
    await Session.deleteMany({});
    const keys = await redisClient.keys(`*${testEmail}*`);
    if (keys.length > 0) await redisClient.del(...keys);
    await disconnectRedis();
    await disconnectDatabase();
  });

  it('1. POST /api/v1/auth/register creates user and sends OTP', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        firstName: 'John',
        lastName: 'Doe'
      })
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.email, testEmail);
  });

  it('2. POST /api/v1/auth/register rejects duplicate email with 409 Conflict', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        firstName: 'John',
        lastName: 'Doe'
      })
    });
    const body = await res.json();
    assert.equal(res.status, 409);
    assert.equal(body.success, false);
    assert.equal(body.code, 'CONFLICT');
  });

  it('3. POST /api/v1/auth/verify-email validates OTP and activates account', async () => {
    // Inject deterministic OTP into Redis for reliable test verification
    const testOtp = '654321';
    const dataKey = `otp:data:email-verification:${testEmail}`;
    await redisClient.set(dataKey, JSON.stringify({ hash: hashOtp(testOtp), attempts: 0 }), 'EX', 300);

    const res = await fetch(`${baseUrl}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, otp: testOtp })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.isEmailVerified, true);
  });

  it('4. POST /api/v1/auth/login sets HttpOnly cookies and establishes session', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);

    const setCookies = res.headers.getSetCookie();
    assert.ok(setCookies.length >= 2, 'Should set accessToken and refreshToken cookies');

    accessTokenCookie = setCookies.find((c) => c.startsWith('accessToken='));
    refreshTokenCookie = setCookies.find((c) => c.startsWith('refreshToken='));
    assert.ok(accessTokenCookie.includes('HttpOnly'));
    assert.ok(refreshTokenCookie.includes('HttpOnly'));

    // Extract raw refreshToken for subsequent rotation and reuse tests
    const match = refreshTokenCookie.match(/refreshToken=([^;]+)/);
    oldRefreshToken = match ? match[1] : '';
  });

  it('5. GET /api/v1/users/me returns authenticated user profile via cookie', async () => {
    const res = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: { Cookie: accessTokenCookie }
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.user.email, testEmail);
    assert.equal(body.data.user.role, 'CUSTOMER');
  });

  it('6. POST /api/v1/auth/refresh rotates refresh token', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: refreshTokenCookie }
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);

    const newCookies = res.headers.getSetCookie();
    const newRefreshCookie = newCookies.find((c) => c.startsWith('refreshToken='));
    assert.notEqual(newRefreshCookie, refreshTokenCookie, 'Refresh token must be rotated to a new value');
  });

  it('7. Reusing rotated refresh token triggers security revocation of all user sessions', async () => {
    // Attempt to reuse oldRefreshToken which was already rotated
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `refreshToken=${oldRefreshToken}`
      }
    });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.code, 'TOKEN_REUSE_DETECTED');

    // Verify all sessions for this specific user were revoked in DB
    const testUser = await User.findOne({ email: testEmail });
    const activeSessions = await Session.find({ userId: testUser._id, isRevoked: false });
    assert.equal(activeSessions.length, 0, 'All user sessions for this user must be revoked upon token reuse detection');
  });

  it('8. POST /api/v1/auth/logout rejects state-changing cookie request without CSRF header', async () => {
    // Login again to acquire active session
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const setCookies = loginRes.headers.getSetCookie();
    const activeAccessCookie = setCookies.find((c) => c.startsWith('accessToken='));

    // Attempt logout WITHOUT CSRF header
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: activeAccessCookie }
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.code, 'FORBIDDEN');
  });

  it('9. POST /api/v1/auth/logout succeeds with CSRF header and clears cookies', async () => {
    // Login again to acquire active session
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const setCookies = loginRes.headers.getSetCookie();
    const activeAccessCookie = setCookies.find((c) => c.startsWith('accessToken='));

    // Attempt logout WITH X-CSRF-Token header
    const res = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: activeAccessCookie,
        'X-CSRF-Token': 'valid-csrf-token'
      }
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);

    const clearedCookies = res.headers.getSetCookie();
    assert.ok(clearedCookies.some((c) => c.includes('accessToken=; Max-Age=0') || c.includes('accessToken=;')));
  });
});
