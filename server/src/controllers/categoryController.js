import Category from '../models/Category.js';
import Item from '../models/Item.js';
import Loan from '../models/Loan.js';
import ReminderTemplate from '../models/ReminderTemplate.js';
import { ApiError } from '../middleware/errorMiddleware.js';
import { PRIORITIES } from '../utils/constants.js';

// System categories (ownerId null) ship with LendLoop; the rest belong to one lender.
export function visibleTo(userId) {
  return { $or: [{ ownerId: null }, { ownerId: userId }] };
}

function countMap(rows) {
  return Object.fromEntries(rows.map((row) => [String(row._id), row.count]));
}

async function usageCounts(ids) {
  if (!ids.length) return { items: {}, loans: {}, templates: {} };

  const group = [{ $group: { _id: '$categoryId', count: { $sum: 1 } } }];
  const [itemRows, loanRows, templateRows] = await Promise.all([
    Item.aggregate([{ $match: { categoryId: { $in: ids } } }, ...group]),
    Loan.aggregate([{ $match: { categoryId: { $in: ids } } }, ...group]),
    ReminderTemplate.aggregate([{ $match: { categoryId: { $in: ids } } }, ...group]),
  ]);

  return {
    items: countMap(itemRows),
    loans: countMap(loanRows),
    templates: countMap(templateRows),
  };
}

function withUsage(category, counts) {
  const id = String(category._id);
  return {
    ...category.toObject(),
    usage: {
      items: counts.items[id] ?? 0,
      loans: counts.loans[id] ?? 0,
      templates: counts.templates[id] ?? 0,
    },
  };
}

export async function listCategories(req, res) {
  const categories = await Category.find(visibleTo(req.user._id)).sort({ isSystem: -1, name: 1 });
  const counts = await usageCounts(categories.map((category) => category._id));

  res.json({ categories: categories.map((category) => withUsage(category, counts)) });
}

export async function createCategory(req, res) {
  const { name, description = '', defaultPriority = 'medium' } = req.body;

  if (!name || !String(name).trim()) throw new ApiError(400, 'Category name is required');
  if (!PRIORITIES.includes(defaultPriority)) {
    throw new ApiError(400, `Default priority must be one of: ${PRIORITIES.join(', ')}`);
  }

  const trimmed = String(name).trim();
  const clash = await Category.findOne({
    ownerId: null,
    name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  });
  if (clash) {
    throw new ApiError(409, `"${clash.name}" already exists as a shared category`);
  }

  const category = await Category.create({
    name: trimmed,
    description: String(description).trim(),
    defaultPriority,
    ownerId: req.user._id,
    isSystem: false,
  });

  res.status(201).json({ category: withUsage(category, await usageCounts([category._id])) });
}

// Editing a default priority deliberately leaves existing loans untouched: they keep the
// priority they were created with unless the lender changes them, or unless they still
// track their category (prioritySource "category") and are moved to another category.
export async function updateCategory(req, res) {
  const category = await Category.findOne({ _id: req.params.id, ...visibleTo(req.user._id) });
  if (!category) throw new ApiError(404, 'Category not found');
  if (category.isSystem || !category.ownerId || !category.ownerId.equals(req.user._id)) {
    throw new ApiError(403, 'Shared categories are read-only — create your own to set a different default');
  }

  const { name, description, defaultPriority } = req.body;

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) throw new ApiError(400, 'Category name cannot be empty');
    category.name = trimmed;
  }
  if (description !== undefined) category.description = String(description).trim();
  if (defaultPriority !== undefined) {
    if (!PRIORITIES.includes(defaultPriority)) {
      throw new ApiError(400, `Default priority must be one of: ${PRIORITIES.join(', ')}`);
    }
    category.defaultPriority = defaultPriority;
  }

  await category.save();

  res.json({ category: withUsage(category, await usageCounts([category._id])) });
}

export async function deleteCategory(req, res) {
  const category = await Category.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');
  if (!category.ownerId || !category.ownerId.equals(req.user._id)) {
    throw new ApiError(403, 'Shared categories cannot be deleted');
  }

  const [items, loans, templates] = await Promise.all([
    Item.countDocuments({ categoryId: category._id }),
    Loan.countDocuments({ categoryId: category._id }),
    ReminderTemplate.countDocuments({ categoryId: category._id }),
  ]);

  if (items || loans || templates) {
    const parts = [
      items ? `${items} item${items === 1 ? '' : 's'}` : '',
      loans ? `${loans} lending entr${loans === 1 ? 'y' : 'ies'}` : '',
      templates ? `${templates} template${templates === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    throw new ApiError(409, `Category is still used by ${parts.join(', ')}`);
  }

  await category.deleteOne();

  res.json({ deleted: true, categoryId: category._id });
}
