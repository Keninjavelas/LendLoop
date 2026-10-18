import mongoose from 'mongoose';
import { REMINDER_CHANNELS } from '../utils/constants.js';

export const LOG_STATUSES = ['sent', 'preview', 'link', 'failed'];

export const LOG_MODES = ['manual', 'automatic'];

const reminderLogSchema = new mongoose.Schema(
  {
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Loan',
      required: true,
    },
    lenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    channel: {
      type: String,
      enum: { values: REMINDER_CHANNELS, message: '{VALUE} is not a supported channel' },
      required: true,
    },
    mode: {
      type: String,
      enum: { values: LOG_MODES, message: '{VALUE} is not a supported reminder mode' },
      default: 'manual',
    },
    // Identifies the schedule slot an automatic reminder fills, e.g. "high:-3d" or
    // "overdue:2". Manual sends leave it null so they are never deduplicated.
    dedupeKey: {
      type: String,
      default: null,
    },
    scheduleSlot: {
      type: String,
      default: '',
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReminderTemplate',
      default: null,
    },
    templateName: {
      type: String,
      trim: true,
      default: '',
    },
    recipient: {
      type: String,
      required: [true, 'A reminder recipient is required'],
      trim: true,
    },
    subject: {
      type: String,
      trim: true,
      default: '',
      maxlength: [200, 'Subject must be at most 200 characters'],
    },
    body: {
      type: String,
      required: [true, 'Reminder body is required'],
    },
    status: {
      type: String,
      enum: { values: LOG_STATUSES, message: '{VALUE} is not a supported delivery status' },
      default: 'preview',
    },
    provider: {
      type: String,
      trim: true,
      default: '',
    },
    providerMessageId: {
      type: String,
      trim: true,
      default: '',
    },
    // Populated for WhatsApp: the prefilled wa.me link the lender opens to deliver it.
    link: {
      type: String,
      trim: true,
      default: '',
      maxlength: [2000, 'Link is too long'],
    },
    error: {
      type: String,
      trim: true,
      default: '',
    },
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, versionKey: false, collection: 'reminderLogs' },
);

reminderLogSchema.index({ loanId: 1, createdAt: -1 });
reminderLogSchema.index({ lenderId: 1, createdAt: -1 });
// The control centre filters failed attempts and status counts for one lender.
reminderLogSchema.index({ lenderId: 1, status: 1, createdAt: -1 });

// A scheduled slot can only ever produce one log per loan, so a retried or
// overlapping scheduler run cannot message the same borrower twice.
reminderLogSchema.index(
  { loanId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);

export default mongoose.model('ReminderLog', reminderLogSchema);
