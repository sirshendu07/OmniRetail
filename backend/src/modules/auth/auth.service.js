import crypto from 'node:crypto';
import * as userRepo from '../users/user.repository.js';
import * as sessionRepo from './session.repository.js';
import * as otpService from './otp.service.js';
import { hashPassword, verifyPassword, generateRandomToken, hashToken } from '../../common/utils/crypto.utils.js';
import { generateAccessToken } from '../../common/utils/jwt.utils.js';
import { sendEmail } from '../../infrastructure/email/mailer.js';
import { getOtpEmailTemplate } from '../../infrastructure/email/emailTemplates/otpEmail.template.js';
import { getPasswordResetTemplate } from '../../infrastructure/email/emailTemplates/passwordReset.template.js';
import { AppError } from '../../common/errors/AppError.js';
import { ERROR_CODES } from '../../common/errors/errorCodes.js';
import { ACCOUNT_STATUS } from '../../common/constants/accountStatus.js';

const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Creates session record and issues access and refresh tokens.
 */
async function issueSessionTokens(user, userAgent, ipAddress) {
  const sessionId = crypto.randomUUID();
  const rawRefreshToken = generateRandomToken(40);
  const hashedRefreshToken = hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

  await sessionRepo.createSession({
    userId: user._id,
    sessionId,
    hashedRefreshToken,
    userAgent,
    ipAddress,
    expiresAt
  });

  const accessToken = generateAccessToken({
    userId: String(user._id),
    role: user.role,
    sessionId
  });

  return { accessToken, refreshToken: rawRefreshToken, sessionId };
}

/**
 * Registers a new user account and dispatches email verification OTP.
 */
