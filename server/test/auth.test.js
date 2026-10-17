import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import BorrowRequest from '../src/models/BorrowRequest.js';
import Item from '../src/models/Item.js';
import Loan from '../src/models/Loan.js';
import LoanHistory from '../src/models/LoanHistory.js';
import ReminderLog from '../src/models/ReminderLog.js';
import User from '../src/models/User.js';
import {
  TEST_PASSWORD,
  createCategory,
  createClient,
  createItem,
  inDays,
  registerUser,
  startTestServer,
  stopTestServer,
  uniqueEmail,
} from './helpers.js';

let server;
let baseUrl;

before(async () => {
  ({ server, baseUrl } = await startTestServer());
});

after(async () => {
  await stopTestServer(server);
});

test('registers a user, hashes the password and returns only public fields', async () => {
  const client = createClient(baseUrl);
  const email = uniqueEmail('rahul');
  const response = await client.request('/auth/register', {
    method: 'POST',
    body: { name: 'Rahul Sharma', email: `  ${email.toUpperCase()}  `, password: TEST_PASSWORD, phone: '  +91 98765 43210  ' },
  });

  assert.equal(response.status, 201);
  const { user } = response.data;
  assert.deepEqual(Object.keys(user).sort(), [
    '_id',
    'createdAt',
    'email',
    'name',
    'preferences',
    'profile',
    'updatedAt',
  ]);
  assert.equal(user.name, 'Rahul Sharma');
  assert.equal(user.email, email);
  assert.equal(user.profile.phone, '+91 98765 43210');
  assert.deepEqual(user.preferences, {
    defaultReminderChannel: 'email',
    emailNotifications: true,
    whatsappNotifications: false,
  });
  assert.ok(!JSON.stringify(response.data).includes('passwordHash'));

  const stored = await User.findOne({ email }).select('+passwordHash');
  assert.ok(stored);
  assert.match(stored.passwordHash, /^\$2[aby]\$/);
  assert.notEqual(stored.passwordHash, TEST_PASSWORD);
  assert.equal(await stored.matchPassword(TEST_PASSWORD), true);

  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('lendloop_token='));
  assert.ok(setCookie);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.doesNotMatch(setCookie, /Secure/i);

  const me = await client.request('/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user._id, user._id);
  assert.ok(!JSON.stringify(me.data).includes('passwordHash'));
});

test('rejects duplicate email addresses regardless of case', async () => {
  const firstClient = createClient(baseUrl);
  const email = uniqueEmail('duplicate');
  await registerUser(firstClient, { email });

  const secondClient = createClient(baseUrl);
  const response = await secondClient.request('/auth/register', {
    method: 'POST',
    body: { name: 'Someone Else', email: email.toUpperCase(), password: TEST_PASSWORD },
  });

  assert.equal(response.status, 409);
  assert.match(response.data.message, /already exists/i);
  assert.equal(await User.countDocuments({ email }), 1);
});

test('rejects invalid registration input with clear messages', async () => {
  const client = createClient(baseUrl);
  const cases = [
    {
      body: { name: 'Valid Name', email: 'not-an-email', password: TEST_PASSWORD },
      pattern: /valid email/i,
    },
    {
      body: { name: 'Valid Name', email: uniqueEmail('short'), password: 'short' },
      pattern: /at least 8/i,
    },
    { body: { name: '', email: uniqueEmail('name'), password: TEST_PASSWORD }, pattern: /required/i },
    {
      body: { name: 'Valid Name', email: uniqueEmail('phone'), password: TEST_PASSWORD, phone: '1'.repeat(30) },
      pattern: /at most 24/i,
    },
  ];

  for (const { body, pattern } of cases) {
    const response = await client.request('/auth/register', { method: 'POST', body });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.match(response.data.message, pattern);
  }
});

