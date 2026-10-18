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
let lenderClient;
let borrowerClient;
let outsiderClient;
let lender;
let borrower;
let lenderCategory;
let otherCategory;
let bookings;
let secondItem;

function atDays(days, hour = 12) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

function dateOnly(days) {
  return atDays(days).slice(0, 10);
}

async function createManualLoan(client, categoryId, overrides = {}) {
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

before(async () => {
  ({ server, baseUrl } = await startTestServer());

  lenderClient = createClient(baseUrl);
  borrowerClient = createClient(baseUrl);
  outsiderClient = createClient(baseUrl);

  lender = await registerUser(lenderClient, {
    name: 'View Lender',
    email: uniqueEmail('view-lender'),
  });
  borrower = await registerUser(borrowerClient, {
    name: 'Borrower B',
    email: uniqueEmail('borrower-b'),
    phone: '+91 90000 12345',
  });
  await registerUser(outsiderClient, {
    name: 'Outsider O',
    email: uniqueEmail('outsider-o'),
  });

  lenderCategory = await createCategory(lenderClient, { name: 'Camera gear' });
  otherCategory = await createCategory(lenderClient, { name: 'Outdoor gear' });
  bookings = {
    overdue: await createManualLoan(lenderClient, lenderCategory._id, {
      itemName: 'Overdue projector',
      priority: 'low',
      lentAt: atDays(-10),
      dueDate: atDays(-2),
    }),
    upcoming: await createManualLoan(lenderClient, otherCategory._id, {
      itemName: 'Upcoming speaker',
      priority: 'high',
      lentAt: atDays(-3),
      dueDate: atDays(2),
    }),
    distant: await createManualLoan(lenderClient, otherCategory._id, {
      itemName: 'Distant ladder',
      priority: 'medium',
      lentAt: atDays(-1),
      dueDate: atDays(10),
    }),
  };

  const returned = await createManualLoan(lenderClient, lenderCategory._id, {
    itemName: 'Returned camera',
    priority: 'medium',
    lentAt: atDays(-8),
    dueDate: atDays(-1),
  });
  const closed = await lenderClient.request(`/loans/${returned._id}/return`, {
    method: 'PATCH',
    body: { returnedAt: atDays(-1) },
  });
  assert.equal(closed.status, 200);
  bookings.returned = closed.data.loan;

  const firstItem = await createItem(lenderClient, lenderCategory._id, { title: 'Request tent' });
  secondItem = await createItem(lenderClient, lenderCategory._id, { title: 'Request kayak' });
  bookings.firstItemId = firstItem._id;
});

after(async () => {
  await stopTestServer(server);
});

test('reports health with security headers and keeps unknown API routes as JSON', async () => {
  const health = await lenderClient.request('/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.data, { status: 'ok', database: 'up' });
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('x-frame-options'), 'DENY');
  assert.equal(health.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(health.headers.get('x-powered-by'), null);

  const missing = await lenderClient.request('/does-not-exist');
  assert.equal(missing.status, 404);
  assert.match(missing.data.message, /Route not found/i);
});

test('sorts lent loans by attention and priority, and decorates aggregation rows', async () => {
  const attention = await lenderClient.request('/loans?role=lent&sort=attention');
  assert.equal(attention.status, 200);
  assert.deepEqual(
    attention.data.loans.map((loan) => loan.itemName),
    ['Overdue projector', 'Upcoming speaker', 'Distant ladder', 'Returned camera'],
  );
  const overdueRow = attention.data.loans[0];
  assert.equal(overdueRow.isOverdue, true);
  assert.ok(Array.isArray(overdueRow.deliveryChannels));

  const byPriority = await lenderClient.request('/loans?role=lent&sort=priority');
  assert.equal(byPriority.status, 200);
  assert.deepEqual(
    byPriority.data.loans.map((loan) => loan.itemName),
    ['Upcoming speaker', 'Distant ladder', 'Returned camera', 'Overdue projector'],
  );

  const byDue = await lenderClient.request('/loans?role=lent&sort=due');
  assert.deepEqual(
    byDue.data.loans.map((loan) => loan.itemName),
    ['Overdue projector', 'Returned camera', 'Upcoming speaker', 'Distant ladder'],
  );
});

test('filters lent loans by inclusive date range, category and overdue state', async () => {
  const sameDay = await lenderClient.request(
    `/loans?role=lent&from=${dateOnly(-8)}&to=${dateOnly(-8)}`,
  );
  assert.equal(sameDay.status, 200);
  assert.deepEqual(
    sameDay.data.loans.map((loan) => loan.itemName),
    ['Returned camera'],
  );

  const window = await lenderClient.request(
    `/loans?role=lent&from=${dateOnly(-10)}&to=${dateOnly(-8)}&sort=due`,
  );
  assert.deepEqual(
    window.data.loans.map((loan) => loan.itemName),
    ['Overdue projector', 'Returned camera'],
  );

  const category = await lenderClient.request(
    `/loans?role=lent&sort=due&categoryId=${lenderCategory._id}`,
  );
  assert.deepEqual(
    category.data.loans.map((loan) => loan.itemName),
    ['Overdue projector', 'Returned camera'],
  );

  const combined = await lenderClient.request(
    `/loans?role=lent&from=${dateOnly(-3)}&to=${dateOnly(-1)}&categoryId=${otherCategory._id}`,
  );
  assert.deepEqual(
    combined.data.loans.map((loan) => loan.itemName),
    ['Upcoming speaker', 'Distant ladder'],
  );

  const overdue = await lenderClient.request('/loans?role=lent&overdue=true');
  assert.deepEqual(
    overdue.data.loans.map((loan) => loan.itemName),
    ['Overdue projector'],
  );
  assert.ok(overdue.data.loans.every((loan) => loan.status === 'active'));
});

test('filters requests by item and reports prior history only from the lender own loans', async () => {
  const request = await borrowerClient.request('/requests', {
    method: 'POST',
    body: {
      itemId: bookings.firstItemId,
      requestedReturnDate: inDays(7),
      message: 'Could I borrow this?',
    },
  });
  assert.equal(request.status, 201);
  bookings.firstRequestId = request.data.request._id;

  const beforeApproval = await lenderClient.request('/requests/incoming');
  assert.equal(beforeApproval.status, 200);
  const pending = beforeApproval.data.requests.find(
    (entry) => entry._id === bookings.firstRequestId,
  );
  assert.ok(pending);
  assert.equal(pending.borrowerHistory.linked, true);
  assert.equal(pending.borrowerHistory.priorLoans, 0);

  const invisible = await outsiderClient.request('/requests/incoming');
  assert.equal(invisible.status, 200);
  assert.ok(!invisible.data.requests.some((entry) => entry._id === bookings.firstRequestId));

  const approval = await lenderClient.request(`/requests/${bookings.firstRequestId}/approve`, {
    method: 'PATCH',
  });
  assert.equal(approval.status, 200);
  assert.equal(String(approval.data.loan.borrowerId?._id ?? approval.data.loan.borrowerId), borrower._id);

  const second = await borrowerClient.request('/requests', {
    method: 'POST',
    body: { itemId: secondItem._id, requestedReturnDate: inDays(9) },
  });
  assert.equal(second.status, 201);
  const secondRequestId = second.data.request._id;

  const filtered = await lenderClient.request(`/requests/incoming?itemId=${secondItem._id}`);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.data.requests.length, 1);
  assert.equal(filtered.data.requests[0]._id, secondRequestId);
  assert.equal(filtered.data.requests[0].borrowerHistory.priorLoans, 1);

  const approvedOnly = await lenderClient.request(
    `/requests/incoming?status=approved&itemId=${bookings.firstItemId}`,
  );
  assert.equal(approvedOnly.data.requests.length, 1);
  assert.equal(approvedOnly.data.requests[0].status, 'approved');

  const outgoing = await borrowerClient.request(
    `/requests/outgoing?itemId=${bookings.firstItemId}`,
  );
  assert.equal(outgoing.status, 200);
  assert.equal(outgoing.data.requests.length, 1);
  assert.equal(outgoing.data.requests[0].status, 'approved');

  const noMatch = await lenderClient.request('/requests/incoming?itemId=000000000000000000000000');
  assert.equal(noMatch.status, 200);
  assert.equal(noMatch.data.requests.length, 0);
});

test('keeps borrow relationships private and never merges manual snapshots', async () => {
  const beforeManual = await lenderClient.request(`/borrowers/${borrower._id}`);
  assert.equal(beforeManual.status, 200);
  assert.equal(beforeManual.data.borrower.linked, true);
  assert.equal(beforeManual.data.loans.length, 1);
  assert.equal(beforeManual.data.borrower.totalLoans, 1);

  const outsiderView = await outsiderClient.request(`/borrowers/${borrower._id}`);
  assert.equal(outsiderView.status, 404);

  const selfView = await borrowerClient.request(`/borrowers/${borrower._id}`);
  assert.equal(selfView.status, 404);

  // Same name, email and phone as the account, but recorded without an account link.
  const snapshot = await lenderClient.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(lenderCategory._id, {
      itemName: 'Same-name manual snapshot',
      reminders: { enabled: false, frequency: 'manual' },
      borrower: {
        name: 'Borrower B',
        email: borrower.email,
        phone: '+91 90000 12345',
      },
    }),
  });
  assert.equal(snapshot.status, 201);
  assert.equal(snapshot.data.loan.borrowerId, null);

  const afterManual = await lenderClient.request(`/borrowers/${borrower._id}`);
  assert.equal(afterManual.status, 200);
  assert.equal(afterManual.data.loans.length, 1);
  assert.ok(!afterManual.data.loans.some((loan) => loan.itemName === 'Same-name manual snapshot'));

  const directory = await lenderClient.request('/borrowers');
  assert.equal(directory.status, 200);
  const linked = directory.data.borrowers.find((entry) => entry.borrowerId === borrower._id);
  assert.ok(linked);
  assert.equal(linked.totalLoans, 1);
  assert.equal(linked.name, 'Borrower B');

  const manualMatches = directory.data.manualEntries.filter(
    (entry) => entry.name === 'Borrower B',
  );
  assert.equal(manualMatches.length, 1);
  assert.match(manualMatches[0].key, /^manual:/);
  assert.ok(directory.data.manualEntries.every((entry) => entry.linked === false));

  const searched = await lenderClient.request('/borrowers?q=Borrower%20B');
  assert.equal(searched.status, 200);
  assert.equal(searched.data.borrowers.length, 1);
  assert.equal(searched.data.manualEntries.length, 1);
});

