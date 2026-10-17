import mongoose from 'mongoose';
import BorrowRequest from '../models/BorrowRequest.js';
import Category from '../models/Category.js';
import Item, { ITEM_CONDITIONS } from '../models/Item.js';
import Loan from '../models/Loan.js';
import { ApiError } from '../middleware/errorMiddleware.js';
import { visibleTo } from './categoryController.js';

const EDITABLE_FIELDS = ['title', 'description', 'categoryId', 'condition', 'imageUrl'];

const REQUEST_COLLECTION = BorrowRequest.collection.name;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Keeps the shape produced by aggregation identical to `.populate('ownerId', 'name')`
// so the client reads `item.ownerId.name` no matter which endpoint answered.
const OWNER_LOOKUP = {
  $lookup: {
    from: 'users',
    localField: 'ownerId',
    foreignField: '_id',
    as: 'owner',
    pipeline: [{ $project: { name: 1 } }],
  },
};

const OWNER_SHAPE = { $addFields: { ownerId: '$owner' } };

// Mirrors `.populate('categoryId', 'name defaultPriority')` for aggregated reads.
const CATEGORY_LOOKUP = {
  $lookup: {
    from: 'categories',
    localField: 'categoryId',
    foreignField: '_id',
    as: 'categoryDoc',
    pipeline: [{ $project: { name: 1, defaultPriority: 1 } }],
  },
};

const CATEGORY_SHAPE = { $addFields: { categoryId: { $arrayElemAt: ['$categoryDoc', 0] } } };

async function assertCategory(categoryId, userId) {
  if (!categoryId) throw new ApiError(400, 'Category is required');
  if (!mongoose.isValidObjectId(String(categoryId))) throw new ApiError(400, 'Malformed category id');

  const category = await Category.findOne({ _id: categoryId, ...visibleTo(userId) });
  if (!category) throw new ApiError(404, 'Category not found');

  return category;
}

export async function createItem(req, res) {
  const { title, description, categoryId, condition, imageUrl } = req.body;

  if (!title || !description || !categoryId || !condition) {
    throw new ApiError(400, 'Title, description, category and condition are required');
  }
  if (!ITEM_CONDITIONS.includes(condition)) {
    throw new ApiError(400, `Condition must be one of: ${ITEM_CONDITIONS.join(', ')}`);
  }

  const category = await assertCategory(categoryId, req.user._id);

  const item = await Item.create({
    ownerId: req.user._id,
    title,
    description,
    categoryId: category._id,
    condition,
    imageUrl: imageUrl || '',
    status: 'available',
  });

  res.status(201).json({ item: await item.populate('categoryId', 'name defaultPriority') });
}

export async function listItems(req, res) {
  const { q, categoryId, status } = req.query;

  const baseMatch = { status: status || { $ne: 'archived' } };
  if (q) {
    const pattern = new RegExp(escapeRegex(String(q).trim()), 'i');
    baseMatch.$or = [{ title: pattern }, { description: pattern }];
  }

  const scopedByCategory =
    categoryId && mongoose.isValidObjectId(String(categoryId))
      ? [{ $match: { categoryId: new mongoose.Types.ObjectId(String(categoryId)) } }]
      : [];

  const [result] = await Item.aggregate([
    { $match: baseMatch },
    {
      $facet: {
        items: [
          ...scopedByCategory,
          { $sort: { createdAt: -1 } },
          OWNER_LOOKUP,
          { $unwind: '$owner' },
          CATEGORY_LOOKUP,
          CATEGORY_SHAPE,
          OWNER_SHAPE,
          { $project: { owner: 0, categoryDoc: 0 } },
        ],
        total: [...scopedByCategory, { $count: 'value' }],
        categories: [
          { $group: { _id: '$categoryId', count: { $sum: 1 } } },
          {
            $lookup: {
              from: 'categories',
              localField: '_id',
              foreignField: '_id',
              as: 'categoryDoc',
              pipeline: [{ $project: { name: 1, defaultPriority: 1 } }],
            },
          },
          { $unwind: '$categoryDoc' },
          {
            $project: {
              _id: 1,
              count: 1,
              name: '$categoryDoc.name',
              defaultPriority: '$categoryDoc.defaultPriority',
            },
          },
          { $sort: { count: -1, name: 1 } },
        ],
      },
    },
  ]);

  res.json({
    items: result.items,
    total: result.total[0]?.value ?? 0,
    categories: result.categories,
  });
}

