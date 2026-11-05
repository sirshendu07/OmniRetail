const isProduction = process.env.NODE_ENV === 'production';

/**
 * Common base cookie options enforcing security standards.
 */
const BASE_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'strict' : 'lax',
  path: '/'
});

/**
 * Cookie options for the short-lived JWT access token (15 mins).
 */
export function getAccessTokenCookieOptions() {
  return {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 15 * 60 * 1000 // 15 minutes
  };
}

/**
 * Cookie options for the long-lived opaque refresh token (7 days).
 */
export function getRefreshTokenCookieOptions() {
  return {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  };
}

/**
 * Options for clearing an active cookie on logout.
 */
export function getClearCookieOptions() {
  return {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 0
  };
}
