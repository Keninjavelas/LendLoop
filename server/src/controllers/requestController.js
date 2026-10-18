import mongoose from 'mongoose';
import { LOAN_POPULATE, decorate } from './loanController.js';
import BorrowRequest from '../models/BorrowRequest.js';
import Item from '../models/Item.js';
import Loan from '../models/Loan.js';
import User from '../models/User.js';
import { ApiError } from '../middleware/errorMiddleware.js';
import { categoryDefaultPriority, recordHistory } from '../services/deadlineService.js';
import { priorityDefaults, refreshSchedule, usableChannels } from '../services/reminderService.js';

const REQUEST_POPULATE = [
  {
    path: 'itemId',
    select: 'title imageUrl condition status categoryId',
    populate: { path: 'categoryId', select: 'name defaultPriority' },
  },
  { path: 'borrowerId', select: 'name email' },
  { path: 'ownerId', select: 'name email' },
];

async function populateRequest(request) {
  return request.populate(REQUEST_POPULATE);
}

const REQUESTS_LIMIT = 250;

function requestFilter(req, base) {
  const filter = { ...base };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.itemId && mongoose.isValidObjectId(String(req.query.itemId))) {
    filter.itemId = new mongoose.Types.ObjectId(String(req.query.itemId));
  }
  return filter;
}

// Incoming requests show whether the requester is a known account-linked borrower for
// this lender. The lookup is one aggregate for the whole page and stays within the
// caller's own loans, so another lender's relationship is never exposed.
async function attachBorrowerHistory(requests, lenderId) {
  const borrowerIds = [
    ...new Set(
      requests
        .map((request) => request.borrowerId?._id ?? request.borrowerId)
        .filter((id) => id && mongoose.isValidObjectId(String(id)))
        .map(String),
    ),
  ];

  if (!borrowerIds.length) return requests.map((request) => request.toObject());

  const summaries = await Loan.aggregate([
    {
      $match: {
        lenderId,
        borrowerId: { $in: borrowerIds.map((id) => new mongoose.Types.ObjectId(id)) },
      },
    },
    {
      $group: {
        _id: '$borrowerId',
        priorLoans: { $sum: 1 },
        activeLoans: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        overdueLoans: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'active'] }, { $lt: ['$dueDate', new Date()] }] },
              1,
              0,
            ],
          },
        },
        lastLentAt: { $max: '$lentAt' },
      },
    },
  ]);

  const byBorrower = new Map(summaries.map((entry) => [String(entry._id), entry]));

  return requests.map((request) => {
    const plain = request.toObject();
    const borrowerId = plain.borrowerId?._id ?? plain.borrowerId;
    const summary = borrowerId ? byBorrower.get(String(borrowerId)) : null;
    plain.borrowerHistory = summary
      ? {
          linked: true,
          priorLoans: summary.priorLoans,
          activeLoans: summary.activeLoans,
          overdueLoans: summary.overdueLoans,
          lastLentAt: summary.lastLentAt,
        }
      : { linked: true, priorLoans: 0, activeLoans: 0, overdueLoans: 0, lastLentAt: null };
    return plain;
  });
}

export async function createRequest(req, res) {
  const { itemId, requestedReturnDate, message } = req.body;

  if (!itemId || !requestedReturnDate) {
    throw new ApiError(400, 'An item and a requested return date are required');
  }
  if (!mongoose.isValidObjectId(itemId)) {
    throw new ApiError(400, 'Malformed item id');
  }

  const returnDate = new Date(requestedReturnDate);
  if (Number.isNaN(returnDate.getTime())) {
    throw new ApiError(400, 'Requested return date is not a valid date');
  }
  if (returnDate.getTime() <= Date.now()) {
    throw new ApiError(400, 'Requested return date must be in the future');
  }

  const item = await Item.findById(itemId);
  if (!item || item.status === 'archived') {
    throw new ApiError(404, 'Item not found');
  }
  if (item.ownerId.equals(req.user._id)) {
    throw new ApiError(400, 'You cannot borrow your own item');
  }
  if (item.status !== 'available') {
    throw new ApiError(409, 'This item is not available for borrowing right now');
  }

  const duplicate = await BorrowRequest.findOne({
    itemId: item._id,
    borrowerId: req.user._id,
    status: 'pending',
  });
  if (duplicate) {
    throw new ApiError(409, 'You already have a pending request for this item');
  }

  const request = await BorrowRequest.create({
    itemId: item._id,
    borrowerId: req.user._id,
    ownerId: item.ownerId,
    message: message || '',
    requestedReturnDate: returnDate,
    status: 'pending',
  });

  res.status(201).json({ request: await populateRequest(request) });
}