export async function getMyItems(req, res) {
  const items = await Item.aggregate([
    { $match: { ownerId: req.user._id, status: { $ne: 'archived' } } },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: REQUEST_COLLECTION,
        let: { itemId: '$_id' },
        as: 'pendingRequests',
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$itemId', '$$itemId'] }, { $eq: ['$status', 'pending'] }],
              },
            },
          },
          { $count: 'count' },
        ],
      },
    },
    {
      $lookup: {
        from: 'loans',
        let: { itemId: '$_id' },
        as: 'activeLoans',
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$itemId', '$$itemId'] }, { $eq: ['$status', 'active'] }],
              },
            },
          },
          {
            $project: {
              priority: 1,
              dueDate: 1,
              borrowerName: '$borrower.name',
              remindersEnabled: '$reminders.enabled',
            },
          },
        ],
      },
    },
    OWNER_LOOKUP,
    { $unwind: '$owner' },
    CATEGORY_LOOKUP,
    CATEGORY_SHAPE,
    OWNER_SHAPE,
    {
      $addFields: {
        pendingRequestCount: { $ifNull: [{ $arrayElemAt: ['$pendingRequests.count', 0] }, 0] },
        activeLoan: { $arrayElemAt: ['$activeLoans', 0] },
      },
    },
    { $project: { owner: 0, categoryDoc: 0, pendingRequests: 0, activeLoans: 0 } },
  ]);

  res.json({ items });
}

export async function getItemById(req, res) {
  const item = await Item.findById(req.params.id)
    .populate('ownerId', 'name')
    .populate('categoryId', 'name defaultPriority');
  if (!item || item.status === 'archived') {
    throw new ApiError(404, 'Item not found');
  }
  res.json({ item });
}

export async function updateItem(req, res) {
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => EDITABLE_FIELDS.includes(key)),
  );

  if (updates.condition && !ITEM_CONDITIONS.includes(updates.condition)) {
    throw new ApiError(400, `Condition must be one of: ${ITEM_CONDITIONS.join(', ')}`);
  }
  if (updates.categoryId) {
    const category = await assertCategory(updates.categoryId, req.user._id);
    updates.categoryId = category._id;
  }

  const item = await Item.findOneAndUpdate(
    { _id: req.params.id, ownerId: req.user._id, status: { $ne: 'archived' } },
    { $set: updates },
    { returnDocument: 'after', runValidators: true },
  );

  if (!item) {
    throw new ApiError(404, 'Item not found, or it does not belong to you');
  }

  res.json({ item: await item.populate('categoryId', 'name defaultPriority') });
}

export async function deleteItem(req, res) {
  const item = await Item.findOne({ _id: req.params.id, ownerId: req.user._id });
  if (!item || item.status === 'archived') {
    throw new ApiError(404, 'Item not found, or it does not belong to you');
  }
  if (item.status === 'borrowed') {
    throw new ApiError(400, 'This item is currently on loan and cannot be deleted');
  }

  const pendingRequests = await BorrowRequest.countDocuments({ itemId: item._id, status: 'pending' });
  if (pendingRequests > 0) {
    throw new ApiError(400, 'Resolve the pending requests for this item before deleting it');
  }

  // Listings with loan history are archived so past loans keep resolving.
  const hasLoanHistory = (await Loan.countDocuments({ itemId: item._id })) > 0;
  if (hasLoanHistory) {
    item.status = 'archived';
    await item.save();
    return res.json({ archived: true, item });
  }

  await Item.findOneAndDelete({ _id: item._id, ownerId: req.user._id, status: 'available' });
  res.json({ deleted: true });
}
