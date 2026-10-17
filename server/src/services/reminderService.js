import Loan from '../models/Loan.js';
import ReminderLog from '../models/ReminderLog.js';
import ReminderTemplate from '../models/ReminderTemplate.js';
import { isValidEmail, normalisePhone } from '../utils/constants.js';
import { buildPlaceholderValues, renderTemplate } from '../utils/renderTemplate.js';
import { buildMailtoLink, sendEmail } from './emailService.js';
import { sendWhatsApp } from './whatsappService.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// A slot missed by more than this is skipped rather than sent late, so an offline
// server or a backdated entry cannot dump every stale reminder on a borrower at once.
export const CATCH_UP_WINDOW_MS = 24 * HOUR_MS;

// Proposed defaults from the design note: priority drives how early and how often
// LendLoop nudges, and the lender can override every part of it per loan.
export const PRIORITY_DEFAULTS = {
  low: { offsetsDays: [-1], channels: ['email'] },
  medium: { offsetsDays: [-2, 0], channels: ['email'] },
  high: { offsetsDays: [-3, -1, 0], channels: ['email', 'whatsapp'] },
};

const FALLBACK_SUBJECT = 'Reminder: {itemName} is {duePhrase}';

const FALLBACK_BODY =
  'Hi {borrowerName}, this is a reminder that {itemName} is {duePhrase} ({dueDate}). ' +
  'Please arrange its return by the deadline. Thank you!\n\n{lenderName}';

export function priorityDefaults(priority) {
  return PRIORITY_DEFAULTS[priority] ?? PRIORITY_DEFAULTS.medium;
}

export function channelOffsets(loan) {
  const { frequency, customOffsetsDays } = loan.reminders ?? {};
  if (frequency === 'custom' && Array.isArray(customOffsetsDays) && customOffsetsDays.length) {
    return [...customOffsetsDays].sort((a, b) => a - b);
  }
  return priorityDefaults(loan.priority).offsetsDays;
}

