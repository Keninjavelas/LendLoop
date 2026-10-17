import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { AUTH_COOKIE } from '../utils/generateToken.js';
import { ApiError } from './errorMiddleware.js';

export async function protect(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    return next(new ApiError(401, 'Not authenticated'));
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next(new ApiError(401, 'Session expired, please log in again'));
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    return next(new ApiError(401, 'Account no longer exists'));
  }

  req.user = user;
  next();
}
