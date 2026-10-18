import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import Loan from '../src/models/Loan.js';
import {
  createCategory,
  createClient,
  createItem,
  inDays,
  manualLoanPayload,
  registerUser,
  startTestServer,
  stopTestServer,
  uniqueEmail,
} from './helpers.js';

let server;
let baseUrl;
let client;
let lender;
let categoryId;
let itemId;

before(async () => {
  ({ server, baseUrl } = await startTestServer());
  client = createClient(baseUrl);
  lender = await registerUser(client, { name: 'Lending Tester', email: uniqueEmail('lending') });
  const category = await createCategory(client, { name: 'AV equipment', defaultPriority: 'medium' });
  categoryId = category._id;
  const item = await createItem(client, categoryId, { title: 'Portable projector' });
  itemId = item._id;
});

after(async () => {
  await stopTestServer(server);
});

test('creates a loan, tracks deadline and priority changes, then returns it', async () => {
  const created = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(categoryId, { itemId }),
  });

  assert.equal(created.status, 201);
  const loan = created.data.loan;
  assert.equal(loan.status, 'active');
  assert.equal(String(loan.itemId?._id ?? loan.itemId), itemId);
  assert.equal(loan.priority, 'high');
  assert.equal(loan.prioritySource, 'manual');
  assert.ok(loan.reminders.nextDueAt);

  const borrowedItem = await client.request(`/items/${itemId}`);
  assert.equal(borrowedItem.status, 200);
  assert.equal(borrowedItem.data.item.status, 'borrowed');

  const newDueDate = inDays(9);
  const rescheduled = await client.request(`/loans/${loan._id}/deadline`, {
    method: 'PATCH',
    body: { dueDate: newDueDate, reason: 'Borrower needs another week' },
  });
  assert.equal(rescheduled.status, 200);
  assert.equal(rescheduled.data.direction, 'postponed');
  assert.equal(new Date(rescheduled.data.loan.dueDate).toISOString(), new Date(newDueDate).toISOString());

  const lowered = await client.request(`/loans/${loan._id}/priority`, {
    method: 'PATCH',
    body: { priority: 'low', reason: 'No urgency now' },
  });
  assert.equal(lowered.status, 200);
  assert.equal(lowered.data.loan.priority, 'low');
  assert.equal(lowered.data.loan.prioritySource, 'manual');

  const raised = await client.request(`/loans/${loan._id}/priority`, {
    method: 'PATCH',
    body: { direction: 'up' },
  });
  assert.equal(raised.status, 200);
  assert.equal(raised.data.loan.priority, 'medium');

  const reset = await client.request(`/loans/${loan._id}/priority`, {
    method: 'PATCH',
    body: { direction: 'reset' },
  });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.loan.priority, 'medium');
  assert.equal(reset.data.loan.prioritySource, 'category');

  const invalidPatch = await client.request(`/loans/${loan._id}/priority`, {
    method: 'PATCH',
    body: { priority: 'urgent' },
  });
  assert.equal(invalidPatch.status, 400);

  const returned = await client.request(`/loans/${loan._id}/return`, {
    method: 'PATCH',
    body: { reason: 'Handed back in person' },
  });
  assert.equal(returned.status, 200);
  assert.equal(returned.data.loan.status, 'returned');
  assert.ok(returned.data.loan.returnedAt);

  const secondReturn = await client.request(`/loans/${loan._id}/return`, { method: 'PATCH' });
  assert.equal(secondReturn.status, 400);

  const availableItem = await client.request(`/items/${itemId}`);
  assert.equal(availableItem.data.item.status, 'available');

  const history = await client.request(`/loans/${loan._id}/history`);
  assert.equal(history.status, 200);
  const kinds = history.data.history.map((entry) => entry.kind);
  assert.ok(kinds.includes('created'));
  assert.ok(kinds.includes('deadline'));
  assert.ok(kinds.includes('priority'));
  assert.ok(kinds.includes('status'));
});

