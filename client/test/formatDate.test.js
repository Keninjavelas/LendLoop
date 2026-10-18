import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dueLabel,
  dueTone,
  formatDate,
  formatDateTime,
  fromInputDate,
  isOverdue,
  timeAgo,
  toInputDate,
  tomorrowInputDate,
  untilLabel,
} from '../src/utils/formatDate.js';

const DAY_MS = 86_400_000;

function localMidnight(offsetDays = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

test('formats dates without turning an invalid value into a wrong date', () => {
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate('not-a-date'), '—');
  assert.equal(formatDate('2026-10-18T10:30:00.000Z'), '18 Oct 2026');
  assert.match(formatDateTime('2026-10-18T10:30:00.000Z'), /^18 Oct 2026, \d{2}:\d{2}$/);
});

test('labels upcoming reminder slots until they are due', () => {
  assert.equal(untilLabel(null), '');
  assert.equal(untilLabel('not-a-date'), '');
  assert.equal(untilLabel(new Date(Date.now() - 60_000).toISOString()), 'slot is due now');
  assert.equal(untilLabel(new Date(Date.now() + 5 * 60_000).toISOString()), 'in 5 min');
  assert.equal(untilLabel(new Date(Date.now() + 2 * 3_600_000).toISOString()), 'in 2 h');
  assert.equal(untilLabel(new Date(Date.now() + 3 * DAY_MS).toISOString()), 'in 3 days');
});

test('describes deadlines by calendar day and reserves danger for overdue loans', () => {
  const future = {
    status: 'active',
    dueDate: localMidnight(5).toISOString(),
  };
  assert.equal(dueLabel(future), 'Due in 5 days');
  assert.equal(dueTone(future), 'ink');
  assert.equal(isOverdue(future), false);

  const soon = {
    status: 'active',
    dueDate: localMidnight(2).toISOString(),
  };
  assert.equal(dueTone(soon), 'pending');

  const overdue = {
    status: 'active',
    dueDate: localMidnight(-2).toISOString(),
  };
  assert.equal(isOverdue(overdue), true);
  assert.match(dueLabel(overdue), /^\d+ days? overdue$/);
  assert.equal(dueTone(overdue), 'danger');

  const returned = {
    status: 'returned',
    dueDate: localMidnight(-5).toISOString(),
    returnedAt: new Date().toISOString(),
  };
  assert.equal(isOverdue(returned), false);
  assert.equal(dueTone(returned), 'muted');
  assert.match(dueLabel(returned), /^Returned /);
});

test('round-trips date inputs without shifting the calendar day', () => {
  const today = localMidnight(0);
  assert.equal(fromInputDate(toInputDate(today)).getTime(), today.getTime());

  const roundTrip = fromInputDate('2026-10-20');
  assert.equal(roundTrip.getFullYear(), 2026);
  assert.equal(roundTrip.getMonth(), 9);
  assert.equal(roundTrip.getDate(), 20);
  assert.equal(toInputDate(roundTrip), '2026-10-20');

  assert.equal(fromInputDate(''), null);
  assert.equal(fromInputDate('2026-02-31'), null);

  const tomorrow = fromInputDate(tomorrowInputDate());
  const expected = localMidnight(1);
  assert.equal(tomorrow.getFullYear(), expected.getFullYear());
  assert.equal(tomorrow.getMonth(), expected.getMonth());
  assert.equal(tomorrow.getDate(), expected.getDate());
});

test('renders relative activity without claiming future events', () => {
  assert.equal(timeAgo(null), '');
  assert.equal(timeAgo(new Date().toISOString()), 'just now');
  assert.equal(timeAgo(new Date(Date.now() - 2 * 3_600_000).toISOString()), '2 hours ago');
  assert.equal(timeAgo(new Date(Date.now() - 3 * DAY_MS).toISOString()), '3 days ago');
});
