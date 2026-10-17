import mongoose from 'mongoose';

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

const borrowRequestSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
    },
    borrowerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Message must be at most 500 characters'],
    },
    requestedReturnDate: {
      type: Date,
      required: [true, 'Requested return date is required'],
      validate: {
        validator(value) {
          if (!this.isNew) return true;
          return value.getTime() > Date.now();
        },
        message: 'Requested return date must be in the future',
      },
    },
    status: {
      type: String,
      enum: { values: REQUEST_STATUSES, message: '{VALUE} is not a supported request status' },
      default: 'pending',
    },
  },
  { timestamps: true, versionKey: false, collection: 'requests' },
);

borrowRequestSchema.index({ itemId: 1, status: 1 });
borrowRequestSchema.index({ ownerId: 1, createdAt: -1 });
borrowRequestSchema.index({ borrowerId: 1, createdAt: -1 });

// A borrower may hold at most one pending request per item.
borrowRequestSchema.index(
  { itemId: 1, borrowerId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);

export default mongoose.model('BorrowRequest', borrowRequestSchema);