// Slot keys carry the resolved due date, so postponing a deadline arms a fresh set of
// reminders for the new date while a given date+slot can never be sent twice.
export function buildSlots(loan) {
  const due = new Date(loan.dueDate).getTime();
  const dueStamp = new Date(due).toISOString();
  const reminders = loan.reminders ?? {};

  const slots = channelOffsets(loan).map((offset) => ({
    key: `pre:${offset}:${dueStamp}`,
    slot: offset === 0 ? 'due-date' : `${offset}d`,
    kind: 'pre',
    at: new Date(due + offset * DAY_MS),
  }));

  const interval = Math.max(1, reminders.overdueIntervalHours ?? 48) * HOUR_MS;
  const cap = Math.max(0, reminders.maxOverdueReminders ?? 5);
  for (let index = 1; index <= cap; index += 1) {
    slots.push({
      key: `overdue:${index}:${dueStamp}`,
      slot: `overdue-${index}`,
      kind: 'overdue',
      at: new Date(due + index * interval),
    });
  }

  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

// A channel is only usable when the lender picked it, the borrower consented to it,
// and there is contact detail to reach them on. Priority never forces a channel.
export function usableChannels(loan) {
  const consent = loan.borrower?.consent ?? {};
  const email = loan.borrower?.email ?? '';
  const phone = normalisePhone(loan.borrower?.phone ?? '');

  return (loan.reminders?.channels ?? []).filter((channel) => {
    if (channel === 'email') return consent.email === true && isValidEmail(email);
    if (channel === 'whatsapp') return consent.whatsapp === true && phone.length >= 8;
    return false;
  });
}

export function channelReadiness(loan) {
  const consent = loan.borrower?.consent ?? {};
  return [
    {
      channel: 'email',
      selected: (loan.reminders?.channels ?? []).includes('email'),
      consented: consent.email === true,
      hasContact: isValidEmail(loan.borrower?.email ?? ''),
    },
    {
      channel: 'whatsapp',
      selected: (loan.reminders?.channels ?? []).includes('whatsapp'),
      consented: consent.whatsapp === true,
      hasContact: normalisePhone(loan.borrower?.phone ?? '').length >= 8,
    },
  ];
}

export async function sentSlotKeys(loanId, { session } = {}) {
  const logs = await ReminderLog.find(
    { loanId, dedupeKey: { $type: 'string' } },
    { dedupeKey: 1 },
    session ? { session } : undefined,
  ).lean();

  // Dedupe keys are stored per channel (`<slotKey>:<channel>`) so the unique index can
  // block a duplicate send of one slot on one channel. The scheduler cursor advances per
  // slot, though, so collapse each key back to its slot by dropping the trailing channel.
  return new Set(
    logs.map((log) => {
      const cut = log.dedupeKey.lastIndexOf(':');
      return cut === -1 ? log.dedupeKey : log.dedupeKey.slice(0, cut);
    }),
  );
}

export async function computeNextDueAt(loan, { session, now = new Date() } = {}) {
  if (loan.status !== 'active') return null;
  if (!loan.reminders?.enabled || loan.reminders?.frequency === 'manual') return null;
  if (!usableChannels(loan).length) return null;

  const sent = await sentSlotKeys(loan._id, { session });
  const floor = now.getTime() - CATCH_UP_WINDOW_MS;
  const pending = buildSlots(loan).filter(
    (slot) => !sent.has(slot.key) && slot.at.getTime() >= floor,
  );

  return pending.length ? pending[0].at : null;
}

// Callers must save the loan afterwards; kept separate so it can run inside a transaction.
export async function refreshSchedule(loan, { session, now = new Date() } = {}) {
  loan.reminders.nextDueAt = await computeNextDueAt(loan, { session, now });
  return loan.reminders.nextDueAt;
}

async function findTemplate(filter, lenderId) {
  return (
    (await ReminderTemplate.findOne({ ...filter, ownerId: lenderId })) ||
    (await ReminderTemplate.findOne({ ...filter, ownerId: null }))
  );
}

export async function resolveTemplate(loan, { mode, templateId } = {}) {
  const lenderId = loan.lenderId?._id ?? loan.lenderId;

  if (templateId) {
    const chosen = await ReminderTemplate.findOne({ _id: templateId, ownerId: { $in: [lenderId, null] } });
    if (chosen) return chosen;
  }

  const templateMode = mode ?? loan.reminders?.templateMode ?? 'priority';

  if (templateMode === 'category' && loan.categoryId) {
    const categoryId = loan.categoryId?._id ?? loan.categoryId;
    const categoryTemplate = await findTemplate({ scope: 'category', categoryId }, lenderId);
    if (categoryTemplate) return categoryTemplate;
  }

  if (templateMode !== 'custom') {
    const priorityTemplate = await findTemplate(
      { scope: 'priority', priority: loan.priority },
      lenderId,
    );
    if (priorityTemplate) return priorityTemplate;
  }

  return findTemplate({ scope: 'general' }, lenderId);
}

export async function renderMessage(loan, { mode, message, templateId } = {}) {
  const values = buildPlaceholderValues(loan);
  const templateMode = mode ?? loan.reminders?.templateMode ?? 'priority';

  if (templateMode === 'custom') {
    const custom = message ?? loan.reminders?.customMessage ?? '';
    return {
      subject: renderTemplate(FALLBACK_SUBJECT, values),
      body: renderTemplate(custom || FALLBACK_BODY, values),
      templateId: null,
      templateName: 'Custom message',
      templateMode: 'custom',
    };
  }

  const template = await resolveTemplate(loan, { mode: templateMode, templateId });
  if (!template) {
    return {
      subject: renderTemplate(FALLBACK_SUBJECT, values),
      body: renderTemplate(FALLBACK_BODY, values),
      templateId: null,
      templateName: 'Built-in default',
      templateMode,
    };
  }

  return {
    subject: renderTemplate(template.subject, values),
    body: renderTemplate(template.body, values),
    templateId: template._id,
    templateName: template.name,
    templateMode,
  };
}

async function writeLog(entry, { session } = {}) {
  try {
    const [log] = await ReminderLog.create([entry], session ? { session } : undefined);
    return log;
  } catch (error) {
    // A concurrent scheduler run already recorded this slot: that is the dedupe working.
    if (error?.code === 11000) return null;
    throw error;
  }
}

export async function dispatchReminder({
  loan,
  channel,
  message,
  mode = 'manual',
  dedupeKey = null,
  scheduleSlot = '',
  triggeredBy = null,
  session = null,
}) {
  const lenderId = loan.lenderId?._id ?? loan.lenderId;
  const outcome =
    channel === 'email'
      ? await sendEmail({ to: loan.borrower.email, subject: message.subject, text: message.body })
      : await sendWhatsApp({
          phone: loan.borrower.phone,
          message: `${message.subject}\n\n${message.body}`,
        });

  return writeLog(
    {
      loanId: loan._id,
      lenderId,
      channel,
      mode,
      dedupeKey,
      scheduleSlot,
      templateId: message.templateId ?? null,
      templateName: message.templateName ?? '',
      recipient: channel === 'email' ? loan.borrower.email : normalisePhone(loan.borrower.phone),
      subject: message.subject,
      body: message.body,
      status: outcome.status,
      provider: outcome.provider,
      providerMessageId: outcome.messageId ?? '',
      link: outcome.link ?? '',
      error: outcome.error ?? '',
      triggeredBy,
      sentAt: outcome.status === 'failed' ? null : new Date(),
    },
    { session },
  );
}

export async function sendManualReminder(loan, { channels, mode, message, templateId, actorId }) {
  const rendered = await renderMessage(loan, { mode, message, templateId });
  const warnings = [];
  const readiness = channelReadiness(loan);
  const logs = [];

  for (const channel of channels) {
    const state = readiness.find((entry) => entry.channel === channel);
    if (!state?.hasContact) {
      warnings.push(`No ${channel === 'email' ? 'email address' : 'WhatsApp number'} recorded for this borrower`);
      continue;
    }
    if (!state.consented) {
      warnings.push(`${channel === 'email' ? 'Email' : 'WhatsApp'} consent is not recorded for this borrower`);
    }

    const log = await dispatchReminder({
      loan,
      channel,
      message: rendered,
      mode: 'manual',
      triggeredBy: actorId,
    });
    if (log) logs.push(log);
  }

  if (!logs.length) return { logs, rendered, warnings };

  loan.reminders.lastSentAt = new Date();
  await loan.save();

  return {
    logs,
    rendered,
    warnings,
    links: {
      email: rendered && channels.includes('email')
        ? buildMailtoLink(loan.borrower.email, rendered.subject, rendered.body)
        : '',
      whatsapp: logs.find((log) => log.channel === 'whatsapp')?.link ?? '',
    },
  };
}

export async function runDueReminders({ now = new Date(), lenderId = null } = {}) {
  const filter = {
    status: 'active',
    'reminders.enabled': true,
    'reminders.nextDueAt': { $ne: null, $lte: now },
  };
  if (lenderId) filter.lenderId = lenderId;

  const loans = await Loan.find(filter).populate(['categoryId', 'lenderId']);
  const summary = { scanned: loans.length, slotsDue: 0, logs: 0, failed: 0, skippedNoChannel: 0 };

  for (const loan of loans) {
    const channels = usableChannels(loan);
    if (!channels.length) {
      summary.skippedNoChannel += 1;
      await refreshSchedule(loan, { now });
      await loan.save();
      continue;
    }

    const sent = await sentSlotKeys(loan._id);
    const floor = now.getTime() - CATCH_UP_WINDOW_MS;
    const due = buildSlots(loan).filter(
      (slot) => slot.at <= now && slot.at.getTime() >= floor && !sent.has(slot.key),
    );
    if (!due.length) {
      await refreshSchedule(loan, { now });
      await loan.save();
      continue;
    }

    let messagesSent = 0;

    for (const slot of due) {
      summary.slotsDue += 1;
      const rendered = await renderMessage(loan);

      for (const channel of channels) {
        const log = await dispatchReminder({
          loan,
          channel,
          message: rendered,
          mode: 'automatic',
          dedupeKey: `${slot.key}:${channel}`,
          scheduleSlot: slot.slot,
        });

        if (!log) continue;
        summary.logs += 1;
        messagesSent += 1;
        if (log.status === 'failed') summary.failed += 1;
      }
    }

    if (messagesSent) {
      loan.reminders.autoSentCount += messagesSent;
      loan.reminders.lastSentAt = new Date();
    }

    await refreshSchedule(loan, { now });
    await loan.save();
  }

  return summary;
}
