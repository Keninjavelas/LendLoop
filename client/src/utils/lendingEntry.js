import {
  CHANNEL_LABELS,
  PRIORITIES,
  PRIORITY_SCHEDULES,
  REMINDER_CHANNELS,
  REMINDER_FREQUENCIES,
  TEMPLATE_MODES,
  offsetLabel,
} from './constants.js';
import { fromInputDate, toInputDate } from './formatDate.js';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DAY_MS = 86400000;

export const ENTRY_STEPS = [
  { id: 'item', title: 'Item', description: 'What went out and how it is grouped.' },
  { id: 'borrower', title: 'Borrower', description: 'Who has it and what they agreed to.' },
  { id: 'terms', title: 'Terms', description: 'The dates, priority and private notes.' },
  { id: 'reminders', title: 'Reminders', description: 'When LendLoop should nudge and on which channels.' },
  { id: 'review', title: 'Review', description: 'Check the complete entry before saving.' },
];

export const FIELD_IDS = {
  itemName: 'entry-item-name',
  categoryId: 'entry-category',
  borrowerName: 'entry-borrower',
  borrowerEmail: 'entry-email',
  borrowerPhone: 'entry-phone',
  lentAt: 'entry-lent',
  dueDate: 'entry-due',
  priority: 'entry-priority',
  channels: 'entry-channel-email',
  frequency: 'entry-frequency',
  templateMode: 'entry-template-mode',
  customOffsets: 'entry-offsets',
  customMessage: 'entry-custom-message',
  overdueIntervalHours: 'entry-overdue-interval',
  maxOverdueReminders: 'entry-overdue-cap',
};

export const STEP_FIELDS = {
  item: ['itemName', 'categoryId'],
  borrower: ['borrowerName', 'borrowerEmail', 'borrowerPhone'],
  terms: ['lentAt', 'dueDate', 'priority'],
  reminders: [
    'channels',
    'frequency',
    'templateMode',
    'customOffsets',
    'customMessage',
    'overdueIntervalHours',
    'maxOverdueReminders',
  ],
};

// The stock preferences mirror the medium-priority defaults. Only a deliberate change
// in Settings overrides the priority-driven channel presets, so existing accounts keep
// the behaviour they had before preferences existed.
export function preferredChannels(preferences) {
  if (!preferences) return [];
  const untouched =
    preferences.defaultReminderChannel === 'email' &&
    preferences.emailNotifications === true &&
    preferences.whatsappNotifications === false;
  if (untouched) return [];

  const enabled = [];
  if (preferences.emailNotifications) enabled.push('email');
  if (preferences.whatsappNotifications) enabled.push('whatsapp');
  if (!enabled.length) return [];

  const preferred = preferences.defaultReminderChannel;
  return enabled.includes(preferred)
    ? [preferred, ...enabled.filter((channel) => channel !== preferred)]
    : enabled;
}

export function initialChannels(priority, preferences) {
  const preferred = preferredChannels(preferences);
  return preferred.length ? preferred : [...(PRIORITY_SCHEDULES[priority]?.channels ?? ['email'])];
}

export function createEntryDefaults(preferences, now = new Date()) {
  return {
    itemId: '',
    itemName: '',
    description: '',
    categoryId: '',
    borrowerId: '',
    borrowerName: '',
    borrowerEmail: '',
    borrowerPhone: '',
    consentEmail: false,
    consentWhatsApp: false,
    consentNote: '',
    lentAt: toInputDate(now),
    dueDate: toInputDate(new Date(now.getTime() + DAY_MS)),
    priority: 'category-default',
    channels: initialChannels('medium', preferences),
    remindersEnabled: true,
    frequency: 'daily',
    customOffsets: '-3, -1, 0',
    templateMode: 'priority',
    customMessage: '',
    notes: '',
    overdueIntervalHours: 48,
    maxOverdueReminders: 5,
  };
}

export function resolvePriority(priority, category) {
  if (!priority || priority === 'category-default') {
    return category?.defaultPriority ?? 'medium';
  }
  return priority;
}

function nextChannels(values, priority, preferences, channelsTouched) {
  if (channelsTouched || values.priority !== 'category-default') {
    return values.channels;
  }
  return initialChannels(priority, preferences);
}

