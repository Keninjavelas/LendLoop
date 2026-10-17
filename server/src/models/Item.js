import mongoose from 'mongoose';

export const ITEM_CONDITIONS = ['New', 'Good', 'Fair'];

export const ITEM_STATUSES = ['available', 'borrowed', 'archived'];

const itemSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Item title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [100, 'Title must be at most 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [1000, 'Description must be at most 1000 characters'],
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    condition: {
      type: String,
      required: [true, 'Condition is required'],
      enum: { values: ITEM_CONDITIONS, message: '{VALUE} is not a supported condition' },
    },
    imageUrl: {
      type: String,
      trim: true,
      default: '',
      maxlength: [2048, 'Image URL is too long'],
    },
    status: {
      type: String,
      enum: { values: ITEM_STATUSES, message: '{VALUE} is not a supported status' },
      default: 'available',
    },
  },
  { timestamps: true, versionKey: false },
);

itemSchema.index({ ownerId: 1 });
itemSchema.index({ status: 1, categoryId: 1 });
itemSchema.index({ title: 'text', description: 'text' });

export default mongoose.model('Item', itemSchema);
