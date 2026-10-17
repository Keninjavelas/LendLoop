import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
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
let categoryId;
let itemId;

before(async () => {
  ({ server, baseUrl } = await startTestServer());
  client = createClient(baseUrl);
  await registerUser(client, { name: 'Lending Tester', email: uniqueEmail('lending') });
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