test('inherits the category default at creation and only follows later category moves', async () => {
  const category = await createCategory(client, { name: 'Winter gear', defaultPriority: 'low' });

  const inherited = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(category._id, { itemName: 'Thermal flask', priority: 'category-default' }),
  });
  assert.equal(inherited.status, 201);
  assert.equal(inherited.data.loan.priority, 'low');
  assert.equal(inherited.data.loan.prioritySource, 'category');

  // Editing the category default is deliberately non-retroactive.
  const retuned = await client.request(`/categories/${category._id}`, {
    method: 'PATCH',
    body: { defaultPriority: 'high' },
  });
  assert.equal(retuned.status, 200);

  const unchanged = await client.request(`/loans/${inherited.data.loan._id}`);
  assert.equal(unchanged.status, 200);
  assert.equal(unchanged.data.loan.priority, 'low');
  assert.equal(unchanged.data.loan.prioritySource, 'category');

  const nextCategory = await createCategory(client, { name: 'Camping gear', defaultPriority: 'medium' });
  const moved = await client.request(`/loans/${inherited.data.loan._id}/category`, {
    method: 'PATCH',
    body: { categoryId: nextCategory._id, reason: 'Reclassified' },
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.priorityChanged, true);
  assert.equal(moved.data.loan.priority, 'medium');
  assert.equal(moved.data.loan.prioritySource, 'category');

  // An explicit override survives a category move and never tracks the new default.
  const manual = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(nextCategory._id, { itemName: 'Lantern', priority: 'low' }),
  });
  assert.equal(manual.status, 201);
  assert.equal(manual.data.loan.prioritySource, 'manual');

  const movedManual = await client.request(`/loans/${manual.data.loan._id}/category`, {
    method: 'PATCH',
    body: { categoryId: category._id },
  });
  assert.equal(movedManual.status, 200);
  assert.equal(movedManual.data.priorityChanged, false);
  assert.equal(movedManual.data.loan.priority, 'low');
  assert.equal(movedManual.data.loan.prioritySource, 'manual');
});

test('links a listing to one active loan and frees it when that loan is returned', async () => {
  const category = await createCategory(client, { name: 'Workshop tools', defaultPriority: 'medium' });
  const item = await createItem(client, category._id, { title: 'Torque wrench' });

  const first = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(category._id, { itemId: item._id, itemName: item.title }),
  });
  assert.equal(first.status, 201);
  assert.equal(String(first.data.loan.itemId?._id ?? first.data.loan.itemId), item._id);

  const borrowed = await client.request(`/items/${item._id}`);
  assert.equal(borrowed.data.item.status, 'borrowed');

  const conflict = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(category._id, { itemId: item._id, itemName: item.title }),
  });
  assert.equal(conflict.status, 409);
  assert.match(conflict.data.message, /not available/i);

  const returned = await client.request(`/loans/${first.data.loan._id}/return`, { method: 'PATCH' });
  assert.equal(returned.status, 200);

  const freed = await client.request(`/items/${item._id}`);
  assert.equal(freed.data.item.status, 'available');

  const second = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(category._id, { itemId: item._id, itemName: item.title }),
  });
  assert.equal(second.status, 201);

  const borrowedAgain = await client.request(`/items/${item._id}`);
  assert.equal(borrowedAgain.data.item.status, 'borrowed');
});

test('rejects malformed lending entries', async () => {
  const cases = [
    {
      body: manualLoanPayload(categoryId, { lentAt: inDays(0), dueDate: inDays(-1) }),
      pattern: /after the lending date/i,
    },
    {
      body: manualLoanPayload(categoryId, {
        borrower: { name: 'Maya', email: 'not-an-email', consent: {} },
      }),
      pattern: /valid address/i,
    },
    { body: manualLoanPayload(categoryId, { itemName: '' }), pattern: /item name is required/i },
    { body: manualLoanPayload(categoryId, { priority: 'whenever' }), pattern: /priority must be one of/i },
  ];

  for (const { body, pattern } of cases) {
    const response = await client.request('/loans', { method: 'POST', body });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.match(response.data.message, pattern);
  }
});

