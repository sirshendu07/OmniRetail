import { Session } from './session.model.js';

export async function createSession(data) {
  return Session.create(data);
}

export async function findSessionBySessionId(sessionId) {
  return Session.findOne({ sessionId }).exec();
}

export async function findSessionByHashedToken(hashedRefreshToken) {
  return Session.findOne({ hashedRefreshToken }).exec();
}

/**
 * Searches for any session that currently has or previously had this token hash.
 */
export async function findSessionByAnyHashedToken(tokenHash) {
  return Session.findOne({
    $or: [{ hashedRefreshToken: tokenHash }, { previousHashedTokens: tokenHash }]
  }).exec();
}

/**
 * Rotates the refresh token for an existing session and archives old hash.
 */
export async function updateSessionToken(sessionId, currentHashedToken, newHashedToken, expiresAt) {
  return Session.findOneAndUpdate(
    { sessionId },
    {
      hashedRefreshToken: newHashedToken,
      expiresAt,
      lastActiveAt: new Date(),
      $push: { previousHashedTokens: currentHashedToken }
    },
    { new: true }
  ).exec();
}

/**
 * Revokes a single session.
 */
export async function revokeSession(sessionId, reason = 'LOGOUT') {
  return Session.findOneAndUpdate(
    { sessionId },
    { isRevoked: true, revokedAt: new Date(), revokedReason: reason },
    { new: true }
  ).exec();
}

/**
 * Revokes all sessions belonging to a user (used on token reuse or logout-all).
 */
export async function revokeAllUserSessions(userId, reason = 'LOGOUT_ALL') {
  return Session.updateMany(
    { userId, isRevoked: false },
    { isRevoked: true, revokedAt: new Date(), revokedReason: reason }
  ).exec();
}

/**
 * Lists all active (non-revoked) sessions for a user.
 */
export async function findActiveSessionsByUserId(userId) {
  return Session.find({ userId, isRevoked: false, expiresAt: { $gt: new Date() } })
    .select('sessionId userAgent ipAddress lastActiveAt createdAt')
    .sort({ lastActiveAt: -1 })
    .exec();
}
