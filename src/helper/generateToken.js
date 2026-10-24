const jwt = require('jsonwebtoken');

const getAccessSecret = () => process.env.ACCESS_TOKEN_SECRET || 'yogazen_access_secret_development_2026_xyz';
const getRefreshSecret = () => process.env.REFRESH_TOKEN_SECRET || 'yogazen_refresh_secret_development_2026_abc';

const ACCESS_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '60d';

// Durations in milliseconds for cookies
const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_COOKIE_MAX_AGE = 60 * 24 * 60 * 60 * 1000; // 60 days (~2 months)

// Generate Access Token (15 mins)
const generateAccessToken = (payload) => {
  return jwt.sign(payload, getAccessSecret(), { expiresIn: ACCESS_EXPIRES_IN });
};

// Generate Refresh Token (60 days / 2 months)
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, getRefreshSecret(), { expiresIn: REFRESH_EXPIRES_IN });
};

// Verify tokens
const verifyAccessToken = (token) => {
  return jwt.verify(token, getAccessSecret());
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, getRefreshSecret());
};

// Helper to get environment-appropriate cookie options for cross-domain support
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true, // Prevents XSS script access
    // For cross-domain hosting in production (e.g. Frontend on Vercel, Backend on Render),
    // modern browsers require sameSite: 'none' and secure: true (HTTPS).
    // In local development over HTTP, sameSite: 'lax' and secure: false are used.
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax'
  };
};

// Attach HTTP-Only Cookies to response
const setTokenCookies = (res, accessToken, refreshToken) => {
  const baseCookieOptions = getCookieOptions();

  // 15 minutes for access token cookie
  res.cookie('accessToken', accessToken, {
    ...baseCookieOptions,
    maxAge: ACCESS_COOKIE_MAX_AGE
  });

  // 60 days (2 months) for refresh token cookie
  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, {
      ...baseCookieOptions,
      maxAge: REFRESH_COOKIE_MAX_AGE
    });
  }
};

// Clear cookies on logout with matching cross-domain flags
const clearTokenCookies = (res) => {
  const options = getCookieOptions();

  res.clearCookie('accessToken', options);
  res.clearCookie('refreshToken', options);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setTokenCookies,
  clearTokenCookies
};
