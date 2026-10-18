import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import BorrowRequest from '../src/models/BorrowRequest.js';
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
let borrowerCategory;
let privateItem;
let requestItem;

before(async () => {
  ({ server, baseUrl } = await startTestServer());

  lenderClient = createClient(baseUrl);
  borrowerClient = createClient(baseUrl);
  outsiderClient = createClient(baseUrl);

  lender = await registerUser(lenderClient, { name: 'Lender A', email: uniqueEmail('lender-a') });
  borrower = await registerUser(borrowerClient, {
    name: 'Borrower B',
    email: uniqueEmail('borrower-b'),
    phone: '+91 91234 56780',
  });
  await registerUser(outsiderClient, { name: 'Outsider C', email: uniqueEmail('outsider-c') });

  lenderCategory = await createCategory(lenderClient, { name: 'Photography gear' });
  borrowerCategory = await createCategory(borrowerClient, { name: 'Borrower books' });

  privateItem = await createItem(lenderClient, lenderCategory._id, { title: 'Camera body' });
  requestItem = await createItem(lenderClient, lenderCategory._id, { title: 'Camping tent' });
});

after(async () => {
  await stopTestServer(server);
});

test('categories stay scoped to their owner while shared categories stay visible', async () => {
  const lenderList = await lenderClient.request('/categories');
  assert.equal(lenderList.status, 200);
  const lenderNames = lenderList.data.categories.map((category) => category.name);
  assert.ok(lenderNames.includes('Books & Notes'));
  assert.ok(lenderNames.includes('Photography gear'));
  assert.ok(!lenderNames.includes('Borrower books'));

  const borrowerList = await borrowerClient.request('/categories');
  assert.equal(borrowerList.status, 200);
  const borrowerNames = borrowerList.data.categories.map((category) => category.name);
  assert.ok(borrowerNames.includes('Books & Notes'));
  assert.ok(borrowerNames.includes('Borrower books'));
  assert.ok(!borrowerNames.includes('Photography gear'));

  const attemptUpdate = await borrowerClient.request(`/categories/${lenderCategory._id}`, {
    method: 'PATCH',
    body: { name: 'Hijacked category' },
  });
  assert.equal(attemptUpdate.status, 404);

  const attemptDelete = await borrowerClient.request(`/categories/${lenderCategory._id}`, {
    method: 'DELETE',
  });
  assert.equal(attemptDelete.status, 403);

  const sharedClash = await borrowerClient.request('/categories', {
    method: 'POST',
    body: { name: 'Books & Notes' },
  });
  assert.equal(sharedClash.status, 409);
});

test('items are publicly browsable but only mutable by their owner', async () => {
  const anonymous = createClient(baseUrl);
  const publicListing = await anonymous.request('/items');
  assert.equal(publicListing.status, 200);
  assert.ok(publicListing.data.items.some((item) => item._id === privateItem._id));
  assert.equal(publicListing.data.items.find((item) => item._id === privateItem._id).ownerId.name, 'Lender A');

  const publicDetail = await anonymous.request(`/items/${privateItem._id}`);
  assert.equal(publicDetail.status, 200);

  const foreignUpdate = await borrowerClient.request(`/items/${privateItem._id}`, {
    method: 'PATCH',
    body: { title: 'Stolen camera' },
  });
  assert.equal(foreignUpdate.status, 404);

  const foreignDelete = await borrowerClient.request(`/items/${privateItem._id}`, {
    method: 'DELETE',
  });
  assert.equal(foreignDelete.status, 404);

  const invisibleCategory = await borrowerClient.request('/items', {
    method: 'POST',
    body: {
      title: 'Wrong category item',
      description: 'This category belongs to another lender',
      categoryId: lenderCategory._id,
      condition: 'Good',
    },
  });
  assert.equal(invisibleCategory.status, 404);
});

