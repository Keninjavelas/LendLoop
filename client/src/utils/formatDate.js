const DAY_MS = 86400000;

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

// Overdue is derived, never stored: an active loan past its dueDate is overdue.
export function isOverdue(loan) {
  return loan?.status === 'active' && new Date(loan.dueDate).getTime() < Date.now();
}

function pluralise(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function dueLabel(loan) {
  if (!loan) return '';
  if (loan.status === 'returned') return `Returned ${formatDate(loan.returnedAt)}`;

  // Deadlines are stored as local midnight, so a part-elapsed day still counts as a
  // whole day remaining. Ceiling matches the server's daysUntilDue, which renders the
  // {duePhrase} in reminder messages — the card and the message have to agree.
  const remaining = new Date(loan.dueDate).getTime() - Date.now();
  const days = remaining >= 0 ? Math.ceil(remaining / DAY_MS) : Math.round(remaining / DAY_MS);
  if (days < 0) return `${pluralise(Math.abs(days), 'day')} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${pluralise(days, 'day')}`;
}

// Amber is only for a deadline close enough to act on; red stays reserved for
// genuinely overdue. Decided here once so every surface colours a deadline the same way.
export function dueTone(loan) {
  if (!loan || loan.status === 'returned') return 'muted';
  if (isOverdue(loan)) return 'danger';
  const remaining = new Date(loan.dueDate).getTime() - Date.now();
  return remaining <= 3 * DAY_MS ? 'pending' : 'ink';
}

export function timeAgo(value) {
  if (!value) return '';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (seconds >= secs) return `${pluralise(Math.floor(seconds / secs), unit)} ago`;
  }
  return 'just now';
}

// `<input type="date">` expects a local YYYY-MM-DD, so the timezone offset has to
// be cancelled out before slicing or the value can land a day early.
export function toInputDate(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// The reverse: `new Date('2026-10-20')` reads as UTC midnight and shows the previous day
// anywhere west of Greenwich, so build the local date from its parts instead.
export function fromInputDate(value) {
  const [year, month, day] = String(value ?? '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function tomorrowInputDate() {
  return toInputDate(new Date(Date.now() + DAY_MS));
}
