import Loan from '../models/Loan.js';
import ReminderLog from '../models/ReminderLog.js';
import { ApiError } from '../middleware/errorMiddleware.js';
import { REMINDER_CHANNELS, TEMPLATE_MODES } from '../utils/constants.js';
import { buildMailtoLink } from '../services/emailService.js';
import {
  buildSlots,
  channelReadiness,
  renderMessage,
  runDueReminders,
  sentSlotKeys,
  sendManualReminder,
  usableChannels,
} from '../services/reminderService.js';

const DAY_MS = 86_400_000;

const LOG_POPULATE = [
  { path: 'loanId', select: 'itemName dueDate priority status borrower' },
  { path: 'templateId', select: 'name scope' },
];

const OVERVIEW_LOAN_SELECT =
  'itemName dueDate priority borrower categoryId origin reminders status';

function upcomingShape(loan) {
  return {
    _id: loan._id,
    itemName: loan.itemName,
    borrowerName: loan.borrower?.name ?? 'Unknown borrower',
    dueDate: loan.dueDate,
    nextDueAt: loan.reminders?.nextDueAt ?? null,
    priority: loan.priority,
    frequency: loan.reminders?.frequency,
    templateMode: loan.reminders?.templateMode,
    channels: usableChannels(loan),
    readiness: channelReadiness(loan),
  };
}

function missingChannelLabels(loan) {
  const readiness = channelReadiness(loan);
  const selected = readiness.filter((entry) => entry.selected);
  if (!selected.length) return ['No reminder channel selected'];

  return selected.flatMap((entry) => {
    const labels = [];
    const label = entry.channel === 'email' ? 'Email' : 'WhatsApp';
    if (!entry.consented) labels.push(`${label} consent not recorded`);
    if (!entry.hasContact) {
      labels.push(label === 'Email' ? 'No email address' : 'No WhatsApp number');
    }
    return labels;
  });
}

async function findLoanForLender(req) {
  const loan = await Loan.findById(req.params.id).populate(['categoryId', 'lenderId']);
  if (!loan) throw new ApiError(404, 'Loan not found');
  if (!loan.lenderId._id.equals(req.user._id)) {
    throw new ApiError(403, 'Only the lender can manage reminders for this entry');
  }
  return loan;
}

function assertActive(loan) {
  if (loan.status !== 'active') {
    throw new ApiError(400, 'Reminders only apply to entries that are still out');
  }
}

// Renders exactly what would be sent, without writing a log entry, so the modal can show
// a live preview and offer copy / mailto / wa.me links before anything is dispatched.
export async function previewReminder(req, res) {
  const loan = await findLoanForLender(req);
  const mode = req.query.mode ?? req.body?.templateMode;
  if (mode && !TEMPLATE_MODES.includes(mode)) {
    throw new ApiError(400, `Template mode must be one of: ${TEMPLATE_MODES.join(', ')}`);
  }

  const rendered = await renderMessage(loan, {
    mode,
    message: req.query.message ?? req.body?.message,
    templateId: req.query.templateId ?? req.body?.templateId,
  });

  res.json({
    preview: rendered,
    channels: usableChannels(loan),
    readiness: loan.reminders.enabled,
    links: {
      email: buildMailtoLink(loan.borrower.email, rendered.subject, rendered.body),
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${rendered.subject}\n\n${rendered.body}`)}`,
    },
  });
}

export async function getReminderSchedule(req, res) {
  const loan = await findLoanForLender(req);
  const sent = await sentSlotKeys(loan._id);

  const slots = buildSlots(loan).map((slot) => ({
    slot: slot.slot,
    kind: slot.kind,
    at: slot.at,
    sent: sent.has(slot.key),
  }));

  res.json({
    slots,
    nextDueAt: loan.reminders.nextDueAt,
    channels: usableChannels(loan),
    // A returned loan keeps its reminder preferences for the record, but nothing is armed.
    armed: Boolean(
      loan.status === 'active' && loan.reminders.enabled && loan.reminders.frequency !== 'manual',
    ),
  });
}

export async function sendReminder(req, res) {
  const loan = await findLoanForLender(req);
  assertActive(loan);

  const requested = Array.isArray(req.body?.channels) && req.body.channels.length
    ? req.body.channels
    : loan.reminders.channels;

  const channels = [...new Set(requested)].filter((channel) => REMINDER_CHANNELS.includes(channel));
  if (!channels.length) {
    throw new ApiError(400, 'Choose at least one delivery channel');
  }

  const mode = req.body?.templateMode ?? loan.reminders.templateMode;
  if (mode && !TEMPLATE_MODES.includes(mode)) {
    throw new ApiError(400, `Template mode must be one of: ${TEMPLATE_MODES.join(', ')}`);
  }

  const result = await sendManualReminder(loan, {
    channels,
    mode,
    message: req.body?.message,
    templateId: req.body?.templateId,
    actorId: req.user._id,
  });

  if (!result.logs.length) {
    throw new ApiError(400, result.warnings[0] || 'No reminder could be sent for those channels');
  }

  res.status(201).json({
    message: result.rendered,
    logs: result.logs,
    warnings: result.warnings,
    links: {
      email: buildMailtoLink(loan.borrower.email, result.rendered.subject, result.rendered.body),
      whatsapp: result.links?.whatsapp || '',
    },
  });
}

export async function getLoanReminders(req, res) {
  const loan = await findLoanForLender(req);
  const logs = await ReminderLog.find({ loanId: loan._id })
    .sort({ createdAt: -1 })
    .populate(LOG_POPULATE);

  res.json({ reminders: logs });
}