// Linking a listing changes its category just like choosing one from the dropdown, so
// both paths have to re-derive the untouched channel preset from the category priority.
export function applyCategorySelection(values, category, preferences, channelsTouched) {
  const categoryId = category?._id ?? values.categoryId ?? '';
  return {
    ...values,
    categoryId,
    channels: nextChannels(
      values,
      category?.defaultPriority ?? 'medium',
      preferences,
      channelsTouched,
    ),
  };
}

export function applyPrioritySelection(values, priority, category, preferences, channelsTouched) {
  const resolved = priority === 'category-default'
    ? category?.defaultPriority ?? 'medium'
    : priority;
  return {
    ...values,
    priority,
    channels: channelsTouched ? values.channels : initialChannels(resolved, preferences),
  };
}

export function applyItemSelection(values, item, categories, preferences, channelsTouched) {
  if (!item) {
    // Keep the copied fields when unlinking; clearing them would silently discard edits.
    return { ...values, itemId: '' };
  }

  const categoryRef = item.categoryId;
  const categoryId = typeof categoryRef === 'object' && categoryRef
    ? categoryRef._id
    : categoryRef ?? values.categoryId;
  const category = categories.find((entry) => entry._id === categoryId)
    ?? (typeof categoryRef === 'object' ? categoryRef : null);

  const next = {
    ...values,
    itemId: item._id,
    itemName: item.title || values.itemName,
    description: item.description || values.description,
    categoryId: categoryId || values.categoryId,
  };

  return applyCategorySelection(next, category, preferences, channelsTouched);
}

