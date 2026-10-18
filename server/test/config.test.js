import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateEnvironment } from '../src/config/env.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';

const VALID = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://localhost:27017/lendloop_test?replicaSet=rs0',
  JWT_SECRET: 'a'.repeat(48),
  PORT: '5050',
  CLIENT_URL: 'http://localhost:5173',
  MAIL_DRIVER: 'preview',
};

function validate(overrides = {}) {
  return validateEnvironment({ ...VALID, ...overrides });
}

test('accepts a complete local configuration without errors', () => {
  const result = validate();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.port, 5050);
  assert.equal(result.nodeEnv, 'test');
  assert.deepEqual(result.origins, ['http://localhost:5173']);
});

test('rejects missing secrets, placeholder secrets and malformed core values', () => {
  assert.ok(validate({ JWT_SECRET: undefined }).errors.some((error) => /JWT_SECRET is required/.test(error)));
  assert.ok(validate({ JWT_SECRET: 'short' }).errors.some((error) => /at least 32/.test(error)));
  assert.ok(
    validate({ JWT_SECRET: 'replace_with_a_long_random_secret' }).errors.some((error) =>
      /placeholder/.test(error),
    ),
  );
  assert.ok(validate({ MONGODB_URI: undefined }).errors.some((error) => /required/.test(error)));
  assert.ok(
    validate({ MONGODB_URI: 'postgres://localhost/db' }).errors.some((error) => /mongodb/.test(error)),
  );
  assert.ok(validate({ PORT: '70000' }).errors.some((error) => /PORT/.test(error)));
  assert.ok(validate({ NODE_ENV: 'staging' }).errors.some((error) => /NODE_ENV/.test(error)));
  assert.ok(
    validate({ CLIENT_URL: 'not a url' }).errors.some((error) => /valid http/.test(error)),
  );
});

test('warns about localhost origins, proxy trust and previewing mail in production', () => {
  const result = validate({
    NODE_ENV: 'production',
    CLIENT_URL: 'https://lendloop.example, http://localhost:5173/',
    TRUST_PROXY: 'maybe',
    MAIL_DRIVER: 'preview',
  });
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((warning) => /localhost:5173/.test(warning)));
  assert.ok(result.warnings.some((warning) => /TRUST_PROXY/.test(warning)));
  assert.ok(result.warnings.some((warning) => /preview in production/.test(warning)));
  assert.deepEqual(result.origins, ['https://lendloop.example', 'http://localhost:5173']);
});

test('warns when a selected mail driver cannot fall back to a real provider', () => {
  assert.ok(
    validate({ MAIL_DRIVER: 'resend' }).warnings.some((warning) => /RESEND_API_KEY/.test(warning)),
  );
  assert.ok(
    validate({ MAIL_DRIVER: 'smtp' }).warnings.some((warning) => /SMTP_HOST/.test(warning)),
  );
});

test('limits repeated credential attempts per address', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
  const headers = {};
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
  };

  const next = () => {};
  limiter({ ip: '203.0.113.9', socket: {} }, res, next);
  limiter({ ip: '203.0.113.9', socket: {} }, res, next);
  assert.equal(headers['RateLimit-Remaining'], 0);

  let error;
  limiter({ ip: '203.0.113.9', socket: {} }, res, (value) => {
    error = value;
  });
  assert.equal(error.statusCode, 429);
  assert.match(error.message, /Too many attempts/i);
  assert.ok(Number(headers['Retry-After']) >= 1);

  let otherError;
  limiter({ ip: '203.0.113.10', socket: {} }, res, (value) => {
    otherError = value;
  });
  assert.equal(otherError, undefined);

  limiter.dispose();
});

test('falls back to the socket address when Express has not resolved an IP', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  const res = { setHeader() {} };
  let error;
  limiter({ socket: { remoteAddress: '198.51.100.4' } }, res, () => {});
  limiter({ socket: { remoteAddress: '198.51.100.4' } }, res, (value) => {
    error = value;
  });
  assert.equal(error.statusCode, 429);
  limiter.dispose();
});
