import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import BorrowRequest from '../models/BorrowRequest.js';
import Item from '../models/Item.js';
import Loan from '../models/Loan.js';
import LoanHistory from '../models/LoanHistory.js';
import ReminderLog from '../models/ReminderLog.js';
import User, { DEFAULT_PREFERENCES } from '../models/User.js';
import { ApiError } from '../middleware/errorMiddleware.js';
import { clearAuthCookie, generateToken, setAuthCookie } from '../utils/generateToken.js';
import { REMINDER_CHANNELS } from '../utils/constants.js';

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 12;
const MAX_NAME_LENGTH = 80;
const MAX_PHONE_LENGTH = 24;

const ANONYMOUS_BORROWER = {
  name: 'Deleted account',
  email: '',
  phone: '',
  consent: { email: false, whatsapp: false, note: '', recordedAt: null },
};

export function getProfile(req, res) {
  res.json({ user: req.user.toPublicUser() });
}

// Email is deliberately not editable here; changing the login identifier should
// require re-authentication rather than ride along on a profile update.
export async function updateProfile(req, res) {
  const { name, profile, preferences } = req.body ?? {};

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (trimmed.length < 2) throw new ApiError(400, 'Name must be at least 2 characters');
    if (trimmed.length > MAX_NAME_LENGTH) {
      throw new ApiError(400, `Name must be at most ${MAX_NAME_LENGTH} characters`);
    }
    req.user.name = trimmed;
  }

  if (profile !== undefined) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new ApiError(400, 'Profile must be an object');
    }
    if (profile.phone !== undefined) {
      const phone = String(profile.phone).trim();
      if (phone.length > MAX_PHONE_LENGTH) {
        throw new ApiError(400, `Phone number must be at most ${MAX_PHONE_LENGTH} characters`);
      }
      req.user.profile.phone = phone;
    }
    if (profile.avatarUrl !== undefined) {
      req.user.profile.avatarUrl = String(profile.avatarUrl).trim();
    }
  }

  if (preferences !== undefined) {
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      throw new ApiError(400, 'Preferences must be an object');
    }
    if (preferences.defaultReminderChannel !== undefined) {
      if (!REMINDER_CHANNELS.includes(preferences.defaultReminderChannel)) {
        throw new ApiError(
          400,
          `Default reminder channel must be one of: ${REMINDER_CHANNELS.join(', ')}`,
        );
      }
      req.user.preferences.defaultReminderChannel = preferences.defaultReminderChannel;
    }
    if (preferences.emailNotifications !== undefined) {
      if (typeof preferences.emailNotifications !== 'boolean') {
        throw new ApiError(400, 'Email notifications preference must be true or false');
      }
      req.user.preferences.emailNotifications = preferences.emailNotifications;
    }
    if (preferences.whatsappNotifications !== undefined) {
      if (typeof preferences.whatsappNotifications !== 'boolean') {
        throw new ApiError(400, 'WhatsApp notifications preference must be true or false');
      }
      req.user.preferences.whatsappNotifications = preferences.whatsappNotifications;
    }
  }

  // Model validation covers the avatar URL format and the phone length fallback.
  await req.user.save();
  res.json({ user: req.user.toPublicUser() });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current password and new password are required');
  }
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user || !(await user.matchPassword(currentPassword))) {
    throw new ApiError(400, 'Current password is incorrect');
  }
  if (await user.matchPassword(newPassword)) {
    throw new ApiError(400, 'New password must be different from the current one');
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  // Revokes every token issued before this change, then issues a fresh one so the
  // session that made the change stays signed in.
  user.authVersion = (user.authVersion ?? 0) + 1;
  await user.save();

  setAuthCookie(res, generateToken(user));
  res.json({ user: user.toPublicUser(), message: 'Password updated' });
}

export async function deleteAccount(req, res) {
  const { password, confirmation } = req.body ?? {};

  if (String(confirmation ?? '').trim().toUpperCase() !== 'DELETE') {
    throw new ApiError(400, 'Type DELETE to confirm account deletion');
  }
  if (!password) {
    throw new ApiError(400, 'Enter your password to delete the account');
  }

  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user || !(await user.matchPassword(password))) {
    throw new ApiError(400, 'Password is incorrect');
  }

  const activeLoans = await Loan.countDocuments({
    status: 'active',
    $or: [{ lenderId: user._id }, { borrowerId: user._id }],
  });
  if (activeLoans > 0) {
    throw new ApiError(
      409,
      activeLoans === 1
        ? 'Close your 1 active loan before deleting your account'
        : `Close your ${activeLoans} active loans before deleting your account`,
    );
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Listings disappear from Explore but stay archived so returned loans keep
      // resolving. Pending requests are closed rather than left actionable.
      await Item.updateMany(
        { ownerId: user._id, status: { $ne: 'archived' } },
        { $set: { status: 'archived' } },
        { session },
      );
      await BorrowRequest.updateMany(
        {
          status: 'pending',
          $or: [{ ownerId: user._id }, { borrowerId: user._id }],
        },
        { $set: { status: 'cancelled' } },
        { session },
      );

      // Messages written by this borrower can contain identifying details, while the
      // request itself must stay for the lender's record.
      await BorrowRequest.updateMany(
        { borrowerId: user._id },
        { $set: { message: '' } },
        { session },
      );

      // Retained loans still name this user and their reminders embed borrower details.
      // Scrub every account-linked snapshot while keeping dates, amounts, statuses and
      // the delivery audit trail intact for the other party.
      const borrowedLoans = await Loan.find({ borrowerId: user._id })
        .select('_id')
        .session(session);
      const borrowedLoanIds = borrowedLoans.map((loan) => loan._id);

      if (borrowedLoanIds.length) {
        await Loan.updateMany(
          { _id: { $in: borrowedLoanIds } },
          { $set: { borrower: ANONYMOUS_BORROWER } },
          { session },
        );
        await ReminderLog.updateMany(
          { loanId: { $in: borrowedLoanIds } },
          {
            $set: {
              recipient: 'deleted account',
              subject: 'Reminder removed',
              body: 'This reminder was removed because the borrower deleted their account.',
              link: '',
              error: '',
            },
          },
          { session },
        );
        await LoanHistory.updateMany(
          { loanId: { $in: borrowedLoanIds }, kind: 'borrower' },
          { $set: { from: null, to: null, reason: '' } },
          { session },
        );
        // Approval history embeds the borrower's request message; keep the event,
        // drop the free text that may identify them.
        await LoanHistory.updateMany(
          { loanId: { $in: borrowedLoanIds }, kind: 'created', reason: /^Borrow request approved:/ },
          { $set: { reason: 'Borrow request approved' } },
          { session },
        );
      }

      // Outbound reminder history is only visible to the lender being deleted.
      await ReminderLog.deleteMany({ lenderId: user._id }, { session });

      // The account is anonymised rather than hard-deleted: returned loans and their
      // history still reference this user, and the other party must keep their record.
      user.name = 'Deleted account';
      user.email = `deleted-${user._id}@deleted.lendloop.invalid`;
      user.profile = { phone: '', avatarUrl: '' };
      user.preferences = { ...DEFAULT_PREFERENCES };
      user.passwordHash = await bcrypt.hash(randomUUID(), BCRYPT_ROUNDS);
      user.authVersion = (user.authVersion ?? 0) + 1;
      user.deletedAt = new Date();
      await user.save({ session });
    });
  } finally {
    session.endSession();
  }

  clearAuthCookie(res);
  res.json({ deleted: true });
}
