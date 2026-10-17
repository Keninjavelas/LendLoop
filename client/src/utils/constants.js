// Categories live in MongoDB and are fetched via categoryService (lenders can add their
// own), so they are no longer hardcoded here. Condition is still a fixed Item enum.
export const ITEM_CONDITIONS = ['New', 'Good', 'Fair'];

export const PRIORITIES = ['low', 'medium', 'high'];

export const REMINDER_CHANNELS = ['email', 'whatsapp'];

export const REMINDER_FREQUENCIES = ['manual', 'daily', 'custom'];

export const TEMPLATE_MODES = ['priority', 'category', 'custom'];

export const TEMPLATE_SCOPES = ['general', 'priority', 'category'];

export const PRIORITY_LABELS = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const CHANNEL_LABELS = {
  email: 'Email',
  whatsapp: 'WhatsApp',
};

export const FREQUENCY_LABELS = {
  manual: 'Manual only',
  daily: 'Daily check',
  custom: 'Custom days',
};

export const TEMPLATE_MODE_LABELS = {
  priority: 'By priority',
  category: 'By category',
  custom: 'Custom message',
};

// Mirrors the server's PRIORITY_DEFAULTS so a form can explain what a priority schedules
// before anything is saved. The server stays the source of truth for the actual slots.
export const PRIORITY_SCHEDULES = {
  low: { offsetsDays: [-1], channels: ['email'], summary: '1 day before the deadline' },
  medium: {
    offsetsDays: [-2, 0],
    channels: ['email'],
    summary: '2 days before, and on the deadline',
  },
  high: {
    offsetsDays: [-3, -1, 0],
    channels: ['email', 'whatsapp'],
    summary: '3 days before, 1 day before, and on the deadline',
  },
};

export function priorityLabel(priority) {
  return PRIORITY_LABELS[String(priority ?? '').toLowerCase()] ?? priority ?? '';
}

// Turns a schedule offset into the wording a lender reads, e.g. -3 -> "3 days before".
export function offsetLabel(offsetDays) {
  const days = Number(offsetDays);
  if (!Number.isFinite(days)) return '';
  if (days === 0) return 'On the deadline';
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} after the deadline`;
  const absolute = Math.abs(days);
  return `${absolute} day${absolute === 1 ? '' : 's'} before`;
}

export function priorityScheduleSummary(priority) {
  return PRIORITY_SCHEDULES[String(priority ?? '').toLowerCase()]?.summary ?? '';
}