test('requires a prior relationship before linking an account to another entry', async () => {
  const outsiderCategory = await createCategory(outsiderClient, { name: 'Outsider bits' });
  const denied = await outsiderClient.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(outsiderCategory._id, {
      itemName: 'Unrelated linked entry',
      borrowerId: borrower._id,
    }),
  });
  assert.equal(denied.status, 403);
  assert.match(denied.data.message, /lent to before/i);

  const linked = await lenderClient.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(lenderCategory._id, {
      itemName: 'Repeat linked entry',
      borrowerId: borrower._id,
      reminders: { enabled: false, frequency: 'manual' },
      borrower: { name: 'Ignored snapshot', email: 'ignored@example.test' },
    }),
  });
  assert.equal(linked.status, 201);
  assert.equal(String(linked.data.loan.borrowerId._id), borrower._id);
  assert.equal(linked.data.loan.borrower.name, 'Borrower B');
  assert.equal(linked.data.loan.borrower.email, borrower.email);

  const filtered = await lenderClient.request(`/loans?role=lent&borrowerId=${borrower._id}`);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.data.loans.length, 2);
  assert.ok(filtered.data.loans.every((loan) => String(loan.borrowerId._id) === borrower._id));

  const selfLink = await lenderClient.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(lenderCategory._id, { itemName: 'Self loan', borrowerId: lender._id }),
  });
  assert.equal(selfLink.status, 400);
  assert.match(selfLink.data.message, /yourself/i);

  const missing = await lenderClient.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(lenderCategory._id, {
      itemName: 'Missing borrower',
      borrowerId: '000000000000000000000000',
    }),
  });
  assert.equal(missing.status, 404);

  const detail = await lenderClient.request(`/borrowers/${borrower._id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.borrower.totalLoans, 2);
  assert.equal(detail.data.borrower.activeLoans, 2);
  assert.equal(detail.data.loans.length, 2);
  assert.ok(detail.data.loans.every((loan) => loan.borrowerId));
});
