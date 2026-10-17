import mongoose from 'mongoose';
import { PRIORITIES } from '../utils/constants.js';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters'],
      maxlength: [60, 'Category name must be at most 60 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [200, 'Description must be at most 200 characters'],
    },
    defaultPriority: {
      type: String,
      enum: { values: PRIORITIES, message: '{VALUE} is not a supported priority' },
      default: 'medium',
    },
    // null means a shared system category that ships with LendLoop.
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, versionKey: false, collection: 'categories' },
);

categorySchema.index({ ownerId: 1, name: 1 }, { unique: true });
categorySchema.index({ isSystem: 1, name: 1 });

export default mongoose.model('Category', categorySchema);
