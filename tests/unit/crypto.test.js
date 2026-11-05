import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  generateOtp,
  hashOtp,
  timingSafeCompare,
  generateRandomToken,
  hashToken
} from '../../src/common/utils/crypto.utils.js';

describe('Cryptographic Utilities Unit Tests', () => {
  it('hashes password with Argon2id and verifies match', async () => {
    const raw = 'Walmart#Secure2026';
    const hash = await hashPassword(raw);
    assert.ok(hash.startsWith('$argon2id$'), 'Hash should use Argon2id variant');
    const matches = await verifyPassword(hash, raw);
    assert.equal(matches, true, 'Correct password verifies successfully');
    const wrong = await verifyPassword(hash, 'WrongPassword#123');
    assert.equal(wrong, false, 'Incorrect password fails verification');
  });

  it('generates a 6-digit numeric OTP', () => {
    const otp = generateOtp();
    assert.match(otp, /^\d{6}$/, 'OTP must be exactly 6 numeric digits');
  });

  it('computes keyed HMAC for OTP and performs timing-safe comparison', () => {
    const otp = '849201';
    const hmac1 = hashOtp(otp);
    const hmac2 = hashOtp(otp);
    assert.equal(hmac1, hmac2, 'Deterministic HMAC for identical inputs');
    assert.equal(timingSafeCompare(hmac1, hmac2), true);
    assert.equal(timingSafeCompare(hmac1, hashOtp('123456')), false);
  });

  it('generates random opaque tokens and computes SHA-256 digest', () => {
    const token = generateRandomToken(40);
    assert.equal(token.length, 80, '40 bytes hex encoded = 80 characters');
    const hash = hashToken(token);
    assert.equal(hash.length, 64, 'SHA-256 produces 64-character hex string');
  });
});