export async function getIncomingRequests(req, res) {
  const requests = await BorrowRequest.find(requestFilter(req, { ownerId: req.user._id }))
    .sort({ createdAt: -1 })
    .limit(REQUESTS_LIMIT)
    .populate(REQUEST_POPULATE);

  res.json({ requests: await attachBorrowerHistory(requests, req.user._id) });
}

export async function getOutgoingRequests(req, res) {
  const requests = await BorrowRequest.find(requestFilter(req, { borrowerId: req.user._id }))
    .sort({ createdAt: -1 })
    .limit(REQUESTS_LIMIT)
    .populate(REQUEST_POPULATE);

  res.json({ requests });
}

// Approval touches five documents at once, so it runs in a transaction: a partial
// commit would leave an item marked borrowed with no loan, or two active loans.
export async function approveRequest(req, res) {
  const session = await mongoose.startSession();
  let approvedRequest;
  let loan;

  try {
    await session.withTransaction(async () => {
      const request = await BorrowRequest.findById(req.params.id).session(session);
      if (!request) throw new ApiError(404, 'Request not found');
      if (!request.ownerId.equals(req.user._id)) {
        throw new ApiError(403, 'Only the item owner can approve a request');
      }
      if (request.status !== 'pending') {
        throw new ApiError(400, `This request was already ${request.status}`);
      }

      const item = await Item.findById(request.itemId).session(session);
      if (!item) throw new ApiError(404, 'The requested item no longer exists');
      if (item.status !== 'available') {
        throw new ApiError(409, 'This item is no longer available');
      }

      const existingLoan = await Loan.findOne({ itemId: item._id, status: 'active' }).session(session);
      if (existingLoan) {
        throw new ApiError(409, 'This item already has an active loan');
      }

      const [borrower, defaultPriority] = await Promise.all([
        User.findById(request.borrowerId, 'name email profile.phone', { session }),
        categoryDefaultPriority(item.categoryId, { session }),
      ]);
      if (!borrower) throw new ApiError(404, 'The borrower account no longer exists');

      request.status = 'approved';
      await request.save({ session });

      item.status = 'borrowed';
      await item.save({ session });

      await BorrowRequest.updateMany(
        { itemId: item._id, status: 'pending', _id: { $ne: request._id } },
        { $set: { status: 'rejected' } },
        { session },
      );

      const priority = defaultPriority ?? 'medium';

      [loan] = await Loan.create(
        [
          {
            origin: 'request',
            requestId: request._id,
            itemId: item._id,
            itemName: item.title,
            description: item.description,
            categoryId: item.categoryId,
            lenderId: item.ownerId,
            borrowerId: borrower._id,
            // Consent stays unrecorded: asking to borrow an item is not the same as
            // agreeing to be reminded about it, so the lender confirms it on the entry.
            borrower: {
              name: borrower.name,
              email: borrower.email,
              phone: borrower.profile?.phone ?? '',
              consent: { email: false, whatsapp: false, recordedAt: null },
            },
            lentAt: new Date(),
            dueDate: request.requestedReturnDate,
            status: 'active',
            priority,
            prioritySource: 'category',
            reminders: { channels: priorityDefaults(priority).channels },
          },
        ],
        { session },
      );

      await refreshSchedule(loan, { session });
      await loan.save({ session });

      await recordHistory(
        {
          loan,
          actorId: req.user._id,
          kind: 'created',
          field: 'status',
          from: null,
          to: 'active',
          reason: `Borrow request approved${request.message ? `: ${request.message}` : ''}`.slice(0, 200),
        },
        { session },
      );

      approvedRequest = request;
    });
  } finally {
    session.endSession();
  }

  const created = await Loan.findById(loan._id).populate(LOAN_POPULATE);
  const warnings = [];
  if (!usableChannels(created).length) {
    warnings.push(
      'Automatic reminders are paused until you record the borrower consent and channel on this entry',
    );
  }

  res.json({
    request: await populateRequest(approvedRequest),
    loan: decorate(created),
    warnings,
  });
}

export async function rejectRequest(req, res) {
  const request = await BorrowRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, 'Request not found');
  if (!request.ownerId.equals(req.user._id)) {
    throw new ApiError(403, 'Only the item owner can reject a request');
  }
  if (request.status !== 'pending') {
    throw new ApiError(400, `This request was already ${request.status}`);
  }

  request.status = 'rejected';
  await request.save();

  res.json({ request: await populateRequest(request) });
}

export async function cancelRequest(req, res) {
  const request = await BorrowRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, 'Request not found');
  if (!request.borrowerId.equals(req.user._id)) {
    throw new ApiError(403, 'Only the borrower can cancel a request');
  }
  if (request.status !== 'pending') {
    throw new ApiError(400, `This request was already ${request.status}`);
  }

  request.status = 'cancelled';
  await request.save();

  res.json({ request: await populateRequest(request) });
}