test('schedules automatic reminders, deduplicates a second run and allows manual sends', async () => {
  const dueDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const created = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(categoryId, {
      itemName: 'Reminder test router',
      itemId: null,
      lentAt: inDays(-10),
      dueDate,
    }),
  });

  assert.equal(created.status, 201);
  const loan = created.data.loan;
  assert.ok(loan.reminders.nextDueAt);
  assert.ok(new Date(loan.reminders.nextDueAt).getTime() <= Date.now());

  const firstRun = await client.request('/reminders/run', { method: 'POST' });
  assert.equal(firstRun.status, 200);
  assert.equal(firstRun.data.summary.scanned, 1);
  assert.equal(firstRun.data.summary.slotsDue, 1);
  assert.equal(firstRun.data.summary.logs, 2);
  assert.equal(firstRun.data.summary.failed, 0);

  const reminders = await client.request(`/loans/${loan._id}/reminders`);
  assert.equal(reminders.status, 200);
  assert.equal(reminders.data.reminders.length, 2);
  const emailLog = reminders.data.reminders.find((log) => log.channel === 'email');
  const whatsappLog = reminders.data.reminders.find((log) => log.channel === 'whatsapp');
  assert.equal(emailLog.status, 'preview');
  assert.equal(whatsappLog.status, 'link');
  assert.match(whatsappLog.link, /^https:\/\/wa\.me\//);

  const secondRun = await client.request('/reminders/run', { method: 'POST' });
  assert.equal(secondRun.status, 200);
  assert.equal(secondRun.data.summary.slotsDue, 0);
  assert.equal(secondRun.data.summary.logs, 0);

  const afterSecondRun = await client.request(`/loans/${loan._id}/reminders`);
  assert.equal(afterSecondRun.data.reminders.length, 2);

  const schedule = await client.request(`/loans/${loan._id}/reminders/schedule`);
  assert.equal(schedule.status, 200);
  const dueSlot = schedule.data.slots.find((slot) => slot.slot === 'due-date');
  assert.ok(dueSlot);
  assert.equal(dueSlot.sent, true);
  assert.ok(schedule.data.nextDueAt);
  assert.ok(new Date(schedule.data.nextDueAt).getTime() > Date.now());

  const manual = await client.request(`/loans/${loan._id}/reminders`, {
    method: 'POST',
    body: { channels: ['email'], message: 'A manual nudge.' },
  });
  assert.equal(manual.status, 201);
  assert.equal(manual.data.logs.length, 1);
  assert.equal(manual.data.logs[0].mode, 'manual');

  const allLogs = await client.request('/reminders');
  assert.equal(allLogs.status, 200);
  assert.equal(allLogs.data.reminders.length, 3);
});

test('leaves automatic reminders disarmed without borrower consent', async () => {
  const created = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(categoryId, {
      itemName: 'No consent speaker',
      borrower: {
        name: 'No Consent',
        email: 'no-consent@example.test',
        phone: '+91 90000 00001',
        consent: { email: false, whatsapp: false },
      },
      reminders: {
        enabled: true,
        channels: ['email'],
        frequency: 'daily',
        templateMode: 'custom',
        customMessage: 'Please return {itemName}.',
      },
    }),
  });

  assert.equal(created.status, 201);
  assert.equal(created.data.loan.reminders.nextDueAt, null);
  assert.ok(created.data.warnings.some((warning) => /no channel is usable/i.test(warning)));

  const run = await client.request('/reminders/run', { method: 'POST' });
  assert.equal(run.status, 200);
  assert.equal(run.data.summary.scanned, 0);
  assert.equal(run.data.summary.logs, 0);
});