export function parseOffsets(raw) {
  const offsets = String(raw ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
  return [...new Set(offsets)].sort((a, b) => a - b);
}

export function validateStep(step, values) {
  const next = {};

  if (step === 'item') {
    if (String(values.itemName ?? '').trim().length < 2) next.itemName = 'Give the item a name';
    if (!values.categoryId) next.categoryId = 'Choose a category';
  }

  if (step === 'borrower') {
    if (String(values.borrowerName ?? '').trim().length < 2) next.borrowerName = 'Who has the item?';
    const email = String(values.borrowerEmail ?? '').trim();
    if (email && !EMAIL_PATTERN.test(email)) {
      next.borrowerEmail = 'That does not look like an email address';
    }
    const phone = String(values.borrowerPhone ?? '').trim();
    if (phone && phone.replace(/\D/g, '').length < 8) {
      next.borrowerPhone = 'Include the country code, e.g. +919876543210';
    }
  }

  if (step === 'terms') {
    const lent = fromInputDate(values.lentAt);
    const due = fromInputDate(values.dueDate);
    if (!lent) next.lentAt = 'Pick the day it went out';
    if (!due) next.dueDate = 'Pick the day it is due back';
    if (lent && due && due.getTime() <= lent.getTime()) {
      next.dueDate = 'The deadline must fall after the lending date';
    }
    if (!PRIORITIES.includes(values.priority) && values.priority !== 'category-default') {
      next.priority = 'Choose a priority';
    }
  }

  if (step === 'reminders') {
    if (!REMINDER_FREQUENCIES.includes(values.frequency)) {
      next.frequency = 'Choose a reminder frequency';
    }
    if (!TEMPLATE_MODES.includes(values.templateMode)) {
      next.templateMode = 'Choose a message source';
    }

    if (values.remindersEnabled) {
      if (values.frequency !== 'manual' && !values.channels.length) {
        next.channels = 'Pick at least one channel, or switch reminders to manual only';
      }
      if (values.frequency === 'custom' && !parseOffsets(values.customOffsets).length) {
        next.customOffsets = 'List at least one day offset, e.g. -3, -1, 0';
      }
      if (values.templateMode === 'custom' && !String(values.customMessage ?? '').trim()) {
        next.customMessage = 'Write the message you want sent';
      }
    }

    const interval = Number(values.overdueIntervalHours);
    if (!Number.isFinite(interval) || interval < 1) next.overdueIntervalHours = 'At least one hour';

    const cap = Number(values.maxOverdueReminders);
    if (!Number.isFinite(cap) || cap < 0 || cap > 50) next.maxOverdueReminders = 'Between 0 and 50';
  }

  return next;
}

export function validateEntry(values) {
  return ENTRY_STEPS.reduce(
    (errors, step) => ({ ...errors, ...validateStep(step.id, values) }),
    {},
  );
}

export function firstErrorField(errors) {
  for (const step of ENTRY_STEPS) {
    for (const field of STEP_FIELDS[step.id] ?? []) {
      if (errors[field]) return FIELD_IDS[field] ?? null;
    }
  }
  return null;
}

export function buildPayload(values) {
  const lent = fromInputDate(values.lentAt);
  const due = fromInputDate(values.dueDate);
  if (!lent || !due) {
    throw new Error('A valid lending date and return deadline are required');
  }

  return {
    itemName: String(values.itemName).trim(),
    description: String(values.description ?? '').trim(),
    categoryId: values.categoryId,
    itemId: values.itemId || null,
    // Only set for a repeat lending flow started from a known account. The server
    // re-checks that a prior relationship exists and takes contact details from it.
    borrowerId: values.borrowerId || null,
    borrower: {
      name: String(values.borrowerName).trim(),
      email: String(values.borrowerEmail ?? '').trim().toLowerCase(),
      phone: String(values.borrowerPhone ?? '').trim(),
      consent: {
        email: values.consentEmail === true,
        whatsapp: values.consentWhatsApp === true,
        note: String(values.consentNote ?? '').trim(),
      },
    },
    lentAt: lent.toISOString(),
    dueDate: due.toISOString(),
    // Keep the sentinel so the server records this as a category inheritance rather
    // than a manual override.
    priority: values.priority,
    notes: String(values.notes ?? '').trim(),
    reminders: {
      enabled: values.remindersEnabled,
      channels: values.channels,
      frequency: values.frequency,
      templateMode: values.templateMode,
      customMessage: String(values.customMessage ?? '').trim(),
      customOffsetsDays: values.frequency === 'custom'
        ? parseOffsets(values.customOffsets)
        : [],
      overdueIntervalHours: Number(values.overdueIntervalHours),
      maxOverdueReminders: Number(values.maxOverdueReminders),
    },
  };
}

export function channelReadiness(values) {
  return REMINDER_CHANNELS.map((channel) => {
    const selected = values.channels.includes(channel);
    let reason = '';

    if (channel === 'email') {
      if (!values.consentEmail) reason = 'consent not recorded';
      else if (!EMAIL_PATTERN.test(String(values.borrowerEmail ?? '').trim())) {
        reason = 'valid email needed';
      }
    } else if (!values.consentWhatsApp) {
      reason = 'consent not recorded';
    } else if (String(values.borrowerPhone ?? '').replace(/\D/g, '').length < 8) {
      reason = 'number needed';
    }

    return { channel, selected, ready: selected && !reason, reason };
  });
}

export function reminderPlan(values, category) {
  const priority = resolvePriority(values.priority, category);
  const mode = !values.remindersEnabled
    ? 'off'
    : values.frequency === 'manual'
      ? 'manual'
      : 'automatic';

  const offsets = mode === 'automatic'
    ? (values.frequency === 'custom'
      ? parseOffsets(values.customOffsets)
      : [...(PRIORITY_SCHEDULES[priority]?.offsetsDays ?? [])])
    : [];

  return {
    priority,
    mode,
    automatic: mode === 'automatic',
    offsets,
    labels: offsets.map(offsetLabel),
  };
}

export function entryWarnings(values, category, linkedItem) {
  const warnings = [];
  const readiness = channelReadiness(values);
  const selected = readiness.filter((entry) => entry.selected);
  const ready = selected.filter((entry) => entry.ready);
  const skipped = selected.filter((entry) => !entry.ready);

  if (values.remindersEnabled && values.frequency !== 'manual') {
    if (!ready.length) {
      warnings.push(
        'Automatic reminders will be armed but idle: no selected channel is usable yet. Nothing is sent until consent and contact details exist.',
      );
    } else if (skipped.length) {
      const labels = skipped.map((entry) => CHANNEL_LABELS[entry.channel]).join(' and ');
      warnings.push(`${labels} will be skipped until the missing consent or contact details are recorded.`);
    }
  }

  if (linkedItem) {
    warnings.push('Saving marks the linked listing as borrowed until this entry is returned.');
  }

  if (!values.remindersEnabled) {
    warnings.push('Automatic reminders are off. The schedule is kept but silenced; you can still send by hand.');
  } else if (values.frequency === 'manual') {
    warnings.push('Reminders are manual only. No automatic messages will be queued.');
  }

  const due = fromInputDate(values.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due && due.getTime() < today.getTime()) {
    warnings.push(
      'The return deadline is before today, so this entry starts overdue. Reminder slots older than 24 hours are skipped.',
    );
  }

  return warnings;
}
