import crypto from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../../config/env.config.js';

/**
 * Hashes a plaintext password using the memory-hard Argon2id algorithm.
 * Resistant to GPU and ASIC brute-force attacks.
 * @param {string} password 
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB memory
    timeCost: 3,
    parallelism: 4
  });
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * @param {string} hash 
 * @param {string} password 
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically random 6-digit OTP.
 * @returns {string} 6-digit OTP
 */
export function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Computes a keyed HMAC-SHA256 digest of an OTP.
 * Stored in Redis so plaintext OTPs are never persisted anywhere.
 * @param {string} otp 
 * @returns {string}
 */
export function hashOtp(otp) {
  return crypto.createHmac('sha256', env.OTP_HMAC_SECRET).update(otp).digest('hex');
}

/**
 * Performs timing-safe comparison of two hash strings to prevent timing attacks.
 * @param {string} knownHash 
 * @param {string} candidateHash 
 * @returns {boolean}
 */
export function timingSafeCompare(knownHash, candidateHash) {
  if (typeof knownHash !== 'string' || typeof candidateHash !== 'string') return false;
  const bufA = Buffer.from(knownHash, 'hex');
  const bufB = Buffer.from(candidateHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generates a cryptographically secure random opaque token.
 * @param {number} [byteLength=40] 
 * @returns {string}
 */
export function generateRandomToken(byteLength = 40) {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Computes SHA-256 hash of an opaque token for secure database persistence.
 * @param {string} token 
 * @returns {string}
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