export async function getReminderOverview(req, res) {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * DAY_MS);
  const lenderId = req.user._id;

  const [activeLoans, recent, failedLogs, failedCount, logGroups] = await Promise.all([
    Loan.find({ lenderId, status: 'active' })
      .select(OVERVIEW_LOAN_SELECT)
      .populate('categoryId', 'name')
      .lean(),
    ReminderLog.find({ lenderId })
      .sort({ createdAt: -1 })
      .limit(8)
      .populate(LOG_POPULATE),
    ReminderLog.find({ lenderId, status: 'failed' })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate(LOG_POPULATE),
    ReminderLog.countDocuments({ lenderId, status: 'failed' }),
    ReminderLog.aggregate([
      { $match: { lenderId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const withChannels = activeLoans.map((loan) => ({
    loan,
    usable: usableChannels(loan),
  }));

  const armedLoans = withChannels.filter(
    ({ loan, usable }) =>
      loan.reminders?.enabled &&
      loan.reminders.frequency !== 'manual' &&
      usable.length > 0,
  );

  const scheduled = armedLoans
    .filter(({ loan }) => loan.reminders?.nextDueAt)
    .map(({ loan }) => loan)
    .sort(
      (a, b) =>
        new Date(a.reminders.nextDueAt).getTime() - new Date(b.reminders.nextDueAt).getTime(),
    );

  const upcoming = scheduled.slice(0, 25).map(upcomingShape);

  const blockedLoans = withChannels.filter(
    ({ loan, usable }) =>
      loan.reminders?.enabled &&
      loan.reminders.frequency !== 'manual' &&
      usable.length === 0,
  );

  const blocked = blockedLoans.slice(0, 25).map(({ loan }) => ({
    ...upcomingShape(loan),
    missing: missingChannelLabels(loan),
  }));

  const statusCounts = { sent: 0, preview: 0, link: 0, failed: 0 };
  for (const entry of logGroups) {
    if (Object.hasOwn(statusCounts, entry._id)) statusCounts[entry._id] = entry.count;
  }

  res.json({
    summary: {
      activeLoans: activeLoans.length,
      armed: armedLoans.length,
      scheduled: scheduled.length,
      dueSoon: scheduled.filter(
        ({ reminders }) => new Date(reminders.nextDueAt).getTime() <= weekAhead.getTime(),
      ).length,
      blocked: blockedLoans.length,
      manual: withChannels.filter(
        ({ loan }) => loan.reminders?.enabled && loan.reminders.frequency === 'manual',
      ).length,
      off: withChannels.filter(({ loan }) => !loan.reminders?.enabled).length,
      failed: failedCount,
      logged: Object.values(statusCounts).reduce((total, count) => total + count, 0),
      statusCounts,
    },
    upcoming,
    blocked,
    failed: failedLogs,
    recent,
  });
}

export async function listReminderLogs(req, res) {
  const filter = { lenderId: req.user._id };
  if (req.query.channel && REMINDER_CHANNELS.includes(req.query.channel)) {
    filter.channel = req.query.channel;
  }
  if (req.query.mode === 'manual' || req.query.mode === 'automatic') filter.mode = req.query.mode;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.loanId && /^[a-f\d]{24}$/i.test(String(req.query.loanId))) {
    filter.loanId = req.query.loanId;
  }

  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  if (from || to) {
    filter.createdAt = {};
    if (from && !Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
    if (to && !Number.isNaN(to.getTime())) {
      // A date-only upper bound includes the whole day.
      const end = new Date(to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) end.setUTCHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
    if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);

  const reminders = await ReminderLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate(LOG_POPULATE);

  res.json({ reminders, limit });
}

// Retry is deliberately limited to attempts that did not produce a submitted message:
// a failed send, or a WhatsApp link that was generated but never confirmed. Retrying a
// "sent" email would send a duplicate, so it is rejected.
export async function retryReminder(req, res) {
  const log = await ReminderLog.findOne({ _id: req.params.id, lenderId: req.user._id }).populate({
    path: 'loanId',
    populate: [{ path: 'categoryId' }, { path: 'lenderId' }],
  });
  if (!log) throw new ApiError(404, 'Reminder log not found');

  if (!['failed', 'link'].includes(log.status)) {
    throw new ApiError(
      400,
      'Only a failed reminder or a generated WhatsApp link can be retried. Submitted messages are never resent automatically',
    );
  }

  const loan = log.loanId;
  if (!loan) throw new ApiError(404, 'The lending entry for this reminder no longer exists');
  if (!loan.lenderId?._id?.equals(req.user._id)) {
    throw new ApiError(403, 'Only the lender can retry this reminder');
  }
  if (loan.status !== 'active') {
    throw new ApiError(400, 'This entry is closed, so reminders can no longer be sent');
  }

  const result = await sendManualReminder(loan, {
    channels: [log.channel],
    actorId: req.user._id,
  });

  if (!result.logs.length) {
    throw new ApiError(400, result.warnings[0] || 'This reminder could not be retried');
  }

  res.status(201).json({
    message: result.rendered,
    logs: result.logs,
    warnings: result.warnings,
    links: {
      email: buildMailtoLink(loan.borrower.email, result.rendered.subject, result.rendered.body),
      whatsapp: result.links?.whatsapp || '',
    },
    retryOf: log._id,
  });
}

// Lets a lender (or a test) fire the scheduler on demand instead of waiting for cron.
// Scoped to the caller's own loans so it can never message someone else's borrower.
export async function runRemindersNow(req, res) {
  const summary = await runDueReminders({ lenderId: req.user._id });

  res.json({ summary });
}