export async function register(userData) {
  const existing = await userRepo.findUserByEmail(userData.email);
  if (existing) {
    throw AppError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(userData.password);
  const user = await userRepo.createUser({
    ...userData,
    passwordHash,
    status: ACCOUNT_STATUS.PENDING_VERIFICATION,
    isEmailVerified: false
  });

  const otp = await otpService.createAndStoreOtp('email-verification', user.email);
  const emailTemplate = getOtpEmailTemplate({ firstName: user.firstName, otp });
  await sendEmail({ to: user.email, ...emailTemplate });

  return { userId: user._id, email: user.email };
}

/**
 * Verifies email address using the supplied OTP.
 */
export async function verifyEmail(email, otp) {
  await otpService.verifyStoredOtp('email-verification', email, otp);
  const user = await userRepo.markEmailVerified(email);
  if (!user) {
    throw AppError.notFound('User not found');
  }
  return { email: user.email, isEmailVerified: true };
}

/**
 * Resends a new email verification OTP.
 */
export async function resendVerificationOtp(email) {
  const user = await userRepo.findUserByEmail(email);
  if (!user) throw AppError.notFound('Account not found');
  if (user.isEmailVerified) throw AppError.badRequest('Email is already verified');

  const otp = await otpService.createAndStoreOtp('email-verification', user.email);
  const emailTemplate = getOtpEmailTemplate({ firstName: user.firstName, otp });
  await sendEmail({ to: user.email, ...emailTemplate });
  return { email: user.email };
}

/**
 * Authenticates user credentials and establishes a new session.
 */
export async function login({ email, password, userAgent, ipAddress }) {
  const user = await userRepo.findUserByEmail(email, true);
  if (!user) throw AppError.unauthorized('Invalid email or password');

  if (user.status === ACCOUNT_STATUS.SUSPENDED || user.status === ACCOUNT_STATUS.LOCKED) {
    throw new AppError('Your account has been locked or suspended', 403, ERROR_CODES.ACCOUNT_LOCKED);
  }

  const isValidPassword = await verifyPassword(user.passwordHash, password);
  if (!isValidPassword) throw AppError.unauthorized('Invalid email or password');

  if (!user.isEmailVerified) {
    throw new AppError('Please verify your email before logging in', 403, ERROR_CODES.EMAIL_NOT_VERIFIED);
  }

  const tokens = await issueSessionTokens(user, userAgent, ipAddress);
  return { user: user.toJSON(), ...tokens };
}

/**
 * Detects refresh token reuse and revokes entire token family if compromised.
 */
async function handleReuseDetection(candidateHash) {
  const compromisedSession = await sessionRepo.findSessionByAnyHashedToken(candidateHash);
  if (compromisedSession) {
    await sessionRepo.revokeAllUserSessions(compromisedSession.userId, 'TOKEN_REUSE_DETECTED');
    throw new AppError('Security alert: Token reuse detected. All sessions revoked.', 401, ERROR_CODES.TOKEN_REUSE_DETECTED);
  }
  throw AppError.unauthorized('Invalid or expired refresh token');
}

/**
 * Rotates refresh token and issues a fresh short-lived access token.
 */
export async function rotateRefreshToken(incomingRefreshToken) {
  if (!incomingRefreshToken) throw AppError.unauthorized('Refresh token is required');

  const candidateHash = hashToken(incomingRefreshToken);
  const session = await sessionRepo.findSessionByHashedToken(candidateHash);

  if (!session || session.isRevoked || session.expiresAt < new Date()) {
    return handleReuseDetection(candidateHash);
  }

  const user = await userRepo.findUserById(session.userId);
  if (!user || user.status !== ACCOUNT_STATUS.ACTIVE) {
    await sessionRepo.revokeSession(session.sessionId, 'USER_INACTIVE');
    throw AppError.unauthorized('User account is inactive or not found');
  }

  const nextRefreshToken = generateRandomToken(40);
  const nextHashedToken = hashToken(nextRefreshToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

  await sessionRepo.updateSessionToken(session.sessionId, candidateHash, nextHashedToken, newExpiresAt);

  const accessToken = generateAccessToken({
    userId: String(user._id),
    role: user.role,
    sessionId: session.sessionId
  });

  return { accessToken, refreshToken: nextRefreshToken };
}

/**
 * Terminates current active user session.
 */
export async function logoutCurrentSession(sessionId) {
  if (sessionId) {
    await sessionRepo.revokeSession(sessionId, 'USER_LOGOUT');
  }
}

/**
 * Terminates all active sessions for a user across all devices.
 */
export async function logoutAllUserSessions(userId) {
  await sessionRepo.revokeAllUserSessions(userId, 'USER_LOGOUT_ALL');
}

/**
 * Initiates forgot password flow by dispatching reset OTP.
 */
export async function forgotPassword(email) {
  const user = await userRepo.findUserByEmail(email);
  if (!user) return { message: 'If the email exists, a reset code was dispatched' };

  const otp = await otpService.createAndStoreOtp('password-reset', user.email);
  const template = getPasswordResetTemplate({ firstName: user.firstName, otp });
  await sendEmail({ to: user.email, ...template });
  return { message: 'If the email exists, a reset code was dispatched' };
}

/**
 * Resets user password upon successful OTP verification and revokes active sessions.
 */
export async function resetPassword({ email, otp, newPassword }) {
  await otpService.verifyStoredOtp('password-reset', email, otp);
  const user = await userRepo.findUserByEmail(email);
  if (!user) throw AppError.notFound('Account not found');

  const passwordHash = await hashPassword(newPassword);
  await userRepo.updateUserById(user._id, { passwordHash });
  await sessionRepo.revokeAllUserSessions(user._id, 'PASSWORD_RESET');

  return { success: true };
}

export async function listActiveSessions(userId) {
  return sessionRepo.findActiveSessionsByUserId(userId);
}

export async function revokeSessionById(userId, targetSessionId) {
  const session = await sessionRepo.findSessionBySessionId(targetSessionId);
  if (!session || String(session.userId) !== String(userId)) {
    throw AppError.notFound('Session not found');
  }
  return sessionRepo.revokeSession(targetSessionId, 'USER_MANUAL_REVOCATION');
}
