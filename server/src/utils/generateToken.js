import jwt from 'jsonwebtoken';

export const AUTH_COOKIE = 'lendloop_token';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export function generateToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      // Tokens issued before versioning carry no claim and are treated as version 0.
      ver: user.authVersion ?? 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS },
  );
}

// SameSite=Lax keeps the cookie off cross-site requests, which is what makes
// cookie auth safe here without a separate CSRF token. Switching to SameSite=None
// (cross-site deployments) would require adding one.
export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
