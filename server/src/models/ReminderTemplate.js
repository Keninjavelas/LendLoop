import mongoose from 'mongoose';
import { PRIORITIES } from '../utils/constants.js';

export const TEMPLATE_SCOPES = ['priority', 'category', 'general'];

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

const reminderTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: [80, 'Template name must be at most 80 characters'],
    },
    scope: {
      type: String,
      enum: { values: TEMPLATE_SCOPES, message: '{VALUE} is not a supported template scope' },
      default: 'general',
    },
    priority: {
      type: String,
      enum: { values: [...PRIORITIES, null], message: '{VALUE} is not a supported priority' },
      default: null,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    subject: {
      type: String,
      required: [true, 'Template subject is required'],
      trim: true,
      maxlength: [160, 'Subject must be at most 160 characters'],
    },
    body: {
      type: String,
      required: [true, 'Template body is required'],
      trim: true,
      maxlength: [2000, 'Body must be at most 2000 characters'],
    },
  },
  { timestamps: true, versionKey: false, collection: 'reminderTemplates' },
);

reminderTemplateSchema.index({ ownerId: 1, scope: 1 });
reminderTemplateSchema.index({ categoryId: 1 });
reminderTemplateSchema.index({ priority: 1 });

// Mongoose 9 hooks receive no `next` callback, so a broken scope is reported through
// invalidate() and surfaces as an ordinary validation error instead of a thrown 500.
reminderTemplateSchema.pre('validate', function validateScopeTargets() {
  if (this.scope === 'priority' && !this.priority) {
    this.invalidate('priority', 'A priority template must target a priority');
  }
  if (this.scope === 'category' && !this.categoryId) {
    this.invalidate('categoryId', 'A category template must target a category');
  }
  if (this.scope !== 'priority') this.priority = null;
  if (this.scope !== 'category') this.categoryId = null;
});

// Serialised with the document so the template editor can show what a template uses.
// Supported keys live in utils/renderTemplate.js (TEMPLATE_PLACEHOLDERS).
reminderTemplateSchema.virtual('placeholders').get(function listPlaceholders() {
  return [
    ...new Set([...`${this.subject} ${this.body}`.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1])),
  ];
});

reminderTemplateSchema.set('toJSON', { virtuals: true });

export default mongoose.model('ReminderTemplate', reminderTemplateSchema);
