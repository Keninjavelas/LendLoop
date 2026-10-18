import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import Loan from '../src/models/Loan.js';
import ReminderLog from '../src/models/ReminderLog.js';
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
let analystClient;
let borrowerClient;
let reminderClient;
let outsiderClient;
let analyst;
let borrower;
let reminderLender;
let analystCategory;
let smallLenderClient;
let smallLender;
let reminderCategory;
let reminderLoans;
let sentLogs;
let failedLog;

const JUNE_RANGE = 'from=2026-06-01&to=2026-06-30';

function utc(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

async function createHistoricalLoan(client, categoryId, overrides = {}) {
  const response = await client.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(categoryId, {
      reminders: { enabled: false, frequency: 'manual' },
      ...overrides,
    }),
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.loan;
}

async function returnHistoricalLoan(client, loanId, returnedAt) {
  const response = await client.request(`/loans/${loanId}/return`, {
    method: 'PATCH',
    body: { returnedAt },
  });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data.loan;
}

async function createReminderLoan(overrides = {}) {
  const response = await reminderClient.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(reminderCategory._id, {
      itemName: 'Reminder loan',
      lentAt: inDays(-1),
      dueDate: inDays(3),
      ...overrides,
    }),
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.loan;
}

before(async () => {
  ({ server, baseUrl } = await startTestServer());

  analystClient = createClient(baseUrl);
  borrowerClient = createClient(baseUrl);
  reminderClient = createClient(baseUrl);
  outsiderClient = createClient(baseUrl);
  smallLenderClient = createClient(baseUrl);

  analyst = await registerUser(analystClient, {
    name: 'Insights Analyst',
    email: uniqueEmail('analyst'),
  });
  borrower = await registerUser(borrowerClient, {
    name: 'Insights Borrower',
    email: uniqueEmail('insights-borrower'),
    phone: '+91 90000 55555',
  });
  reminderLender = await registerUser(reminderClient, {
    name: 'Reminder Lender',
    email: uniqueEmail('reminder-lender'),
  });
  await registerUser(outsiderClient, {
    name: 'Reminder Outsider',
    email: uniqueEmail('reminder-outsider'),
  });
  smallLender = await registerUser(smallLenderClient, {
    name: 'Small Sample Lender',
    email: uniqueEmail('small-sample'),
  });

  analystCategory = await createCategory(analystClient, { name: 'Historical loans' });
  reminderCategory = await createCategory(reminderClient, { name: 'Reminder gear' });
  const smallCategory = await createCategory(smallLenderClient, { name: 'Small sample gear' });

  for (let index = 0; index < 5; index += 1) {
    const loan = await createHistoricalLoan(analystClient, analystCategory._id, {
      itemName: `On-time loan ${index + 1}`,
      lentAt: '2026-06-01T12:00:00.000Z',
      dueDate: '2026-06-06T00:00:00.000Z',
    });
    await returnHistoricalLoan(analystClient, loan._id, '2026-06-06T12:00:00.000Z');
  }

  const late = await createHistoricalLoan(analystClient, analystCategory._id, {
    itemName: 'Late loan',
    lentAt: '2026-06-08T12:00:00.000Z',
    dueDate: '2026-06-10T00:00:00.000Z',
  });
  await returnHistoricalLoan(analystClient, late._id, '2026-06-12T12:00:00.000Z');

  await createHistoricalLoan(analystClient, analystCategory._id, {
    itemName: '=SUM(1,2)',
    lentAt: '2026-06-20T12:00:00.000Z',
    dueDate: '2026-07-01T00:00:00.000Z',
    priority: 'high',
  });

  const outside = await createHistoricalLoan(analystClient, analystCategory._id, {
    itemName: 'Outside range loan',
    lentAt: '2026-05-15T12:00:00.000Z',
    dueDate: '2026-05-20T00:00:00.000Z',
  });
  await returnHistoricalLoan(analystClient, outside._id, '2026-05-20T12:00:00.000Z');

  const borrowerCategory = await createCategory(borrowerClient, { name: 'Borrower listings' });
  const canoe = await createItem(borrowerClient, borrowerCategory._id, { title: 'Borrower canoe' });
  const request = await analystClient.request('/requests', {
    method: 'POST',
    body: { itemId: canoe._id, requestedReturnDate: inDays(14) },
  });
  assert.equal(request.status, 201);
  const approval = await borrowerClient.request(`/requests/${request.data.request._id}/approve`, {
    method: 'PATCH',
  });
  assert.equal(approval.status, 200);

  const first = await createHistoricalLoan(smallLenderClient, smallCategory._id, {
    itemName: 'Small one',
    lentAt: '2026-06-02T12:00:00.000Z',
    dueDate: '2026-06-04T00:00:00.000Z',
  });
  await returnHistoricalLoan(smallLenderClient, first._id, '2026-06-04T12:00:00.000Z');
  const second = await createHistoricalLoan(smallLenderClient, smallCategory._id, {
    itemName: 'Small two',
    lentAt: '2026-06-05T12:00:00.000Z',
    dueDate: '2026-06-07T00:00:00.000Z',
  });
  await returnHistoricalLoan(smallLenderClient, second._id, '2026-06-07T12:00:00.000Z');

  // A closed record from before return timestamps were captured must never be guessed
  // as on time or late.
  await Loan.create({
    origin: 'manual',
    itemName: 'Legacy closed record',
    categoryId: smallCategory._id,
    lenderId: smallLender._id,
    borrower: { name: 'Legacy borrower' },
    lentAt: utc('2026-06-03'),
    dueDate: utc('2026-06-05'),
    status: 'returned',
    returnedAt: null,
    priority: 'medium',
    reminders: { enabled: false, frequency: 'manual' },
  });

  reminderLoans = {
    active: await createReminderLoan({
      itemName: 'Reminder active',
      dueDate: inDays(3),
      borrower: {
        name: 'Consenting Borrower',
        email: 'consenting@example.test',
        phone: '+91 90000 11111',
        consent: { email: true, whatsapp: true },
      },
      reminders: {
        enabled: true,
        frequency: 'daily',
        channels: ['email', 'whatsapp'],
      },
    }),
    blocked: await createReminderLoan({
      itemName: 'Reminder blocked',
      dueDate: inDays(5),
      borrower: {
        name: 'No Consent',
        email: 'no-consent@example.test',
        phone: '+91 90000 22222',
        consent: { email: false, whatsapp: false },
      },
      reminders: { enabled: true, frequency: 'daily', channels: ['email'] },
    }),
    manual: await createReminderLoan({
      itemName: 'Reminder manual only',
      dueDate: inDays(6),
      reminders: { enabled: true, frequency: 'manual', channels: ['email'] },
    }),
    off: await createReminderLoan({
      itemName: 'Reminder switched off',
      dueDate: inDays(7),
      reminders: { enabled: false, frequency: 'daily', channels: ['email'] },
    }),
  };
  assert.equal(reminderLoans.active.reminders.nextDueAt !== null, true);
  assert.equal(reminderLoans.blocked.reminders.nextDueAt, null);
});

after(async () => {
  await stopTestServer(server);
});

test('reports lent, return and rate insights for the inclusive date range', async () => {
  const response = await analystClient.request(`/insights?${JUNE_RANGE}`);
  assert.equal(response.status, 200);
  const insights = response.data;

  assert.deepEqual(insights.range, { from: '2026-06-01', to: '2026-06-30' });
  assert.deepEqual(insights.snapshot, {
    activeLent: 1,
    activeBorrowed: 1,
    overdueLent: 1,
    overdueBorrowed: 0,
  });
  assert.equal(insights.lent.total, 7);
  assert.equal(insights.lent.active, 1);
  assert.equal(insights.lent.returned, 6);
  assert.equal(insights.lent.overdueNow, 1);
  assert.equal(insights.returns.total, 6);
  assert.equal(insights.returns.onTime, 5);
  assert.equal(insights.returns.late, 1);
  assert.equal(insights.returns.averageDays, 4.8);
  assert.equal(insights.returns.missingTimestampClosed, 0);
  assert.equal(insights.rates.onTime, 83.3);
  assert.equal(insights.rates.smallSample, false);
  assert.equal(insights.rates.sampleSize, 6);
  assert.deepEqual(insights.volume, [{ month: '2026-06', count: 7 }]);
  assert.deepEqual(insights.categories, [
    { categoryId: analystCategory._id, name: 'Historical loans', count: 7 },
  ]);
});

test('suppresses the on-time rate for small samples and counts unknown return timing', async () => {
  const response = await smallLenderClient.request(`/insights?${JUNE_RANGE}`);
  assert.equal(response.status, 200);

  assert.equal(response.data.returns.total, 2);
  assert.equal(response.data.rates.onTime, null);
  assert.equal(response.data.rates.smallSample, true);
  assert.equal(response.data.rates.sampleSize, 2);
  // The legacy record is all-time, so it is not folded into a range's return timing.
  assert.equal(response.data.returns.missingTimestampClosed, 1);
  assert.equal(response.data.lent.total, 3);
});

test('rejects inverted, malformed and overlarge insight ranges', async () => {
  const inverted = await analystClient.request('/insights?from=2026-06-30&to=2026-06-01');
  assert.equal(inverted.status, 400);
  assert.match(inverted.data.message, /before the end date/i);

  const invalidDay = await analystClient.request('/insights?from=2026-06-01&to=2026-02-31');
  assert.equal(invalidDay.status, 400);
  assert.match(invalidDay.data.message, /end date/i);

  const tooWide = await analystClient.request('/insights?from=2022-01-01&to=2026-01-01');
  assert.equal(tooWide.status, 400);
  assert.match(tooWide.data.message, /three years or less/i);
});

test('exports a privacy-minimised CSV with formula injection neutralised', async () => {
  const response = await analystClient.request(`/insights/export?${JUNE_RANGE}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/csv/);
  assert.match(
    response.headers.get('content-disposition'),
    /lendloop-insights-2026-06-01-to-2026-06-30\.csv/,
  );
  assert.equal(typeof response.data, 'string');
  // Fetch's text decoder strips the UTF-8 BOM, so assert the decoded payload starts
  // with the header row and that the response advertises UTF-8.
  assert.match(response.headers.get('content-type'), /charset=utf-8/i);
  assert.match(response.data, /^"Item","Borrower","Linked account"/);

  const lines = response.data.split('\r\n');
  assert.equal(lines.length, 8);
  assert.match(lines[0], /"Item","Borrower","Linked account","Category"/);
  assert.ok(response.data.includes(`"'=SUM(1,2)"`));
  assert.ok(!response.data.includes('maya@example.test'));
  assert.ok(!response.data.includes('+91 98765'));
});

test('summarises scheduled, blocked, manual, off and failed reminders', async () => {
  const response = await reminderClient.request('/reminders/overview');
  assert.equal(response.status, 200);
  const overview = response.data;

  assert.deepEqual(overview.summary, {
    activeLoans: 4,
    armed: 1,
    scheduled: 1,
    dueSoon: 1,
    blocked: 1,
    manual: 1,
    off: 1,
    failed: 0,
    logged: 0,
    statusCounts: { sent: 0, preview: 0, link: 0, failed: 0 },
  });
  assert.equal(overview.upcoming.length, 1);
  assert.equal(overview.upcoming[0].itemName, 'Reminder active');
  assert.deepEqual(overview.upcoming[0].channels, ['email', 'whatsapp']);
  assert.ok(overview.upcoming[0].nextDueAt);
  assert.equal(overview.blocked.length, 1);
  assert.equal(overview.blocked[0].itemName, 'Reminder blocked');
  assert.ok(overview.blocked[0].missing.includes('Email consent not recorded'));
  assert.equal(overview.failed.length, 0);
  assert.equal(overview.recent.length, 0);

  const outsider = await outsiderClient.request('/reminders/overview');
  assert.equal(outsider.status, 200);
  assert.equal(outsider.data.summary.activeLoans, 0);
  assert.equal(outsider.data.summary.failed, 0);
});

test('logs manual sends honestly and exposes filters without delivery claims', async () => {
  const sent = await reminderClient.request(`/loans/${reminderLoans.active._id}/reminders`, {
    method: 'POST',
    body: { channels: ['email', 'whatsapp'] },
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.logs.length, 2);
  const emailLog = sent.data.logs.find((log) => log.channel === 'email');
  const whatsappLog = sent.data.logs.find((log) => log.channel === 'whatsapp');
  assert.equal(emailLog.status, 'preview');
  assert.equal(whatsappLog.status, 'link');
  assert.match(whatsappLog.link, /^https:\/\/wa\.me\//);
  assert.ok(!sent.data.logs.some((log) => log.status === 'sent'));
  sentLogs = { email: emailLog, whatsapp: whatsappLog };

  [failedLog] = await ReminderLog.create([
    {
      loanId: reminderLoans.active._id,
      lenderId: reminderLender._id,
      channel: 'email',
      mode: 'manual',
      recipient: 'consenting@example.test',
      subject: 'Failed reminder',
      body: 'This send failed.',
      status: 'failed',
      error: 'SMTP unavailable',
    },
  ]);

  const overview = await reminderClient.request('/reminders/overview');
  assert.equal(overview.status, 200);
  assert.equal(overview.data.summary.failed, 1);
  assert.equal(overview.data.summary.logged, 3);
  assert.deepEqual(overview.data.summary.statusCounts, {
    sent: 0,
    preview: 1,
    link: 1,
    failed: 1,
  });
  assert.equal(overview.data.failed.length, 1);
  assert.equal(overview.data.failed[0].error, 'SMTP unavailable');
  assert.equal(overview.data.recent.length, 3);

  const failedOnly = await reminderClient.request('/reminders?status=failed');
  assert.equal(failedOnly.status, 200);
  assert.equal(failedOnly.data.reminders.length, 1);
  assert.equal(failedOnly.data.limit, 100);

  const whatsappOnly = await reminderClient.request('/reminders?channel=whatsapp');
  assert.equal(whatsappOnly.data.reminders.length, 1);
  assert.equal(whatsappOnly.data.reminders[0].status, 'link');

  const automatic = await reminderClient.request('/reminders?mode=automatic');
  assert.equal(automatic.data.reminders.length, 0);

  const forLoan = await reminderClient.request(
    `/reminders?loanId=${reminderLoans.active._id}&mode=manual`,
  );
  assert.equal(forLoan.data.reminders.length, 3);

  const outsider = await outsiderClient.request('/reminders');
  assert.equal(outsider.data.reminders.length, 0);
});

test('retries only unsent attempts and never resends a preview or sent message', async () => {
  const rejected = await reminderClient.request(`/reminders/${sentLogs.email._id}/retry`, {
    method: 'POST',
  });
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.message, /failed reminder or a generated WhatsApp link/i);

  const linkRetry = await reminderClient.request(`/reminders/${sentLogs.whatsapp._id}/retry`, {
    method: 'POST',
  });
  assert.equal(linkRetry.status, 201);
  assert.equal(linkRetry.data.logs[0].status, 'link');
  assert.equal(linkRetry.data.retryOf, sentLogs.whatsapp._id);

  const failedRetry = await reminderClient.request(`/reminders/${failedLog._id}/retry`, {
    method: 'POST',
  });
  assert.equal(failedRetry.status, 201);
  assert.equal(failedRetry.data.logs[0].status, 'preview');
  assert.equal(failedRetry.data.logs[0].channel, 'email');
  assert.equal(failedRetry.data.retryOf, String(failedLog._id));

  const foreignRetry = await outsiderClient.request(`/reminders/${failedLog._id}/retry`, {
    method: 'POST',
  });
  assert.equal(foreignRetry.status, 404);

  const missing = await reminderClient.request('/reminders/000000000000000000000000/retry', {
    method: 'POST',
  });
  assert.equal(missing.status, 404);

  const overview = await reminderClient.request('/reminders/overview');
  assert.equal(overview.data.summary.statusCounts.failed, 1);
  assert.equal(overview.data.summary.logged, 5);

  const closed = await createReminderLoan({
    itemName: 'Closed reminder loan',
    dueDate: inDays(6),
  });
  const returned = await reminderClient.request(`/loans/${closed._id}/return`, {
    method: 'PATCH',
  });
  assert.equal(returned.status, 200);
  const [closedLog] = await ReminderLog.create([
    {
      loanId: closed._id,
      lenderId: reminderLender._id,
      channel: 'email',
      mode: 'manual',
      recipient: 'maya@example.test',
      body: 'Failed after close.',
      status: 'failed',
    },
  ]);
  const closedRetry = await reminderClient.request(`/reminders/${closedLog._id}/retry`, {
    method: 'POST',
  });
  assert.equal(closedRetry.status, 400);
  assert.match(closedRetry.data.message, /closed/i);
});