test('logs in, restores a session from the cookie and logs out', async () => {
  const email = uniqueEmail('login');
  const owner = createClient(baseUrl);
  await registerUser(owner, { email });

  const client = createClient(baseUrl);
  const wrongPassword = await client.request('/auth/login', {
    method: 'POST',
    body: { email, password: 'definitely-wrong' },
  });
  assert.equal(wrongPassword.status, 401);
  assert.match(wrongPassword.data.message, /invalid email or password/i);

  const unknown = await client.request('/auth/login', {
    method: 'POST',
    body: { email: uniqueEmail('missing'), password: TEST_PASSWORD },
  });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.data.message, wrongPassword.data.message);

  const login = await client.request('/auth/login', {
    method: 'POST',
    body: { email: email.toUpperCase(), password: TEST_PASSWORD },
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.email, email);
  assert.ok(client.cookie);

  // A fresh tab/server read with the same cookie stays signed in.
  const refreshed = createClient(baseUrl);
  refreshed.setCookie(client.cookie);
  const me = await refreshed.request('/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, email);

  const logout = await client.request('/auth/logout', { method: 'POST' });
  assert.equal(logout.status, 200);
  const afterLogout = await client.request('/auth/me');
  assert.equal(afterLogout.status, 401);
});

test('updates profile details and reminder preferences', async () => {
  const client = createClient(baseUrl);
  const account = await registerUser(client, { name: 'Rahul Sharma', phone: '+91 90000 00000' });

  const valid = await client.request('/users/me', {
    method: 'PATCH',
    body: {
      name: 'Rahul S.',
      profile: { phone: '+91 91111 11111', avatarUrl: 'https://images.example.test/rahul.png' },
      preferences: {
        defaultReminderChannel: 'whatsapp',
        emailNotifications: false,
        whatsappNotifications: true,
      },
    },
  });

  assert.equal(valid.status, 200);
  assert.equal(valid.data.user.name, 'Rahul S.');
  assert.equal(valid.data.user.profile.phone, '+91 91111 11111');
  assert.equal(valid.data.user.profile.avatarUrl, 'https://images.example.test/rahul.png');
  assert.deepEqual(valid.data.user.preferences, {
    defaultReminderChannel: 'whatsapp',
    emailNotifications: false,
    whatsappNotifications: true,
  });
  assert.ok(!JSON.stringify(valid.data).includes('passwordHash'));

  const stored = await User.findById(account._id).select('+passwordHash');
  assert.equal(stored.profile.phone, '+91 91111 11111');
  assert.equal(stored.preferences.defaultReminderChannel, 'whatsapp');

  const invalidAvatar = await client.request('/users/me', {
    method: 'PATCH',
    body: { profile: { avatarUrl: 'javascript:alert(1)' } },
  });
  assert.equal(invalidAvatar.status, 400);
  assert.match(invalidAvatar.data.message, /http or https/i);

  const invalidChannel = await client.request('/users/me', {
    method: 'PATCH',
    body: { preferences: { defaultReminderChannel: 'carrier-pigeon' } },
  });
  assert.equal(invalidChannel.status, 400);

  const invalidBoolean = await client.request('/users/me', {
    method: 'PATCH',
    body: { preferences: { emailNotifications: 'yes' } },
  });
  assert.equal(invalidBoolean.status, 400);

  const read = await client.request('/users/me');
  assert.equal(read.status, 200);
  assert.equal(read.data.user.profile.phone, '+91 91111 11111');
  assert.equal(await stored.matchPassword(TEST_PASSWORD), true);
});

test('changes the password only after verifying the current one and revokes older sessions', async () => {
  const email = uniqueEmail('password');
  const primary = createClient(baseUrl);
  await registerUser(primary, { email });

  const otherSession = createClient(baseUrl);
  const otherLogin = await otherSession.request('/auth/login', {
    method: 'POST',
    body: { email, password: TEST_PASSWORD },
  });
  assert.equal(otherLogin.status, 200);
  assert.equal((await otherSession.request('/auth/me')).status, 200);

  const wrongCurrent = await primary.request('/users/me/password', {
    method: 'PATCH',
    body: { currentPassword: 'not-the-password', newPassword: 'A-new-passphrase-456' },
  });
  assert.equal(wrongCurrent.status, 400);
  assert.match(wrongCurrent.data.message, /current password/i);

  const reused = await primary.request('/users/me/password', {
    method: 'PATCH',
    body: { currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD },
  });
  assert.equal(reused.status, 400);
  assert.match(reused.data.message, /different/i);

  const changed = await primary.request('/users/me/password', {
    method: 'PATCH',
    body: { currentPassword: TEST_PASSWORD, newPassword: 'A-new-passphrase-456' },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.user.email, email);
  assert.equal((await primary.request('/auth/me')).status, 200);

  const staleSession = await otherSession.request('/auth/me');
  assert.equal(staleSession.status, 401);
  assert.match(staleSession.data.message, /log in again/i);

  const oldPassword = await createClient(baseUrl).request('/auth/login', {
    method: 'POST',
    body: { email, password: TEST_PASSWORD },
  });
  assert.equal(oldPassword.status, 401);

  const newPassword = await createClient(baseUrl).request('/auth/login', {
    method: 'POST',
    body: { email, password: 'A-new-passphrase-456' },
  });
  assert.equal(newPassword.status, 200);
});

test('deleting an account requires confirmation, blocks active loans and anonymises history', async () => {
  const lenderClient = createClient(baseUrl);
  const lender = await registerUser(lenderClient, {
    name: 'Rahul Sharma',
    email: uniqueEmail('delete-lender'),
    phone: '+91 90000 00000',
  });
  const borrowerClient = createClient(baseUrl);
  const borrower = await registerUser(borrowerClient, {
    name: 'Maya Patel',
    email: uniqueEmail('keep-borrower'),
    phone: '+91 98888 88888',
  });

  const category = await createCategory(lenderClient, { name: 'Camping gear' });
  const loanedItem = await createItem(lenderClient, category._id, { title: 'Camping stove' });
  const pendingItem = await createItem(lenderClient, category._id, { title: 'Camping lantern' });

  const approvedRequest = await borrowerClient.request('/requests', {
    method: 'POST',
    body: { itemId: loanedItem._id, requestedReturnDate: inDays(7), message: 'Trip next week' },
  });
  assert.equal(approvedRequest.status, 201);
  const pendingRequest = await borrowerClient.request('/requests', {
    method: 'POST',
    body: { itemId: pendingItem._id, requestedReturnDate: inDays(10) },
  });
  assert.equal(pendingRequest.status, 201);

  const approved = await lenderClient.request(
    `/requests/${approvedRequest.data.request._id}/approve`,
    { method: 'PATCH' },
  );
  assert.equal(approved.status, 200);
  const loanId = approved.data.loan._id;
  assert.equal(approved.data.loan.status, 'active');

  const wrongWord = await lenderClient.request('/users/me', {
    method: 'DELETE',
    body: { password: TEST_PASSWORD, confirmation: 'please delete' },
  });
  assert.equal(wrongWord.status, 400);
  assert.match(wrongWord.data.message, /type delete/i);

  const wrongPassword = await lenderClient.request('/users/me', {
    method: 'DELETE',
    body: { password: 'not-my-password', confirmation: 'DELETE' },
  });
  assert.equal(wrongPassword.status, 400);
  assert.match(wrongPassword.data.message, /password is incorrect/i);

  const blocked = await lenderClient.request('/users/me', {
    method: 'DELETE',
    body: { password: TEST_PASSWORD, confirmation: 'DELETE' },
  });
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.message, /active loan/i);

  const returned = await lenderClient.request(`/loans/${loanId}/return`, {
    method: 'PATCH',
    body: { reason: 'Returned before deleting the account' },
  });
  assert.equal(returned.status, 200);
  assert.equal(returned.data.loan.status, 'returned');

  const deleted = await lenderClient.request('/users/me', {
    method: 'DELETE',
    body: { password: TEST_PASSWORD, confirmation: 'delete' },
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.deleted, true);
  assert.equal((await lenderClient.request('/auth/me')).status, 401);

  const loginAgain = await createClient(baseUrl).request('/auth/login', {
    method: 'POST',
    body: { email: lender.email, password: TEST_PASSWORD },
  });
  assert.equal(loginAgain.status, 401);

  const tombstone = await User.findById(lender._id).select('+passwordHash');
  assert.ok(tombstone);
  assert.ok(tombstone.deletedAt instanceof Date);
  assert.equal(tombstone.name, 'Deleted account');
  assert.match(tombstone.email, /^deleted-[a-f0-9]{24}@deleted\.lendloop\.invalid$/);
  assert.equal(tombstone.profile.phone, '');
  assert.equal(tombstone.profile.avatarUrl, '');
  assert.equal(tombstone.preferences.emailNotifications, true);
  assert.equal(await tombstone.matchPassword(TEST_PASSWORD), false);

  const items = await Item.find({ ownerId: lender._id });
  assert.equal(items.length, 2);
  assert.ok(items.every((item) => item.status === 'archived'));

  const pending = await BorrowRequest.findById(pendingRequest.data.request._id);
  assert.equal(pending.status, 'cancelled');

  const historicalLoan = await Loan.findById(loanId);
  assert.equal(historicalLoan.status, 'returned');
  assert.equal(String(historicalLoan.lenderId), lender._id);
  assert.equal(String(historicalLoan.borrowerId), borrower._id);

  const borrowerView = await borrowerClient.request(`/loans/${loanId}`);
  assert.equal(borrowerView.status, 200);
  assert.equal(borrowerView.data.loan.status, 'returned');
  assert.equal(borrowerView.data.loan.lenderId.name, 'Deleted account');

  const history = await borrowerClient.request(`/loans/${loanId}/history`);
  assert.equal(history.status, 200);
  assert.ok(history.data.history.length > 0);

  const borrowedList = await borrowerClient.request('/loans?role=borrowed');
  assert.equal(borrowedList.status, 200);
  assert.ok(borrowedList.data.loans.some((loan) => loan._id === loanId));
});

test('deleting a borrower scrubs their details from retained loan records', async () => {
  const lenderClient = createClient(baseUrl);
  await registerUser(lenderClient, {
    name: 'Imran Khan',
    email: uniqueEmail('scrub-lender'),
    phone: '+91 90000 11111',
  });
  const borrowerClient = createClient(baseUrl);
  const borrowerName = 'Nisha Rao';
  const borrowerEmail = uniqueEmail('scrub-borrower');
  const borrowerPhone = '+91 97777 66666';
  const borrower = await registerUser(borrowerClient, {
    name: borrowerName,
    email: borrowerEmail,
    phone: borrowerPhone,
  });

  const category = await createCategory(lenderClient, { name: 'Photography' });
  const item = await createItem(lenderClient, category._id, { title: 'Camera lens' });

  const requested = await borrowerClient.request('/requests', {
    method: 'POST',
    body: {
      itemId: item._id,
      requestedReturnDate: inDays(7),
      message: `Please lend the lens to ${borrowerName}`,
    },
  });
  assert.equal(requested.status, 201);
  const approved = await lenderClient.request(
    `/requests/${requested.data.request._id}/approve`,
    { method: 'PATCH' },
  );
  assert.equal(approved.status, 200);
  const loanId = approved.data.loan._id;

  const reminded = await lenderClient.request(`/loans/${loanId}/reminders`, {
    method: 'POST',
    body: {
      channels: ['email'],
      templateMode: 'custom',
      message: `Hi ${borrowerName}, please return the lens next week.`,
    },
  });
  assert.equal(reminded.status, 201);
  assert.equal(reminded.data.logs[0].status, 'preview');
  assert.ok(reminded.data.logs[0].body.includes(borrowerName));

  // Changing the borrower creates a history snapshot that also contains the old details.
  const changedName = 'Nisha R.';
  const changedEmail = uniqueEmail('scrub-borrower-updated');
  const changed = await lenderClient.request(`/loans/${loanId}`, {
    method: 'PATCH',
    body: { borrower: { name: changedName, email: changedEmail } },
  });
  assert.equal(changed.status, 200);

  const returned = await lenderClient.request(`/loans/${loanId}/return`, {
    method: 'PATCH',
    body: { reason: 'Back in the cabinet' },
  });
  assert.equal(returned.status, 200);

  const deleted = await borrowerClient.request('/users/me', {
    method: 'DELETE',
    body: { password: TEST_PASSWORD, confirmation: 'DELETE' },
  });
  assert.equal(deleted.status, 200);
  assert.equal((await borrowerClient.request('/auth/me')).status, 401);

  const relogin = await createClient(baseUrl).request('/auth/login', {
    method: 'POST',
    body: { email: borrowerEmail, password: TEST_PASSWORD },
  });
  assert.equal(relogin.status, 401);

  const loan = await Loan.findById(loanId).lean();
  assert.equal(loan.status, 'returned');
  assert.equal(String(loan.borrowerId), borrower._id);
  assert.equal(loan.borrower.name, 'Deleted account');
  assert.equal(loan.borrower.email, '');
  assert.equal(loan.borrower.phone, '');
  assert.equal(loan.borrower.consent.email, false);
  assert.equal(loan.borrower.consent.whatsapp, false);
  assert.equal(loan.borrower.consent.note, '');

  const logs = await ReminderLog.find({ loanId }).lean();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 'preview');
  assert.equal(logs[0].recipient, 'deleted account');
  assert.equal(logs[0].link, '');

  const history = await LoanHistory.find({ loanId }).lean();
  assert.ok(history.some((entry) => entry.kind === 'borrower'));

  const request = await BorrowRequest.findById(requested.data.request._id).lean();
  assert.equal(request.status, 'approved');
  assert.equal(request.message, '');

  const retainedText = JSON.stringify({ loan, logs, history, request });
  for (const value of [borrowerName, changedName, borrowerEmail, changedEmail, borrowerPhone]) {
    assert.ok(!retainedText.includes(value), `retained records still contain ${value}`);
  }

  const lenderView = await lenderClient.request(`/loans/${loanId}`);
  assert.equal(lenderView.status, 200);
  assert.equal(lenderView.data.loan.borrower.name, 'Deleted account');
  assert.equal(lenderView.data.loan.borrower.email, '');

  const historyView = await lenderClient.request(`/loans/${loanId}/history`);
  assert.equal(historyView.status, 200);
  assert.ok(historyView.data.history.length > 0);
  assert.ok(!JSON.stringify(historyView.data).includes(borrowerName));
});