test('owner can create, edit and delete an item and its category', async () => {
  const category = await createCategory(lenderClient, { name: 'Workshop tools' });
  const item = await createItem(lenderClient, category._id, { title: 'Work lamp' });

  const updated = await lenderClient.request(`/items/${item._id}`, {
    method: 'PATCH',
    body: { title: 'Workshop lamp', condition: 'Fair' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.item.title, 'Workshop lamp');
  assert.equal(updated.data.item.condition, 'Fair');

  const categoryInUse = await lenderClient.request(`/categories/${category._id}`, {
    method: 'DELETE',
  });
  assert.equal(categoryInUse.status, 409);
  assert.match(categoryInUse.data.message, /still used/i);

  const deletedItem = await lenderClient.request(`/items/${item._id}`, { method: 'DELETE' });
  assert.equal(deletedItem.status, 200);
  assert.equal(deletedItem.data.deleted, true);

  const deletedCategory = await lenderClient.request(`/categories/${category._id}`, {
    method: 'DELETE',
  });
  assert.equal(deletedCategory.status, 200);
  assert.equal(deletedCategory.data.deleted, true);
});

test('loans, history and reminder controls are hidden from other lenders', async () => {
  const created = await lenderClient.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(lenderCategory._id, { itemName: 'Lender projector' }),
  });
  assert.equal(created.status, 201);
  const loanId = created.data.loan._id;

  const borrowerRead = await borrowerClient.request(`/loans/${loanId}`);
  assert.equal(borrowerRead.status, 403);

  const borrowerHistory = await borrowerClient.request(`/loans/${loanId}/history`);
  assert.equal(borrowerHistory.status, 403);

  const borrowerDeadline = await borrowerClient.request(`/loans/${loanId}/deadline`, {
    method: 'PATCH',
    body: { dueDate: inDays(20) },
  });
  assert.equal(borrowerDeadline.status, 403);

  const borrowerReminder = await borrowerClient.request(`/loans/${loanId}/reminders`, {
    method: 'POST',
    body: { channels: ['email'] },
  });
  assert.equal(borrowerReminder.status, 403);

  const borrowerList = await borrowerClient.request('/loans');
  assert.equal(borrowerList.status, 200);
  assert.ok(!borrowerList.data.loans.some((loan) => loan._id === loanId));

  const lenderList = await lenderClient.request('/loans');
  assert.ok(lenderList.data.loans.some((loan) => loan._id === loanId));

  const foreignItemLoan = await borrowerClient.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(borrowerCategory._id, {
      itemId: privateItem._id,
      itemName: privateItem.title,
    }),
  });
  assert.equal(foreignItemLoan.status, 403);
  assert.match(foreignItemLoan.data.message, /own listings/i);
});

test('a registered borrower can follow an approved request without seeing the lender workspace', async () => {
  const borrowerRequest = await borrowerClient.request('/requests', {
    method: 'POST',
    body: { itemId: requestItem._id, requestedReturnDate: inDays(7), message: 'I can collect it' },
  });
  assert.equal(borrowerRequest.status, 201);
  const requestId = borrowerRequest.data.request._id;

  const outsiderRequest = await outsiderClient.request('/requests', {
    method: 'POST',
    body: { itemId: requestItem._id, requestedReturnDate: inDays(8) },
  });
  assert.equal(outsiderRequest.status, 201);

  const selfApprove = await borrowerClient.request(`/requests/${requestId}/approve`, {
    method: 'PATCH',
  });
  assert.equal(selfApprove.status, 403);

  const approval = await lenderClient.request(`/requests/${requestId}/approve`, {
    method: 'PATCH',
  });
  assert.equal(approval.status, 200);
  const loan = approval.data.loan;
  assert.equal(loan.status, 'active');
  assert.equal(String(loan.borrowerId?._id ?? loan.borrowerId), borrower._id);
  assert.equal(loan.borrower.phone, '+91 91234 56780');
  assert.equal(loan.borrower.name, 'Borrower B');

  const rejectedRequest = await BorrowRequest.findById(outsiderRequest.data.request._id);
  assert.equal(rejectedRequest.status, 'rejected');

  const borrowerRead = await borrowerClient.request(`/loans/${loan._id}`);
  assert.equal(borrowerRead.status, 200);
  assert.equal(borrowerRead.data.loan.itemName, 'Camping tent');

  const borrowerHistory = await borrowerClient.request(`/loans/${loan._id}/history`);
  assert.equal(borrowerHistory.status, 200);
  assert.ok(borrowerHistory.data.history.some((entry) => entry.kind === 'created'));

  const borrowedList = await borrowerClient.request('/loans?role=borrowed');
  assert.equal(borrowedList.status, 200);
  assert.ok(borrowedList.data.loans.some((entry) => entry._id === loan._id));

  const outsiderRead = await outsiderClient.request(`/loans/${loan._id}`);
  assert.equal(outsiderRead.status, 403);
  const outsiderHistory = await outsiderClient.request(`/loans/${loan._id}/history`);
  assert.equal(outsiderHistory.status, 403);

  const borrowerDeadline = await borrowerClient.request(`/loans/${loan._id}/deadline`, {
    method: 'PATCH',
    body: { dueDate: inDays(30) },
  });
  assert.equal(borrowerDeadline.status, 403);

  const borrowerReturn = await borrowerClient.request(`/loans/${loan._id}/return`, {
    method: 'PATCH',
  });
  assert.equal(borrowerReturn.status, 403);

  const lenderReturn = await lenderClient.request(`/loans/${loan._id}/return`, {
    method: 'PATCH',
  });
  assert.equal(lenderReturn.status, 200);
  assert.equal(lenderReturn.data.loan.status, 'returned');
});

