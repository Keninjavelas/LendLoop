const NODE_ENVS = ['development', 'test', 'production'];
const PLACEHOLDER_SECRETS = new Set([
  'replace_with_a_long_random_secret',
  'changeme',
  'secret',
]);

function parseOrigins(value) {
  return String(value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function isHttpOrigin(origin) {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

// Pure so it can be unit-tested without starting the server. Errors are fatal; warnings
// are printed and the process keeps running with a known-degraded configuration.
export function validateEnvironment(env = process.env) {
  const errors = [];
  const warnings = [];
  const nodeEnv = env.NODE_ENV || 'development';

  if (!NODE_ENVS.includes(nodeEnv)) {
    errors.push(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}`);
  }

  if (!env.MONGODB_URI) {
    errors.push('MONGODB_URI is required');
  } else if (!/^mongodb(\+srv)?:\/\//i.test(env.MONGODB_URI)) {
    errors.push('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }

  if (!env.JWT_SECRET) {
    errors.push('JWT_SECRET is required');
  } else if (env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  } else if (PLACEHOLDER_SECRETS.has(env.JWT_SECRET.trim().toLowerCase())) {
    errors.push('JWT_SECRET is still the example placeholder - generate a real random secret');
  }

  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    errors.push('PORT must be an integer between 1 and 65535');
  }

  const origins = parseOrigins(env.CLIENT_URL || 'http://localhost:5173');
  if (!origins.length) {
    errors.push('CLIENT_URL must contain at least one allowed origin');
  } else {
    for (const origin of origins) {
      if (!isHttpOrigin(origin)) errors.push(`CLIENT_URL entry "${origin}" is not a valid http(s) origin`);
      if (nodeEnv === 'production' && /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        warnings.push(`CLIENT_URL still points at ${origin} in production`);
      }
    }
  }

  const trustProxy = env.TRUST_PROXY;
  if (trustProxy && trustProxy !== 'true' && !/^\d+$/.test(trustProxy)) {
    warnings.push('TRUST_PROXY should be "true" or a hop count (e.g. 1); the value is ignored');
  }

  const mailDriver = String(env.MAIL_DRIVER ?? 'preview').trim().toLowerCase();
  if (mailDriver === 'resend' && !env.RESEND_API_KEY) {
    warnings.push('MAIL_DRIVER=resend has no RESEND_API_KEY, so reminders fall back to preview');
  }
  if (!['preview', 'resend'].includes(mailDriver) && !env.SMTP_HOST) {
    warnings.push(`MAIL_DRIVER=${mailDriver || '(empty)'} has no SMTP_HOST, so reminders fall back to preview`);
  }
  if (nodeEnv === 'production' && mailDriver === 'preview') {
    warnings.push('MAIL_DRIVER=preview in production: reminders will be logged, never delivered');
  }

  return { nodeEnv, port, origins, errors, warnings };
}
