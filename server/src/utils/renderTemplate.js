const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PLACEHOLDER = /\{(\w+)\}/g;

const DAY_MS = 86_400_000;

export function formatDateShort(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateTimeShort(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDateShort(date)}, ${hours}:${minutes}`;
}

export function daysUntilDue(dueDate, now = new Date()) {
  return Math.ceil((new Date(dueDate).getTime() - now.getTime()) / DAY_MS);
}

export function duePhrase(dueDate, now = new Date()) {
  const days = daysUntilDue(dueDate, now);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Unknown placeholders are left untouched so a typo in a template is visible
// to the lender instead of silently blanking part of the message.
export function renderTemplate(text, values = {}) {
  return String(text ?? '').replace(PLACEHOLDER, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : match,
  );
}

export function buildPlaceholderValues(loan, now = new Date()) {
  const category = loan.categoryId;
  const lender = loan.lenderId;

  return {
    borrowerName: loan.borrower?.name ?? '',
    itemName: loan.itemName ?? '',
    dueDate: formatDateShort(loan.dueDate),
    dueDateTime: formatDateTimeShort(loan.dueDate),
    category: category && typeof category === 'object' ? category.name ?? '' : '',
    priority: loan.priority ?? '',
    lenderName: lender && typeof lender === 'object' ? lender.name ?? '' : '',
    daysUntilDue: daysUntilDue(loan.dueDate, now),
    duePhrase: duePhrase(loan.dueDate, now),
  };
}

// Derived rather than hand-written, so the documented list can never drift from the
// values the renderer actually supplies.
export const TEMPLATE_PLACEHOLDERS = Object.keys(
  buildPlaceholderValues({
    borrower: {},
    categoryId: {},
    lenderId: {},
    itemName: '',
    priority: '',
    dueDate: new Date(0),
  }),
);
