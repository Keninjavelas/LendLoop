import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });

process.env.NODE_ENV = 'test';
process.env.MAIL_DRIVER = 'preview';
process.env.REMINDER_SCHEDULER_ENABLED = 'false';
// Keep the suite independent of request volume; the limiter itself is unit-tested.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
// Never inherit the deployment signing key into a test run.
process.env.JWT_SECRET = 'lendloop-test-secret-never-use-in-deployment';

export const TEST_PASSWORD = 'LendLoop-test-pass-123';

const testUri = process.env.MONGODB_URI_TEST;

function databaseNameOf(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i.exec(uri);
  return match ? decodeURIComponent(match[1]) : '';
}

const databaseName = testUri ? databaseNameOf(testUri) : '';

if (!testUri) {
  throw new Error(
    'MONGODB_URI_TEST is not set. Point it at a dedicated test database, e.g. mongodb://localhost:27017/lendloop_test?replicaSet=rs0',
  );
}
if (!databaseName.endsWith('_test')) {
  throw new Error(`Refusing to run tests against "${databaseName || 'unknown'}" - the database name must end in _test`);
}
if (testUri === process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI_TEST must not be the same database as MONGODB_URI');
}

let userSequence = 0;

export function uniqueEmail(prefix = 'user') {
  userSequence += 1;
  return `${prefix}.${userSequence}.${Date.now()}@example.test`;
}

export function inDays(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function startTestServer() {
  // Import the app before connecting so every model is registered for index setup.
  const { createApp } = await import('../src/app.js');
  const { seedDefaults } = await import('../src/config/seedDefaults.js');

  await mongoose.connect(testUri);
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
  await seedDefaults();

  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  return { server, baseUrl: `http://127.0.0.1:${port}/api` };
}

export async function stopTestServer(server) {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}

export function createClient(baseUrl) {
  let cookie = '';

  async function request(pathname, { method = 'GET', body, headers = {} } = {}) {
    const requestHeaders = { ...headers };
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    if (cookie) requestHeaders.Cookie = cookie;

    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (typeof response.headers.getSetCookie === 'function') {
      for (const value of response.headers.getSetCookie()) {
        const [pair] = value.split(';');
        const separator = pair.indexOf('=');
        if (separator === -1) continue;
        const name = pair.slice(0, separator).trim();
        if (name !== 'lendloop_token') continue;
        const token = pair.slice(separator + 1);
        cookie = token ? pair.trim() : '';
      }
    }

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return { status: response.status, data, headers: response.headers };
  }

  return {
    request,
    get cookie() {
      return cookie;
    },
    setCookie(value) {
      cookie = value;
    },
  };
}

export async function registerUser(client, overrides = {}) {
  const payload = {
    name: 'Test User',
    email: uniqueEmail('user'),
    password: TEST_PASSWORD,
    ...overrides,
  };
  const response = await client.request('/auth/register', { method: 'POST', body: payload });
  if (response.status !== 201) {
    throw new Error(`Registration failed (${response.status}): ${JSON.stringify(response.data)}`);
  }
  return response.data.user;
}

export async function createCategory(client, overrides = {}) {
  const response = await client.request('/categories', {
    method: 'POST',
    body: { name: `Test category ${Date.now()}`, defaultPriority: 'medium', ...overrides },
  });
  if (response.status !== 201) {
    throw new Error(`Category creation failed (${response.status}): ${JSON.stringify(response.data)}`);
  }
  return response.data.category;
}

export async function createItem(client, categoryId, overrides = {}) {
  const response = await client.request('/items', {
    method: 'POST',
    body: {
      title: 'Cordless drill',
      description: 'A cordless drill with two batteries and a charger',
      categoryId,
      condition: 'Good',
      ...overrides,
    },
  });
  if (response.status !== 201) {
    throw new Error(`Item creation failed (${response.status}): ${JSON.stringify(response.data)}`);
  }
  return response.data.item;
}

export function manualLoanPayload(categoryId, overrides = {}) {
  return {
    itemName: 'Projector',
    description: 'Portable projector with a carry case',
    categoryId,
    borrower: {
      name: 'Maya Patel',
      email: 'maya@example.test',
      phone: '+91 98765 43210',
      consent: { email: true, whatsapp: true, note: 'Agreed in person' },
    },
    lentAt: inDays(-1),
    dueDate: inDays(5),
    priority: 'high',
    reminders: {
      enabled: true,
      channels: ['email', 'whatsapp'],
      frequency: 'daily',
      templateMode: 'custom',
      customMessage: 'Please return {itemName} by {dueDate}.',
    },
    ...overrides,
  };
}