test('reminder logs are scoped to the lender who sent them', async () => {
  const loanList = await lenderClient.request('/loans');
  const manualLoan = loanList.data.loans.find((loan) => loan.itemName === 'Lender projector');
  assert.ok(manualLoan);

  const sent = await lenderClient.request(`/loans/${manualLoan._id}/reminders`, {
    method: 'POST',
    body: { channels: ['email'] },
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.logs.length, 1);
  assert.match(sent.data.logs[0].status, /preview/i);

  const lenderLogs = await lenderClient.request('/reminders');
  assert.equal(lenderLogs.status, 200);
  assert.ok(lenderLogs.data.reminders.some((log) => String(log.loanId?._id ?? log.loanId) === manualLoan._id));

  const borrowerLogs = await borrowerClient.request('/reminders');
  assert.equal(borrowerLogs.status, 200);
  assert.equal(borrowerLogs.data.reminders.length, 0);

  const outsiderLogs = await outsiderClient.request('/reminders');
  assert.equal(outsiderLogs.status, 200);
  assert.equal(outsiderLogs.data.reminders.length, 0);
});

test('borrower context counts only account-linked loans and never merges manual entries', async () => {
  const contextItem = await createItem(lenderClient, lenderCategory._id, {
    title: 'Borrower context lamp',
  });
  const request = await borrowerClient.request('/requests', {
    method: 'POST',
    body: { itemId: contextItem._id, requestedReturnDate: inDays(12) },
  });
  assert.equal(request.status, 201);

  const approval = await lenderClient.request(`/requests/${request.data.request._id}/approve`, {
    method: 'PATCH',
  });
  assert.equal(approval.status, 200);
  const linkedLoanId = approval.data.loan._id;
  assert.equal(approval.data.loan.borrowerId.name, 'Borrower B');

  // Same name and email, but without an account link this entry must stay isolated.
  const manual = await lenderClient.request('/loans', {
    method: 'POST',
    body: manualLoanPayload(lenderCategory._id, {
      itemName: 'Manual entry using the same name',
      borrower: {
        name: 'Borrower B',
        email: borrower.email,
        phone: '+91 91234 56780',
        consent: { email: true, whatsapp: false },
      },
    }),
  });
  assert.equal(manual.status, 201);

  const detail = await lenderClient.request(`/loans/${linkedLoanId}`);
  assert.equal(detail.status, 200);
  const context = detail.data.loan.borrowerContext;
  assert.equal(context.linked, true);
  assert.equal(context.email, borrower.email);
  assert.equal(context.phone, '+91 91234 56780');
  // The earlier camping-tent loan was returned; the same-name manual entry is not counted.
  assert.equal(context.priorLoans, 1);
  assert.equal(context.activeLoans, 0);
  assert.equal(context.overdueLoans, 0);
  assert.ok(context.lastLentAt);

  const manualDetail = await lenderClient.request(`/loans/${manual.data.loan._id}`);
  assert.equal(manualDetail.status, 200);
  assert.equal(manualDetail.data.loan.borrowerContext.linked, false);
  assert.equal(manualDetail.data.loan.borrowerContext.priorLoans, undefined);

  const borrowerDetail = await borrowerClient.request(`/loans/${linkedLoanId}`);
  assert.equal(borrowerDetail.status, 200);
  assert.equal(borrowerDetail.data.loan.borrowerContext, undefined);
});
