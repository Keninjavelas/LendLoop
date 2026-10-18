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

const OWNER_ITEM_SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  title: { title: 1 },
  // Items with a deadline sort first by that deadline; items on the shelf fall to the
  // end so the inventory list answers "what is due next" without a second endpoint.
  due: { sortDue: 1, createdAt: -1 },
};

export async function getMyItems(req, res) {
  const requestedView = String(req.query.view ?? 'all');
  const view = ['available', 'borrowed', 'archived'].includes(requestedView)
    ? requestedView
    : 'all';
  const sort = Object.hasOwn(OWNER_ITEM_SORTS, req.query.sort) ? req.query.sort : 'newest';
  const q = String(req.query.q ?? '').trim().slice(0, 80);

  const match = { ownerId: req.user._id };
  if (view === 'all') match.status = { $ne: 'archived' };
  else match.status = view;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    match.$or = [{ title: pattern }, { description: pattern }];
  }

  const [items, statusCounts, pendingRequests] = await Promise.all([
    Item.aggregate([
      { $match: match },
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
                _id: 1,
                borrowerId: 1,
                borrowerName: '$borrower.name',
                lentAt: 1,
                dueDate: 1,
                priority: 1,
                remindersEnabled: '$reminders.enabled',
                nextReminderAt: '$reminders.nextDueAt',
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
          sortDue: {
            $ifNull: [{ $arrayElemAt: ['$activeLoans.dueDate', 0] }, new Date('9999-12-31')],
          },
        },
      },
      { $sort: OWNER_ITEM_SORTS[sort] },
      {
        $project: {
          owner: 0,
          categoryDoc: 0,
          pendingRequests: 0,
          activeLoans: 0,
          sortDue: 0,
        },
      },
    ]),
    Item.aggregate([
      { $match: { ownerId: req.user._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    BorrowRequest.countDocuments({ ownerId: req.user._id, status: 'pending' }),
  ]);

  const byStatus = { available: 0, borrowed: 0, archived: 0 };
  for (const entry of statusCounts) {
    if (Object.hasOwn(byStatus, entry._id)) byStatus[entry._id] = entry.count;
  }

  res.json({
    items,
    counts: {
      all: byStatus.available + byStatus.borrowed,
      ...byStatus,
      pendingRequests,
    },
  });
}

// Owner-only context. It is attached to the item payload so the public shape stays
// `{ item }`; no owner-only field is returned to anyone else.
async function getOwnerItemContext(itemId) {
  const [activeLoan, pending, recent, totalLoans, returnedLoans] = await Promise.all([
    Loan.findOne({ itemId, status: 'active' })
      .select('borrowerId borrower.name lentAt dueDate priority origin reminders.enabled reminders.nextDueAt')
      .lean(),
    BorrowRequest.find({ itemId, status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(20)
      .select('borrowerId message requestedReturnDate createdAt')
      .populate('borrowerId', 'name')
      .lean(),
    Loan.find({ itemId, status: 'returned' })
      .sort({ returnedAt: -1 })
      .limit(10)
      .select('borrower.name lentAt dueDate returnedAt returnNote')
      .lean(),
    Loan.countDocuments({ itemId }),
    Loan.countDocuments({ itemId, status: 'returned' }),
  ]);

  return {
    activeLoan: activeLoan
      ? {
          _id: activeLoan._id,
          borrowerId: activeLoan.borrowerId ?? null,
          borrowerName: activeLoan.borrower?.name ?? 'Unknown borrower',
          lentAt: activeLoan.lentAt,
          dueDate: activeLoan.dueDate,
          priority: activeLoan.priority,
          origin: activeLoan.origin,
          remindersEnabled: activeLoan.reminders?.enabled !== false,
          nextReminderAt: activeLoan.reminders?.nextDueAt ?? null,
        }
      : null,
    pendingRequests: pending.map((request) => ({
      _id: request._id,
      borrowerId: request.borrowerId?._id ?? null,
      borrowerName: request.borrowerId?.name ?? 'Unknown borrower',
      message: request.message,
      requestedReturnDate: request.requestedReturnDate,
      createdAt: request.createdAt,
    })),
    recentLoans: recent.map((loan) => ({
      _id: loan._id,
      borrowerName: loan.borrower?.name ?? 'Unknown borrower',
      lentAt: loan.lentAt,
      dueDate: loan.dueDate,
      returnedAt: loan.returnedAt,
      returnNote: loan.returnNote,
    })),
    totalLoans,
    completedLoans: returnedLoans,
  };
}

export async function getItemById(req, res) {
  const item = await Item.findById(req.params.id)
    .populate('ownerId', 'name')
    .populate('categoryId', 'name defaultPriority');
  if (!item) throw new ApiError(404, 'Item not found');

  const ownerId = item.ownerId?._id ?? item.ownerId;
  const isOwner = Boolean(req.user?._id) && ownerId?.equals(req.user._id);

  // Archived listings stay reachable only to their owner so history links keep working.
  if (item.status === 'archived' && !isOwner) {
    throw new ApiError(404, 'Item not found');
  }

  const payload = item.toObject();
  if (isOwner) payload.ownerContext = await getOwnerItemContext(item._id);
  res.json({ item: payload });
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

export async function archiveItem(req, res) {
  const item = await Item.findOne({ _id: req.params.id, ownerId: req.user._id });
  if (!item || item.status === 'archived') {
    throw new ApiError(404, 'Item not found, or it does not belong to you');
  }
  if (item.status === 'borrowed') {
    throw new ApiError(400, 'This item is on loan and cannot be archived yet');
  }

  const pendingRequests = await BorrowRequest.countDocuments({ itemId: item._id, status: 'pending' });
  if (pendingRequests > 0) {
    throw new ApiError(400, 'Resolve the pending requests for this item before archiving it');
  }

  item.status = 'archived';
  await item.save();
  res.json({ item });
}

export async function restoreItem(req, res) {
  const item = await Item.findOne({
    _id: req.params.id,
    ownerId: req.user._id,
    status: 'archived',
  });
  if (!item) throw new ApiError(404, 'Archived item not found, or it does not belong to you');

  // A restored listing has to be genuinely lendable. The active-loan index would reject
  // a second loan, but surfacing the conflict here keeps the shelf state truthful.
  const activeLoan = await Loan.exists({ itemId: item._id, status: 'active' });
  if (activeLoan) {
    throw new ApiError(409, 'This item still has an active loan and cannot be restored');
  }

  item.status = 'available';
  await item.save();
  res.json({ item });
}
