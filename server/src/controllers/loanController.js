import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Item from '../models/Item.js';
import Loan from '../models/Loan.js';
import LoanHistory from '../models/LoanHistory.js';
import { ApiError } from '../middleware/errorMiddleware.js';
import {
  PRIORITIES,
  REMINDER_CHANNELS,
  REMINDER_FREQUENCIES,
  TEMPLATE_MODES,
  isValidEmail,
} from '../utils/constants.js';
import { visibleTo } from './categoryController.js';
import {
  changeCategory,
  changeDeadline,
  changePriority,
  recordHistory,
} from '../services/deadlineService.js';
import {
  channelReadiness,
  priorityDefaults,
  refreshSchedule,
  usableChannels,
} from '../services/reminderService.js';

export const LOAN_POPULATE = [
  { path: 'itemId', select: 'title imageUrl condition status' },
  { path: 'categoryId', select: 'name defaultPriority' },
  { path: 'lenderId', select: 'name email' },
  { path: 'borrowerId', select: 'name email phone' },
];

const HISTORY_POPULATE = [{ path: 'actorId', select: 'name email' }];

function isLender(loan, user) {
  const lenderId = loan.lenderId?._id ?? loan.lenderId;
  return Boolean(lenderId) && lenderId.equals(user._id);
}

function isBorrower(loan, user) {
  const borrowerId = loan.borrowerId?._id ?? loan.borrowerId;
  return Boolean(borrowerId) && borrowerId.equals(user._id);
}

export function decorate(loan) {
  const plain = loan.toObject({ virtuals: true });
  plain.isOverdue = loan.status === 'active' && loan.dueDate.getTime() < Date.now();
  plain.deliveryChannels = usableChannels(loan);
  plain.channelReadiness = channelReadiness(loan);
  return plain;
}

export async function createLoan(req, res) {
  const {
    itemName,
    description = '',
    categoryId,
    itemId = null,
    borrower = {},
    lentAt,
    dueDate,
    priority,
    notes = '',
    reminders = {},
  } = req.body;

  if (!itemName || !String(itemName).trim()) {
    throw new ApiError(400, 'Item name is required');
  }
  if (!borrower.name || !String(borrower.name).trim()) {
    throw new ApiError(400, 'Borrower name is required');
  }
  if (!categoryId) throw new ApiError(400, 'Category is required');

  const category = await Category.findOne({ _id: categoryId, ...visibleTo(req.user._id) });
  if (!category) throw new ApiError(404, 'Category not found');

  const lent = lentAt ? new Date(lentAt) : new Date();
  if (Number.isNaN(lent.getTime())) throw new ApiError(400, 'Lending date is not a valid date');

  const due = new Date(dueDate);
  if (!dueDate || Number.isNaN(due.getTime())) {
    throw new ApiError(400, 'Return deadline is not a valid date');
  }
  if (due.getTime() <= lent.getTime()) {
    throw new ApiError(400, 'Return deadline must fall after the lending date');
  }

  // A backdated entry is legitimate (recording something lent last week), it just starts
  // life overdue; the reminder engine will not retroactively fire stale slots.
  const channels = Array.isArray(reminders.channels)
    ? [...new Set(reminders.channels)].filter((channel) => REMINDER_CHANNELS.includes(channel))
    : [];
  const frequency = REMINDER_FREQUENCIES.includes(reminders.frequency)
    ? reminders.frequency
    : 'daily';
  const templateMode = TEMPLATE_MODES.includes(reminders.templateMode)
    ? reminders.templateMode
    : 'priority';

  const email = String(borrower.email ?? '').trim().toLowerCase();
  const phone = String(borrower.phone ?? '').trim();
  // Contact details are not required to record an entry — a lender can add them later via
  // the settings form. Only a supplied-but-malformed email is rejected; a missing address
  // or number just leaves that channel unusable, which the post-create warning reports.
  if (email && !isValidEmail(email)) {
    throw new ApiError(400, 'Borrower email is not a valid address');
  }

  const useCategoryPriority = !priority || priority === 'category-default';
  const resolvedPriority = useCategoryPriority ? category.defaultPriority : priority;
  if (!PRIORITIES.includes(resolvedPriority)) {
    throw new ApiError(400, `Priority must be one of: ${PRIORITIES.join(', ')}`);
  }

  let linkedItem = null;
  if (itemId) {
    if (!mongoose.isValidObjectId(itemId)) throw new ApiError(400, 'Malformed item id');
    linkedItem = await Item.findById(itemId);
    if (!linkedItem || linkedItem.status === 'archived') throw new ApiError(404, 'Item not found');
    if (!linkedItem.ownerId.equals(req.user._id)) {
      throw new ApiError(403, 'You can only lend out your own listings');
    }
    if (linkedItem.status !== 'available') {
      throw new ApiError(409, 'That item is not available to lend right now');
    }
  }

  const consent = {
    email: borrower.consent?.email === true,
    whatsapp: borrower.consent?.whatsapp === true,
    note: String(borrower.consent?.note ?? '').trim(),
    recordedAt:
      borrower.consent?.email === true || borrower.consent?.whatsapp === true ? new Date() : null,
  };

  const session = await mongoose.startSession();
  let loan;

  try {
    await session.withTransaction(async () => {
      [loan] = await Loan.create(
        [
          {
            origin: 'manual',
            itemId: linkedItem ? linkedItem._id : null,
            itemName: String(itemName).trim(),
            description: String(description).trim(),
            categoryId: category._id,
            lenderId: req.user._id,
            borrowerId: null,
            borrower: {
              name: String(borrower.name).trim(),
              email,
              phone,
              consent,
            },
            lentAt: lent,
            dueDate: due,
            status: 'active',
            priority: resolvedPriority,
            prioritySource: useCategoryPriority ? 'category' : 'manual',
            notes: String(notes).trim(),
            reminders: {
              enabled: reminders.enabled !== false,
              channels: channels.length ? channels : priorityDefaults(resolvedPriority).channels,
              frequency,
              templateMode,
              customMessage: String(reminders.customMessage ?? '').trim(),
              customOffsetsDays: Array.isArray(reminders.customOffsetsDays)
                ? reminders.customOffsetsDays.filter((value) => Number.isFinite(value)).slice(0, 10)
                : [],
              overdueIntervalHours: Number(reminders.overdueIntervalHours) || 48,
              maxOverdueReminders:
                reminders.maxOverdueReminders === undefined
                  ? 5
                  : Math.min(50, Math.max(0, Number(reminders.maxOverdueReminders) || 0)),
            },
          },
        ],
        { session },
      );

      if (linkedItem) {
        linkedItem.status = 'borrowed';
        await linkedItem.save({ session });
      }

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
          reason: linkedItem ? 'Lending entry created from a listing' : 'Lending entry created manually',
        },
        { session },
      );
    });
  } finally {
    session.endSession();
  }

  const created = await Loan.findById(loan._id).populate(LOAN_POPULATE);
  const warnings = [];
  if (created.reminders.enabled && created.reminders.frequency !== 'manual' && !usableChannels(created).length) {
    warnings.push(
      'Automatic reminders are armed but no channel is usable yet — record the borrower consent and contact details',
    );
  }

  res.status(201).json({ loan: decorate(created), warnings });
}

