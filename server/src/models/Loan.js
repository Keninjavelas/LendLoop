import mongoose from 'mongoose';
import {
  LOAN_ORIGINS,
  PRIORITIES,
  REMINDER_CHANNELS,
  REMINDER_FREQUENCIES,
  TEMPLATE_MODES,
  isValidEmail,
} from '../utils/constants.js';

export const LOAN_STATUSES = ['active', 'returned'];

const borrowerConsentSchema = new mongoose.Schema(
  {
    email: { type: Boolean, default: false },
    whatsapp: { type: Boolean, default: false },
    note: { type: String, trim: true, default: '', maxlength: [200, 'Consent note is too long'] },
    recordedAt: { type: Date, default: null },
  },
  { _id: false },
);

const borrowerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Borrower name is required'],
      trim: true,
      maxlength: [100, 'Borrower name must be at most 100 characters'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      maxlength: [160, 'Email is too long'],
      validate: {
        validator(value) {
          return !value || isValidEmail(value);
        },
        message: 'Borrower email is not a valid address',
      },
    },
    phone: {
      type: String,
      trim: true,
      default: '',
      maxlength: [20, 'Phone number is too long'],
    },
    consent: { type: borrowerConsentSchema, default: () => ({}) },
  },
  { _id: false },
);

const remindersSchema = new mongoose.Schema(
  {
    // Per-loan kill switch: the lender can silence automation without losing the schedule.
    enabled: { type: Boolean, default: true },
    channels: {
      type: [{ type: String, enum: { values: REMINDER_CHANNELS, message: '{VALUE} is not a channel' } }],
      default: ['email'],
    },
    frequency: {
      type: String,
      enum: {
        values: REMINDER_FREQUENCIES,
        message: '{VALUE} is not a supported reminder frequency',
      },
      default: 'daily',
    },
    templateMode: {
      type: String,
      enum: { values: TEMPLATE_MODES, message: '{VALUE} is not a supported template mode' },
      default: 'priority',
    },
    customMessage: { type: String, trim: true, default: '', maxlength: [1000, 'Message is too long'] },
    // Offsets in days relative to dueDate, used when frequency is "custom".
    customOffsetsDays: { type: [Number], default: [] },
    overdueIntervalHours: { type: Number, default: 48, min: [1, 'Interval must be at least an hour'] },
    maxOverdueReminders: { type: Number, default: 5, min: [0, 'Cannot be negative'], max: [50, 'Cap is 50'] },
    nextDueAt: { type: Date, default: null },
    lastSentAt: { type: Date, default: null },
    autoSentCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const borrowerReturnConfirmationSchema = new mongoose.Schema(
  {
    // This product only records a lender-reported statement. Keeping the source explicit
    // stops it from being read as an independently verified borrower action.
    source: {
      type: String,
      enum: {
        values: ['lender-reported'],
        message: '{VALUE} is not a supported confirmation source',
      },
      required: true,
      default: 'lender-reported',
    },
    reportedAt: { type: Date, required: true },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { _id: false },
);

const loanSchema = new mongoose.Schema(
  {
    origin: {
      type: String,
      enum: { values: LOAN_ORIGINS, message: '{VALUE} is not a supported loan origin' },
      default: 'request',
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BorrowRequest',
      default: undefined,
    },
    // Null for a lending entry recorded against something that was never listed.
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      default: null,
    },
    itemName: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      maxlength: [120, 'Item name must be at most 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'Description must be at most 1000 characters'],
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    lenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Set when the borrower has a LendLoop account; manual entries may not have one.
    borrowerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    borrower: { type: borrowerSchema, required: true },
    lentAt: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
    },
    returnedAt: {
      type: Date,
      default: null,
    },
    // Return metadata is absent on older returned records and on loans closed without it.
    returnNote: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Return note must be at most 500 characters'],
    },
    borrowerReturnConfirmation: {
      type: borrowerReturnConfirmationSchema,
      default: undefined,
    },
    status: {
      type: String,
      enum: { values: LOAN_STATUSES, message: '{VALUE} is not a supported loan status' },
      default: 'active',
    },
    priority: {
      type: String,
      enum: { values: PRIORITIES, message: '{VALUE} is not a supported priority' },
      default: 'medium',
    },
    // "category" means the value still tracks the category default, "manual" means the
    // lender overrode it and later category changes must not silently rewrite it.
    prioritySource: {
      type: String,
      enum: {
        values: ['category', 'manual'],
        message: '{VALUE} is not a supported priority source',
      },
      default: 'category',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'Notes must be at most 1000 characters'],
    },
    reminders: { type: remindersSchema, default: () => ({}) },
  },
  { timestamps: true, versionKey: false },
);

// An item can only ever have one active loan; overdue is derived from dueDate, never stored.
// The $type guard keeps unlisted manual entries (itemId null) out of the uniqueness check.
loanSchema.index(
  { itemId: 1 },
  { unique: true, partialFilterExpression: { status: 'active', itemId: { $type: 'objectId' } } },
);

loanSchema.index(
  { requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: 'objectId' } } },
);

loanSchema.index({ lenderId: 1, createdAt: -1 });
loanSchema.index({ borrowerId: 1, createdAt: -1 });
loanSchema.index({ status: 1, dueDate: 1 });
loanSchema.index({ lenderId: 1, priority: 1, dueDate: 1 });
loanSchema.index({ categoryId: 1 });
loanSchema.index({ status: 1, 'reminders.enabled': 1, 'reminders.nextDueAt': 1 });

export default mongoose.model('Loan', loanSchema);
