import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
    phone: {
      type: String,
      trim: true,
      default: '',
      maxlength: [24, 'Phone number must be at most 24 characters'],
    },
  },
  { timestamps: true, versionKey: false },
);

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
    phone: this.phone,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('User', userSchema);