export async function getLoans(req, res) {
  const { role, status, priority, q, overdue, sort } = req.query;

  const filter = {};
  if (role === 'lent') {
    filter.lenderId = req.user._id;
  } else if (role === 'borrowed') {
    filter.borrowerId = req.user._id;
  } else {
    filter.$or = [{ lenderId: req.user._id }, { borrowerId: req.user._id }];
  }

  if (status) filter.status = status;
  if (priority && PRIORITIES.includes(priority)) filter.priority = priority;
  if (overdue === 'true') {
    filter.status = 'active';
    filter.dueDate = { $lt: new Date() };
  }
  if (q) {
    const pattern = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$and = [{ $or: [{ itemName: pattern }, { 'borrower.name': pattern }, { notes: pattern }] }];
  }

  const sortMap = {
    due: { dueDate: 1 },
    newest: { createdAt: -1 },
  };

  const loans = await Loan.find(filter)
    .sort(sortMap[sort] ?? { createdAt: -1 })
    .populate(LOAN_POPULATE);

  res.json({ loans: loans.map(decorate) });
}

export async function getLoanById(req, res) {
  const loan = await Loan.findById(req.params.id).populate(LOAN_POPULATE);
  if (!loan) throw new ApiError(404, 'Loan not found');
  if (!isLender(loan, req.user) && !isBorrower(loan, req.user)) {
    throw new ApiError(403, 'You do not have access to this loan');
  }

  res.json({ loan: decorate(loan) });
}

function assertLender(loan, user) {
  if (!isLender(loan, user)) {
    throw new ApiError(403, 'Only the lender can change this entry');
  }
}

async function findLoanForLender(req) {
  const loan = await Loan.findById(req.params.id).populate(LOAN_POPULATE);
  if (!loan) throw new ApiError(404, 'Loan not found');
  assertLender(loan, req.user);
  return loan;
}

