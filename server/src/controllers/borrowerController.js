import mongoose from 'mongoose';
import Loan from '../models/Loan.js';
import User from '../models/User.js';
import { ApiError } from '../middleware/errorMiddleware.js';

const LIST_LIMIT = 200;
const HISTORY_LIMIT = 250;

const LOAN_HISTORY_POPULATE = [
  { path: 'itemId', select: 'title imageUrl status' },
  { path: 'categoryId', select: 'name' },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function endOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

export function isReturnedLate(loan) {
  if (loan.status !== 'returned' || !loan.returnedAt || !loan.dueDate) return false;
  const deadline = endOfDay(loan.dueDate);
  return Boolean(deadline) && new Date(loan.returnedAt).getTime() > deadline.getTime();
}

function decorateHistoryLoan(loan) {
  const plain = loan.toObject ? loan.toObject() : loan;
  return {
    ...plain,
    isOverdue: loan.status === 'active' && new Date(loan.dueDate).getTime() < Date.now(),
    returnedLate: isReturnedLate(loan),
  };
}

function reliabilityFrom(loans) {
  const now = Date.now();
  const active = loans.filter((loan) => loan.status === 'active');
  const returned = loans.filter((loan) => loan.status === 'returned');
  const knownReturns = returned.filter((loan) => loan.returnedAt && loan.dueDate);

  return {
    totalLoans: loans.length,
    activeLoans: active.length,
    overdueLoans: active.filter((loan) => new Date(loan.dueDate).getTime() < now).length,
    completedLoans: returned.length,
    onTimeReturns: knownReturns.filter((loan) => !isReturnedLate(loan)).length,
    lateReturns: knownReturns.filter(isReturnedLate).length,
    // Older closed records may not carry a return timestamp. They are excluded from
    // the on-time count rather than guessed in either direction.
    unknownReturnTiming: returned.length - knownReturns.length,
    nextDueAt:
      active
        .map((loan) => loan.dueDate)
        .filter(Boolean)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null,
    firstLentAt:
      loans
        .map((loan) => loan.lentAt)
        .filter(Boolean)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null,
    lastLentAt:
      loans
        .map((loan) => loan.lentAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null,
  };
}

// Account-linked borrowers are grouped by their account id. Manual snapshots are never
// merged with each other or with an account, even when name, email or phone match.
export async function listBorrowers(req, res) {
  const q = String(req.query.q ?? '').trim().slice(0, 80);
  const pattern = q ? new RegExp(escapeRegex(q), 'i') : null;

  const linkedGroups = await Loan.aggregate([
    { $match: { lenderId: req.user._id, borrowerId: { $type: 'objectId' } } },
    {
      $group: {
        _id: '$borrowerId',
        totalLoans: { $sum: 1 },
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
        returnedLoans: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
        activeDueDates: {
          $push: {
            $cond: [{ $eq: ['$status', 'active'] }, '$dueDate', '$$REMOVE'],
          },
        },
        lastLentAt: { $max: '$lentAt' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'account',
        pipeline: [{ $project: { name: 1, email: 1, 'profile.phone': 1, deletedAt: 1 } }],
      },
    },
    { $unwind: '$account' },
    { $match: { 'account.deletedAt': null } },
    {
      $project: {
        _id: 0,
        borrowerId: '$_id',
        name: '$account.name',
        email: '$account.email',
        phone: { $ifNull: ['$account.profile.phone', ''] },
        totalLoans: 1,
        activeLoans: 1,
        overdueLoans: 1,
        returnedLoans: 1,
        lastLentAt: 1,
        nextDueAt: { $min: '$activeDueDates' },
      },
    },
    ...(pattern
      ? [{ $match: { $or: [{ name: pattern }, { email: pattern }, { phone: pattern }] } }]
      : []),
    { $sort: { lastLentAt: -1 } },
    { $limit: LIST_LIMIT },
  ]);

  const linked = linkedGroups.map((entry) => ({
    key: `account:${entry.borrowerId}`,
    linked: true,
    ...entry,
  }));

  const manualLoans = await Loan.find({
    lenderId: req.user._id,
    borrowerId: null,
    ...(pattern
      ? {
          $or: [
            { 'borrower.name': pattern },
            { 'borrower.email': pattern },
            { 'borrower.phone': pattern },
          ],
        }
      : {}),
  })
    .sort({ lentAt: -1 })
    .limit(LIST_LIMIT)
    .select('itemName borrower.name borrower.email borrower.phone lentAt dueDate returnedAt status')
    .lean();

  // Each manual snapshot is its own record. Grouping by matching contact details would
  // invent an identity that was never verified, so they deliberately stay unmerged.
  const manualEntries = manualLoans.map((loan) => ({
    key: `manual:${loan._id}`,
    linked: false,
    loanId: loan._id,
    name: loan.borrower?.name ?? 'Unknown borrower',
    email: loan.borrower?.email ?? '',
    phone: loan.borrower?.phone ?? '',
    itemName: loan.itemName,
    lentAt: loan.lentAt,
    dueDate: loan.dueDate,
    returnedAt: loan.returnedAt,
    status: loan.status,
    isOverdue: loan.status === 'active' && new Date(loan.dueDate).getTime() < Date.now(),
  }));

  res.json({
    borrowers: linked,
    manualEntries,
    counts: {
      linked: linked.length,
      manual: manualEntries.length,
      activeLoans:
        linked.reduce((total, entry) => total + entry.activeLoans, 0) +
        manualEntries.filter((entry) => entry.status === 'active').length,
      overdueLoans:
        linked.reduce((total, entry) => total + entry.overdueLoans, 0) +
        manualEntries.filter((entry) => entry.isOverdue).length,
    },
  });
}

export async function getBorrower(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Malformed borrower id');

  const account = await User.findOne({ _id: id, deletedAt: null }).select(
    'name email profile.phone',
  );
  if (!account) throw new ApiError(404, 'Borrower account not found');

  const loans = await Loan.find({ lenderId: req.user._id, borrowerId: account._id })
    .sort({ lentAt: -1 })
    .limit(HISTORY_LIMIT)
    .populate(LOAN_HISTORY_POPULATE);

  // No relationship means no profile: another lender's borrowers are never visible.
  if (!loans.length) {
    throw new ApiError(404, 'No lending history with this borrower');
  }

  res.json({
    borrower: {
      borrowerId: account._id,
      linked: true,
      name: account.name,
      email: account.email,
      phone: account.profile?.phone ?? '',
      ...reliabilityFrom(loans),
    },
    loans: loans.map(decorateHistoryLoan),
    truncated: loans.length === HISTORY_LIMIT,
  });
}
