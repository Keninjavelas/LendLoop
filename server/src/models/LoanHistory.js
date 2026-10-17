import mongoose from 'mongoose';

export const HISTORY_KINDS = [
  'created',
  'deadline',
  'priority',
  'category',
  'status',
  'reminders',
  'borrower',
  'notes',
];

const loanHistorySchema = new mongoose.Schema(
  {
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Loan',
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    kind: {
      type: String,
      enum: { values: HISTORY_KINDS, message: '{VALUE} is not a supported history entry' },
      required: true,
    },
    field: {
      type: String,
      trim: true,
      default: '',
    },
    from: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    to: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: '',
      maxlength: [300, 'Reason must be at most 300 characters'],
    },
  },
  { timestamps: true, versionKey: false, collection: 'loanHistory' },
);

loanHistorySchema.index({ loanId: 1, createdAt: -1 });
loanHistorySchema.index({ actorId: 1, createdAt: -1 });

export default mongoose.model('LoanHistory', loanHistorySchema);
