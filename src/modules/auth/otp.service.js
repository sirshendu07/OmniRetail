import { redisClient } from '../../infrastructure/redis/redis.client.js';
import { hashOtp, timingSafeCompare, generateOtp } from '../../common/utils/crypto.utils.js';
import { AppError } from '../../common/errors/AppError.js';
import { ERROR_CODES } from '../../common/errors/errorCodes.js';

const OTP_EXPIRY_SECONDS = 300; // 5 minutes
const OTP_COOLDOWN_SECONDS = 60; // 60 seconds
const MAX_OTP_ATTEMPTS = 5;

function getOtpKeys(purpose, email) {
  const normalized = email.toLowerCase().trim();
  return {
    dataKey: `otp:data:${purpose}:${normalized}`,
    cooldownKey: `otp:cooldown:${purpose}:${normalized}`
  };
}

/**
 * Creates and stores a keyed HMAC OTP in Redis, enforcing resend cooldown.
 * @param {string} purpose - 'email-verification' | 'password-reset'
 * @param {string} email 
 * @returns {Promise<string>} Plaintext OTP to be sent via email
 */
export async function createAndStoreOtp(purpose, email) {
  const { dataKey, cooldownKey } = getOtpKeys(purpose, email);
  const inCooldown = await redisClient.exists(cooldownKey);
  if (inCooldown) {
    const ttl = await redisClient.ttl(cooldownKey);
    throw new AppError(`Please wait ${ttl} seconds before requesting a new OTP`, 429, ERROR_CODES.OTP_COOLDOWN_ACTIVE);
  }

  const plainOtp = generateOtp();
  const hmacHash = hashOtp(plainOtp);

  // Store hashed OTP payload and initiate 60s cooldown
  const pipeline = redisClient.pipeline();
  pipeline.set(dataKey, JSON.stringify({ hash: hmacHash, attempts: 0 }), 'EX', OTP_EXPIRY_SECONDS);
  pipeline.set(cooldownKey, 'active', 'EX', OTP_COOLDOWN_SECONDS);
  await pipeline.exec();

  return plainOtp;
}

/**
 * Validates a candidate OTP against the stored HMAC in Redis.
 * Enforces attempt limits and deletes OTP immediately upon success.
 * @param {string} purpose 
 * @param {string} email 
 * @param {string} candidateOtp 
 * @returns {Promise<boolean>}
 */
export async function verifyStoredOtp(purpose, email, candidateOtp) {
  const { dataKey } = getOtpKeys(purpose, email);
  const storedJson = await redisClient.get(dataKey);
  if (!storedJson) {
    throw new AppError('OTP has expired or was not requested', 400, ERROR_CODES.OTP_EXPIRED);
  }

  const data = JSON.parse(storedJson);
  if (data.attempts >= MAX_OTP_ATTEMPTS) {
    await redisClient.del(dataKey);
    throw new AppError('Maximum OTP verification attempts exceeded', 429, ERROR_CODES.OTP_MAX_ATTEMPTS_EXCEEDED);
  }

  const candidateHash = hashOtp(candidateOtp);
  const isValid = timingSafeCompare(data.hash, candidateHash);
  if (!isValid) {
    data.attempts += 1;
    const remainingTtl = Math.max(await redisClient.ttl(dataKey), 1);
    await redisClient.set(dataKey, JSON.stringify(data), 'EX', remainingTtl);
    throw new AppError(`Invalid OTP. ${MAX_OTP_ATTEMPTS - data.attempts} attempts remaining`, 400, ERROR_CODES.OTP_INVALID);
  }

  // Valid OTP: delete immediately to prevent reuse
  await redisClient.del(dataKey);
  return true;
}
