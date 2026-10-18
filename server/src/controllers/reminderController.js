import Loan from '../models/Loan.js';
import ReminderLog from '../models/ReminderLog.js';
import { ApiError } from '../middleware/errorMiddleware.js';
import { REMINDER_CHANNELS, TEMPLATE_MODES } from '../utils/constants.js';
import { buildMailtoLink } from '../services/emailService.js';
import {
  buildSlots,
  renderMessage,
  runDueReminders,
  sentSlotKeys,
  sendManualReminder,
  usableChannels,
} from '../services/reminderService.js';

const LOG_POPULATE = [
  { path: 'loanId', select: 'itemName dueDate priority status borrower' },
  { path: 'templateId', select: 'name scope' },
];

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

export async function listReminderLogs(req, res) {
  const filter = { lenderId: req.user._id };
  if (req.query.channel && REMINDER_CHANNELS.includes(req.query.channel)) {
    filter.channel = req.query.channel;
  }
  if (req.query.mode === 'manual' || req.query.mode === 'automatic') filter.mode = req.query.mode;
  if (req.query.status) filter.status = req.query.status;

  const reminders = await ReminderLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate(LOG_POPULATE);

  res.json({ reminders });
}

// Lets a lender (or a test) fire the scheduler on demand instead of waiting for cron.
// Scoped to the caller's own loans so it can never message someone else's borrower.
export async function runRemindersNow(req, res) {
  const summary = await runDueReminders({ lenderId: req.user._id });

  res.json({ summary });
}
