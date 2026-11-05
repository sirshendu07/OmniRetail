import * as authService from './auth.service.js';
import { sendSuccess, sendCreated } from '../../common/utils/responseHandler.js';
import { getAccessTokenCookieOptions, getRefreshTokenCookieOptions, getClearCookieOptions } from '../../common/utils/cookieOptions.js';

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('accessToken', accessToken, getAccessTokenCookieOptions());
  res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());
}

function clearAuthCookies(res) {
  res.cookie('accessToken', '', getClearCookieOptions());
  res.cookie('refreshToken', '', getClearCookieOptions());
}

export async function register(req, res) {
  const result = await authService.register(req.body);
  return sendCreated(res, 'User registered successfully. Verification code sent to email.', result);
}

export async function verifyEmail(req, res) {
  const result = await authService.verifyEmail(req.body.email, req.body.otp);
  return sendSuccess(res, 'Email verified successfully. You may now log in.', result);
}

export async function resendOtp(req, res) {
  const result = await authService.resendVerificationOtp(req.body.email);
  return sendSuccess(res, 'Verification OTP resent to email.', result);
}

export async function login(req, res) {
  const userAgent = req.headers['user-agent'] || 'Unknown Device';
  const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'Unknown IP';
  const result = await authService.login({ ...req.body, userAgent, ipAddress });

  setAuthCookies(res, result.accessToken, result.refreshToken);
  return sendSuccess(res, 'Logged in successfully', { user: result.user });
}

export async function refresh(req, res) {
  const incomingToken = req.cookies.refreshToken || req.body.refreshToken;
  const tokens = await authService.rotateRefreshToken(incomingToken);

  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  return sendSuccess(res, 'Access token refreshed successfully');
}

export async function logout(req, res) {
  await authService.logoutCurrentSession(req.sessionId);
  clearAuthCookies(res);
  return sendSuccess(res, 'Logged out successfully');
}

export async function logoutAll(req, res) {
  await authService.logoutAllUserSessions(req.user.id);
  clearAuthCookies(res);
  return sendSuccess(res, 'Logged out from all active devices successfully');
}

export async function forgotPassword(req, res) {
  const result = await authService.forgotPassword(req.body.email);
  return sendSuccess(res, result.message);
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.body);
  clearAuthCookies(res);
  return sendSuccess(res, 'Password reset successfully. Please log in with your new password.');
}

export async function getSessions(req, res) {
  const sessions = await authService.listActiveSessions(req.user.id);
  return sendSuccess(res, 'Active sessions retrieved', { sessions });
}

export async function revokeSession(req, res) {
  await authService.revokeSessionById(req.user.id, req.params.sessionId);
  return sendSuccess(res, 'Session revoked successfully');
}
