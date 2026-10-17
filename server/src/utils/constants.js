export const PRIORITIES = ['low', 'medium', 'high'];

export const REMINDER_CHANNELS = ['email', 'whatsapp'];

export const REMINDER_FREQUENCIES = ['manual', 'daily', 'custom'];

export const TEMPLATE_MODES = ['priority', 'category', 'custom'];

export const LOAN_ORIGINS = ['request', 'manual'];

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// wa.me rejects anything that is not digits, and silently opens an empty chat when
// the country code is missing, so normalise rather than trust the raw input.
export function normalisePhone(value = '') {
  const digits = String(value).replace(/[^\d]/g, '');
  return digits.replace(/^0+/, '');
}

export function stepPriority(current, direction) {
  const index = PRIORITIES.indexOf(current);
  if (index === -1) return current;
  const next = index + (direction === 'up' ? 1 : -1);
  if (next < 0 || next >= PRIORITIES.length) return current;
  return PRIORITIES[next];
}
