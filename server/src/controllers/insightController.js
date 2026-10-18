import Loan from '../models/Loan.js';
import ReminderLog from '../models/ReminderLog.js';
import { ApiError } from '../middleware/errorMiddleware.js';

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 1095; // three years
const MIN_RATE_SAMPLE = 5;

function parseBoundary(value, { end = false } = {}) {
  if (!value) return null;
  const text = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    // Date-only ranges are inclusive at both ends, so the exclusive upper bound is
    // the following UTC midnight.
    if (end) date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveRange(query) {
  const now = new Date();
  const defaultTo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const toExclusive = query.to ? parseBoundary(query.to, { end: true }) : defaultTo;
  if (!toExclusive) throw new ApiError(400, 'The end date is not a valid date');

  const from =
    query.from && String(query.from).trim()
      ? parseBoundary(query.from)
      : new Date(toExclusive.getTime() - 90 * DAY_MS);
  if (!from) throw new ApiError(400, 'The start date is not a valid date');
  if (from.getTime() >= toExclusive.getTime()) {
    throw new ApiError(400, 'The start date must be before the end date');
  }

  const days = Math.round((toExclusive.getTime() - from.getTime()) / DAY_MS);
  if (days > MAX_RANGE_DAYS) {
    throw new ApiError(400, 'Choose a range of three years or less');
  }

  return {
    from,
    toExclusive,
    days,
    labels: {
      from: from.toISOString().slice(0, 10),
      to: new Date(toExclusive.getTime() - DAY_MS).toISOString().slice(0, 10),
    },
  };
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function roundOne(value) {
  return value === null || value === undefined ? null : Math.round(value * 10) / 10;
}

export async function getInsights(req, res) {
  const range = resolveRange(req.query);
  const userId = req.user._id;
  const now = new Date();

  const [snapshotRows, lentRows, returnRows, legacyRows, volume, categories, reminderGroups] =
    await Promise.all([
      Loan.aggregate([
        { $match: { $or: [{ lenderId: userId }, { borrowerId: userId }] } },
        {
          $group: {
            _id: null,
            activeLent: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$lenderId', userId] }, { $eq: ['$status', 'active'] }] },
                  1,
                  0,
                ],
              },
            },
            activeBorrowed: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$borrowerId', userId] }, { $eq: ['$status', 'active'] }] },
                  1,
                  0,
                ],
              },
            },
            overdueLent: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$lenderId', userId] },
                      { $eq: ['$status', 'active'] },
                      { $lt: ['$dueDate', now] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            overdueBorrowed: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$borrowerId', userId] },
                      { $eq: ['$status', 'active'] },
                      { $lt: ['$dueDate', now] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      Loan.aggregate([
        {
          $match: {
            lenderId: userId,
            lentAt: { $gte: range.from, $lt: range.toExclusive },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            returned: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
            overdueNow: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$status', 'active'] }, { $lt: ['$dueDate', now] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      Loan.aggregate([
        {
          $match: {
            lenderId: userId,
            status: 'returned',
            returnedAt: { $gte: range.from, $lt: range.toExclusive },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            // Deadline days are calendar days: returning during the deadline day is on time.
            onTime: {
              $sum: {
                $cond: [
                  { $lte: ['$returnedAt', { $add: ['$dueDate', DAY_MS - 1] }] },
                  1,
                  0,
                ],
              },
            },
            late: {
              $sum: {
                $cond: [
                  { $gt: ['$returnedAt', { $add: ['$dueDate', DAY_MS - 1] }] },
                  1,
                  0,
                ],
              },
            },
            averageDays: {
              $avg: { $divide: [{ $subtract: ['$returnedAt', '$lentAt'] }, DAY_MS] },
            },
          },
        },
      ]),
      Loan.aggregate([
        { $match: { lenderId: userId, status: 'returned', returnedAt: null } },
        { $count: 'count' },
      ]),
      Loan.aggregate([
        {
          $match: {
            lenderId: userId,
            lentAt: { $gte: range.from, $lt: range.toExclusive },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$lentAt', timezone: 'UTC' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, month: '$_id', count: 1 } },
      ]),
      Loan.aggregate([
        {
          $match: {
            lenderId: userId,
            lentAt: { $gte: range.from, $lt: range.toExclusive },
          },
        },
        { $group: { _id: '$categoryId', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 8 },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'category',
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $project: {
            _id: 0,
            categoryId: '$_id',
            name: {
              $ifNull: [{ $arrayElemAt: ['$category.name', 0] }, 'Uncategorised'],
            },
            count: 1,
          },
        },
      ]),
      ReminderLog.aggregate([
        {
          $match: {
            lenderId: userId,
            createdAt: { $gte: range.from, $lt: range.toExclusive },
          },
        },
        {
          $group: {
            _id: { channel: '$channel', status: '$status' },
            count: { $sum: 1 },
          },
        },
        { $project: { _id: 0, channel: '$_id.channel', status: '$_id.status', count: 1 } },
        { $sort: { channel: 1, status: 1 } },
      ]),
    ]);

  const snapshot = snapshotRows[0] ?? {};
  const lent = lentRows[0] ?? {};
  const returned = returnRows[0] ?? {};
  const knownReturns = numberOrZero(returned.total);
  const onTime = numberOrZero(returned.onTime);

  res.json({
    range: range.labels,
    snapshot: {
      activeLent: numberOrZero(snapshot.activeLent),
      activeBorrowed: numberOrZero(snapshot.activeBorrowed),
      overdueLent: numberOrZero(snapshot.overdueLent),
      overdueBorrowed: numberOrZero(snapshot.overdueBorrowed),
    },
    lent: {
      total: numberOrZero(lent.total),
      active: numberOrZero(lent.active),
      returned: numberOrZero(lent.returned),
      overdueNow: numberOrZero(lent.overdueNow),
    },
    returns: {
      total: knownReturns,
      onTime,
      late: numberOrZero(returned.late),
      averageDays: roundOne(returned.averageDays),
      // Returning a record without a return timestamp is excluded instead of being
      // counted as on time or late. This is an all-time count, not range-bound.
      missingTimestampClosed: numberOrZero(legacyRows[0]?.count),
    },
    rates: {
      onTime:
        knownReturns >= MIN_RATE_SAMPLE
          ? Math.round((onTime / knownReturns) * 1000) / 10
          : null,
      smallSample: knownReturns > 0 && knownReturns < MIN_RATE_SAMPLE,
      sampleSize: knownReturns,
    },
    volume,
    categories,
    reminders: {
      total: reminderGroups.reduce((total, entry) => total + entry.count, 0),
      byChannelStatus: reminderGroups,
    },
  });
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  // Spreadsheet tools execute a leading =, +, - or @ as a formula, so neutralise it.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function exportInsightsCsv(req, res) {
  const range = resolveRange(req.query);

  const loans = await Loan.find({
    lenderId: req.user._id,
    lentAt: { $gte: range.from, $lt: range.toExclusive },
  })
    .sort({ lentAt: 1 })
    .populate('categoryId', 'name')
    .lean();

  const header = [
    'Item',
    'Borrower',
    'Linked account',
    'Category',
    'Priority',
    'Lent at',
    'Due date',
    'Returned at',
    'Status',
    'Overdue now',
    'Returned late',
    'Return note',
  ];

  const rows = loans.map((loan) => {
    const dueEnd = loan.dueDate ? new Date(loan.dueDate).getTime() + DAY_MS - 1 : null;
    const returnedLate =
      loan.status === 'returned' &&
      loan.returnedAt &&
      dueEnd !== null &&
      new Date(loan.returnedAt).getTime() > dueEnd;

    return [
      loan.itemName,
      loan.borrower?.name ?? '',
      loan.borrowerId ? 'Yes' : 'No',
      loan.categoryId?.name ?? '',
      loan.priority,
      loan.lentAt ? new Date(loan.lentAt).toISOString() : '',
      loan.dueDate ? new Date(loan.dueDate).toISOString() : '',
      loan.returnedAt ? new Date(loan.returnedAt).toISOString() : '',
      loan.status,
      loan.status === 'active' && dueEnd !== null && Date.now() > dueEnd ? 'Yes' : 'No',
      returnedLate ? 'Yes' : 'No',
      loan.returnNote ?? '',
    ];
  });

  const body = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const filename = `lendloop-insights-${range.labels.from}-to-${range.labels.to}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`\uFEFF${body}`);
}
