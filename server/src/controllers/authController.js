import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { ApiError } from '../middleware/errorMiddleware.js';
import { clearAuthCookie, generateToken, setAuthCookie } from '../utils/generateToken.js';

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 12;

export async function register(req, res) {
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, 'Name, email and password are required');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    throw new ApiError(409, 'An account with that email already exists');
  }

  const user = await User.create({
    name,
    email,
    phone: phone || '',
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
  });

  setAuthCookie(res, generateToken(user._id));
  res.status(201).json({ user: user.toPublicUser() });
}

export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  if (!user || !(await user.matchPassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  setAuthCookie(res, generateToken(user._id));
  res.json({ user: user.toPublicUser() });
}

export function logout(req, res) {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
}

export function getMe(req, res) {
  res.json({ user: req.user.toPublicUser() });
}