export async function updateLoanDeadline(req, res) {
  const loan = await findLoanForLender(req);
  if (loan.status === 'returned') {
    throw new ApiError(400, 'A returned entry can no longer be rescheduled');
  }

  const { dueDate, reason = '' } = req.body;
  if (!dueDate) throw new ApiError(400, 'A new deadline is required');

  const { direction, from, to } = await changeDeadline(
    loan,
    { dueDate, reason: String(reason).trim(), actorId: req.user._id },
  );

  const updated = await Loan.findById(loan._id).populate(LOAN_POPULATE);
  res.json({ loan: decorate(updated), direction, from, to });
}

export async function updateLoanPriority(req, res) {
  const loan = await findLoanForLender(req);
  const { priority, direction, reason = '' } = req.body;

  if (!priority && !direction) {
    throw new ApiError(400, 'Provide a priority, or a direction of up, down, or reset');
  }

  const result = await changePriority(loan, {
    priority,
    direction,
    reason: String(reason).trim(),
    actorId: req.user._id,
  });

  const updated = await Loan.findById(loan._id).populate(LOAN_POPULATE);
  res.json({ loan: decorate(updated), from: result.from, to: result.to, source: result.source });
}

export async function updateLoanCategory(req, res) {
  const loan = await findLoanForLender(req);
  const { categoryId, reason = '' } = req.body;
  if (!categoryId) throw new ApiError(400, 'A category is required');

  const result = await changeCategory(loan, {
    categoryId,
    reason: String(reason).trim(),
    actorId: req.user._id,
  });

  const updated = await Loan.findById(loan._id).populate(LOAN_POPULATE);
  res.json({ loan: decorate(updated), priorityChanged: result.priorityChanged });
}

// nextDueAt, lastSentAt and autoSentCount belong to the scheduler, not the lender, and
// the cursor is refreshed after this diff is captured — recording it would freeze a
// value into the audit trail that the save itself immediately invalidated.
const REMINDER_SETTINGS_FIELDS = [
  'enabled',
  'channels',
  'frequency',
  'templateMode',
  'customMessage',
  'customOffsetsDays',
  'overdueIntervalHours',
  'maxOverdueReminders',
];

function reminderSettings(reminders) {
  const source = reminders.toObject();
  return Object.fromEntries(REMINDER_SETTINGS_FIELDS.map((key) => [key, source[key]]));
}

