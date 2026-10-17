import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { ApiError } from '../middleware/errorMiddleware.js';
import { clearAuthCookie, generateToken, setAuthCookie } from '../utils/generateToken.js';
import { isValidEmail, normaliseEmail } from '../utils/constants.js';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PHONE_LENGTH = 24;
const BCRYPT_ROUNDS = 12;

export async function register(req, res) {
  const name = String(req.body?.name ?? '').trim();
  const email = normaliseEmail(req.body?.email);
  const password = req.body?.password;
  const phone = String(req.body?.phone ?? '').trim();

  if (!name || !email || !password) {
    throw new ApiError(400, 'Name, email and password are required');
  }
  if (!isValidEmail(email)) {
    throw new ApiError(400, 'Enter a valid email address');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (phone.length > MAX_PHONE_LENGTH) {
    throw new ApiError(400, `Phone number must be at most ${MAX_PHONE_LENGTH} characters`);
  }

  const existing = await User.findOne({ email });
  if (existing) {
    throw new ApiError(409, 'An account with that email already exists');
  }

  let user;
  try {
    user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      profile: { phone },
    });
  } catch (error) {
    // Two simultaneous registrations can both pass the pre-check; the unique index
    // is the authority, so surface the same 409 rather than a generic duplicate error.
    if (error?.code === 11000) {
      throw new ApiError(409, 'An account with that email already exists');
    }
    throw error;
  }

  setAuthCookie(res, generateToken(user));
  res.status(201).json({ user: user.toPublicUser() });
}

export async function login(req, res) {
  const email = normaliseEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || user.deletedAt || !(await user.matchPassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  setAuthCookie(res, generateToken(user));
  res.json({ user: user.toPublicUser() });
}

export function logout(req, res) {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
}

export function getMe(req, res) {
  res.json({ user: req.user.toPublicUser() });
}