test('records the actual return date, note and a lender-reported borrower confirmation', async () => {
  const category = await createCategory(client, { name: 'Return metadata' });
  const item = await createItem(client, category._id, { title: 'Return metadata speaker' });
  const created = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(category._id, {
      itemId: item._id,
      itemName: item.title,
      lentAt: inDays(-5),
      dueDate: inDays(2),
    }),
  });
  assert.equal(created.status, 201);
  const loanId = created.data.loan._id;
  assert.ok(created.data.loan.reminders.nextDueAt);

  const returnedAt = inDays(-1);
  const returned = await client.request(`/loans/${loanId}/return`, {
    method: 'PATCH',
    body: {
      returnedAt,
      note: 'Back with a small scratch on the case',
      borrowerConfirmedReturn: true,
    },
  });

  assert.equal(returned.status, 200);
  const loan = returned.data.loan;
  assert.equal(loan.status, 'returned');
  assert.equal(new Date(loan.returnedAt).toISOString(), new Date(returnedAt).toISOString());
  assert.equal(loan.returnNote, 'Back with a small scratch on the case');
  assert.equal(loan.borrowerReturnConfirmation.source, 'lender-reported');
  assert.ok(loan.borrowerReturnConfirmation.reportedAt);
  assert.equal(String(loan.borrowerReturnConfirmation.reportedBy), lender._id);
  assert.equal(loan.reminders.nextDueAt, null);
  assert.equal(loan.borrowerContext.linked, false);
  assert.equal(loan.borrowerContext.email, 'maya@example.test');
  assert.equal(loan.borrowerContext.phone, '+91 98765 43210');

  const available = await client.request(`/items/${item._id}`);
  assert.equal(available.data.item.status, 'available');

  const schedule = await client.request(`/loans/${loanId}/reminders/schedule`);
  assert.equal(schedule.status, 200);
  assert.equal(schedule.data.armed, false);
  assert.equal(schedule.data.nextDueAt, null);
  assert.ok(schedule.data.slots.length > 0);

  const history = await client.request(`/loans/${loanId}/history`);
  assert.equal(history.status, 200);
  const statusEntry = history.data.history.find((entry) => entry.kind === 'status');
  assert.equal(statusEntry.reason, 'Back with a small scratch on the case');

  const stored = await Loan.findById(loanId);
  assert.equal(stored.status, 'returned');
  assert.equal(stored.returnNote, 'Back with a small scratch on the case');
  assert.equal(stored.borrowerReturnConfirmation.source, 'lender-reported');
  assert.equal(String(stored.borrowerReturnConfirmation.reportedBy), lender._id);

  const secondReturn = await client.request(`/loans/${loanId}/return`, { method: 'PATCH' });
  assert.equal(secondReturn.status, 400);
});

test('rejects invalid return metadata without closing the loan', async () => {
  const category = await createCategory(client, { name: 'Return validation' });
  const item = await createItem(client, category._id, { title: 'Return validation kettle' });
  const created = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(category._id, {
      itemId: item._id,
      itemName: item.title,
      lentAt: inDays(-3),
      dueDate: inDays(3),
    }),
  });
  assert.equal(created.status, 201);
  const loanId = created.data.loan._id;

  const cases = [
    {
      body: { returnedAt: new Date(Date.now() + 2 * 86_400_000).toISOString() },
      pattern: /cannot be in the future/i,
    },
    { body: { returnedAt: inDays(-4) }, pattern: /before the lending date/i },
    { body: { returnedAt: 'not-a-date' }, pattern: /not a valid date/i },
    { body: { note: 'x'.repeat(501) }, pattern: /at most 500/i },
    { body: { borrowerConfirmedReturn: 'yes' }, pattern: /true or false/i },
  ];

  for (const { body, pattern } of cases) {
    const response = await client.request(`/loans/${loanId}/return`, { method: 'PATCH', body });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.match(response.data.message, pattern);
  }

  const stillActive = await client.request(`/loans/${loanId}`);
  assert.equal(stillActive.data.loan.status, 'active');
  assert.equal(stillActive.data.loan.returnedAt, null);
  const stillBorrowed = await client.request(`/items/${item._id}`);
  assert.equal(stillBorrowed.data.item.status, 'borrowed');

  const other = createClient(baseUrl);
  await registerUser(other, { name: 'Other Lender', email: uniqueEmail('other-lender') });
  const foreignReturn = await other.request(`/loans/${loanId}/return`, { method: 'PATCH' });
  assert.equal(foreignReturn.status, 403);
});

test('keeps the legacy reason alias and records no confirmation unless reported', async () => {
  const category = await createCategory(client, { name: 'Legacy return' });
  const created = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(category._id, {
      itemName: 'Legacy return radio',
      lentAt: inDays(-2),
      dueDate: inDays(4),
    }),
  });
  assert.equal(created.status, 201);
  const loanId = created.data.loan._id;

  const returned = await client.request(`/loans/${loanId}/return`, {
    method: 'PATCH',
    body: { reason: 'Returned in person' },
  });

  assert.equal(returned.status, 200);
  const loan = returned.data.loan;
  assert.equal(loan.returnNote, 'Returned in person');
  assert.equal(loan.borrowerReturnConfirmation, undefined);
  assert.ok(Date.now() - new Date(loan.returnedAt).getTime() < 60_000);

  const history = await client.request(`/loans/${loanId}/history`);
  const statusEntry = history.data.history.find((entry) => entry.kind === 'status');
  assert.equal(statusEntry.reason, 'Returned in person');
});