export async function updateLoanSettings(req, res) {
  const loan = await findLoanForLender(req);
  const { reminders, borrower, notes, description } = req.body;
  const changes = [];

  if (notes !== undefined && String(notes).trim() !== loan.notes) {
    changes.push({ kind: 'notes', field: 'notes', from: loan.notes, to: String(notes).trim() });
    loan.notes = String(notes).trim();
  }

  if (description !== undefined && String(description).trim() !== loan.description) {
    changes.push({
      kind: 'notes',
      field: 'description',
      from: loan.description,
      to: String(description).trim(),
    });
    loan.description = String(description).trim();
  }

  if (borrower) {
    const before = {
      name: loan.borrower.name,
      email: loan.borrower.email,
      phone: loan.borrower.phone,
      consentEmail: loan.borrower.consent.email,
      consentWhatsApp: loan.borrower.consent.whatsapp,
    };

    if (borrower.name !== undefined) loan.borrower.name = String(borrower.name).trim();
    if (borrower.email !== undefined) {
      const email = String(borrower.email).trim().toLowerCase();
      if (email && !isValidEmail(email)) throw new ApiError(400, 'Borrower email is not a valid address');
      loan.borrower.email = email;
    }
    if (borrower.phone !== undefined) loan.borrower.phone = String(borrower.phone).trim();

    if (borrower.consent) {
      const consentChanged =
        (borrower.consent.email !== undefined &&
          Boolean(borrower.consent.email) !== loan.borrower.consent.email) ||
        (borrower.consent.whatsapp !== undefined &&
          Boolean(borrower.consent.whatsapp) !== loan.borrower.consent.whatsapp);

      if (borrower.consent.email !== undefined) {
        loan.borrower.consent.email = Boolean(borrower.consent.email);
      }
      if (borrower.consent.whatsapp !== undefined) {
        loan.borrower.consent.whatsapp = Boolean(borrower.consent.whatsapp);
      }
      if (borrower.consent.note !== undefined) {
        loan.borrower.consent.note = String(borrower.consent.note).trim();
      }
      if (consentChanged) {
        loan.borrower.consent.recordedAt = new Date();
      }
    }

    const after = {
      name: loan.borrower.name,
      email: loan.borrower.email,
      phone: loan.borrower.phone,
      consentEmail: loan.borrower.consent.email,
      consentWhatsApp: loan.borrower.consent.whatsapp,
    };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ kind: 'borrower', field: 'borrower', from: before, to: after });
    }
  }

  if (reminders) {
    const before = reminderSettings(loan.reminders);

    if (reminders.enabled !== undefined) loan.reminders.enabled = Boolean(reminders.enabled);
    if (Array.isArray(reminders.channels)) {
      loan.reminders.channels = [...new Set(reminders.channels)].filter((channel) =>
        REMINDER_CHANNELS.includes(channel),
      );
    }
    if (reminders.frequency !== undefined) {
      if (!REMINDER_FREQUENCIES.includes(reminders.frequency)) {
        throw new ApiError(400, `Frequency must be one of: ${REMINDER_FREQUENCIES.join(', ')}`);
      }
      loan.reminders.frequency = reminders.frequency;
    }
    if (reminders.templateMode !== undefined) {
      if (!TEMPLATE_MODES.includes(reminders.templateMode)) {
        throw new ApiError(400, `Template mode must be one of: ${TEMPLATE_MODES.join(', ')}`);
      }
      loan.reminders.templateMode = reminders.templateMode;
    }
    if (reminders.customMessage !== undefined) {
      loan.reminders.customMessage = String(reminders.customMessage).trim();
    }
    if (Array.isArray(reminders.customOffsetsDays)) {
      loan.reminders.customOffsetsDays = reminders.customOffsetsDays
        .filter((value) => Number.isFinite(value))
        .slice(0, 10);
    }
    if (reminders.overdueIntervalHours !== undefined) {
      const hours = Number(reminders.overdueIntervalHours);
      if (!Number.isFinite(hours) || hours < 1) {
        throw new ApiError(400, 'Overdue interval must be at least one hour');
      }
      loan.reminders.overdueIntervalHours = Math.round(hours);
    }
    if (reminders.maxOverdueReminders !== undefined) {
      const cap = Number(reminders.maxOverdueReminders);
      if (!Number.isFinite(cap) || cap < 0 || cap > 50) {
        throw new ApiError(400, 'Overdue reminder cap must be between 0 and 50');
      }
      loan.reminders.maxOverdueReminders = Math.round(cap);
    }

    const after = reminderSettings(loan.reminders);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ kind: 'reminders', field: 'reminders', from: before, to: after });
    }
  }

  await refreshSchedule(loan);
  await loan.save();

  for (const change of changes) {
    await recordHistory({ loan, actorId: req.user._id, ...change });
  }

  const updated = await Loan.findById(loan._id).populate(LOAN_POPULATE);
  const warnings = [];
  if (updated.reminders.enabled && updated.reminders.frequency !== 'manual' && !usableChannels(updated).length) {
    warnings.push('Automatic reminders are on but no channel is usable — consent or contact details are missing');
  }

  res.json({ loan: decorate(updated), changes: changes.length, warnings });
}

// Marking a return writes to both the loan and the item, so it is transactional:
// a loan closed without freeing the item would strand it as permanently borrowed.
export async function returnLoan(req, res) {
  const session = await mongoose.startSession();
  let returnedLoan;

  try {
    await session.withTransaction(async () => {
      const loan = await Loan.findById(req.params.id).session(session);
      if (!loan) throw new ApiError(404, 'Loan not found');
      if (!loan.lenderId.equals(req.user._id)) {
        throw new ApiError(403, 'Only the lender can confirm an item was returned');
      }
      if (loan.status === 'returned') {
        throw new ApiError(400, 'This loan has already been marked as returned');
      }

      loan.status = 'returned';
      loan.returnedAt = new Date();
      await refreshSchedule(loan, { session });
      await loan.save({ session });

      if (loan.itemId) {
        const item = await Item.findById(loan.itemId).session(session);
        if (item && item.status === 'borrowed') {
          item.status = 'available';
          await item.save({ session });
        }
      }

      await recordHistory(
        {
          loan,
          actorId: req.user._id,
          kind: 'status',
          field: 'status',
          from: 'active',
          to: 'returned',
          reason: String(req.body?.reason ?? '').trim() || 'Return confirmed by the lender',
        },
        { session },
      );

      returnedLoan = loan;
    });
  } finally {
    session.endSession();
  }

  const loan = await Loan.findById(returnedLoan._id).populate(LOAN_POPULATE);
  res.json({ loan: decorate(loan) });
}

export async function getLoanHistory(req, res) {
  const loan = await Loan.findById(req.params.id);
  if (!loan) throw new ApiError(404, 'Loan not found');
  if (!isLender(loan, req.user) && !isBorrower(loan, req.user)) {
    throw new ApiError(403, 'You do not have access to this loan');
  }

  const history = await LoanHistory.find({ loanId: loan._id })
    .sort({ createdAt: -1 })
    .populate(HISTORY_POPULATE);

  res.json({ history });
}
