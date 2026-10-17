import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { REMINDER_CHANNELS, normaliseEmail } from '../utils/constants.js';

export const DEFAULT_PREFERENCES = {
  defaultReminderChannel: 'email',
  emailNotifications: true,
  whatsappNotifications: false,
};

const profileSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      trim: true,
      default: '',
      maxlength: [24, 'Phone number must be at most 24 characters'],
    },
    avatarUrl: {
      type: String,
      trim: true,
      default: '',
      maxlength: [2048, 'Avatar URL is too long'],
      validate: {
        validator(value) {
          if (!value) return true;
          try {
            return ['http:', 'https:'].includes(new URL(value).protocol);
          } catch {
            return false;
          }
        },
        message: 'Avatar URL must be a valid http or https address',
      },
    },
  },
  { _id: false },
);

const preferencesSchema = new mongoose.Schema(
  {
    defaultReminderChannel: {
      type: String,
      enum: {
        values: REMINDER_CHANNELS,
        message: '{VALUE} is not a supported reminder channel',
      },
      default: DEFAULT_PREFERENCES.defaultReminderChannel,
    },
    emailNotifications: { type: Boolean, default: DEFAULT_PREFERENCES.emailNotifications },
    whatsappNotifications: { type: Boolean, default: DEFAULT_PREFERENCES.whatsappNotifications },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name must be at most 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    profile: {
      type: profileSchema,
      default: () => ({}),
    },
    preferences: {
      type: preferencesSchema,
      default: () => ({ ...DEFAULT_PREFERENCES }),
    },
    // Bumped whenever sessions must be revoked (password change, account deletion).
    // Tokens carry the version they were issued with; protect rejects older ones.
    authVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

// Normalising here as well as in the controllers keeps direct model writes (tests,
// migrations) from creating a second account that differs only by case.
userSchema.pre('validate', function normaliseUserEmail() {
  if (this.email) this.email = normaliseEmail(this.email);
});

userSchema.methods.matchPassword = function matchPassword(plainText) {
  return bcrypt.compare(plainText, this.passwordHash);
};

// The login path selects passwordHash explicitly, so every response is shaped
// through this method rather than serialising the document directly.
userSchema.methods.toPublicUser = function toPublicUser() {
  return {
    _id: this._id.toString(),
    name: this.name,
    email: this.email,
    profile: {
      phone: this.profile?.phone ?? '',
      avatarUrl: this.profile?.avatarUrl ?? '',
    },
    preferences: {
      defaultReminderChannel:
        this.preferences?.defaultReminderChannel ?? DEFAULT_PREFERENCES.defaultReminderChannel,
      emailNotifications:
        this.preferences?.emailNotifications ?? DEFAULT_PREFERENCES.emailNotifications,
      whatsappNotifications:
        this.preferences?.whatsappNotifications ?? DEFAULT_PREFERENCES.whatsappNotifications,
    },
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('User', userSchema);
