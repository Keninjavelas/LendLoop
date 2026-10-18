import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { AUTH_COOKIE } from '../utils/generateToken.js';
import { ApiError } from './errorMiddleware.js';

async function sessionUser(req) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }

  const user = await User.findById(payload.sub);
  if (!user || user.deletedAt) return null;

  // A password change or account deletion bumps this counter, revoking every token
  // issued before it. Tokens minted before versioning count as version 0.
  if ((payload.ver ?? 0) !== (user.authVersion ?? 0)) return null;

  return user;
}

export async function protect(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    return next(new ApiError(401, 'Not authenticated'));
  }

  const user = await sessionUser(req);
  if (!user) {
    return next(new ApiError(401, 'Session expired, please log in again'));
  }

  req.user = user;
  next();
}

// Public reads stay public, but a signed-in owner gets their private owner context
// (active loan, pending requests, history). An invalid session is treated as anonymous
// rather than turning a public listing into a 401.
export async function optionalProtect(req, res, next) {
  const user = await sessionUser(req);
  if (user) req.user = user;
  next();
}
