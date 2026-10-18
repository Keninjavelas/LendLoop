import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { createRateLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import authRoutes from './routes/authRoutes.js';
import borrowerRoutes from './routes/borrowerRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import insightRoutes from './routes/insightRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import loanRoutes from './routes/loanRoutes.js';
import reminderRoutes from './routes/reminderRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import templateRoutes from './routes/templateRoutes.js';
import userRoutes from './routes/userRoutes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(process.env.CLIENT_DIST || path.join(here, '../../client/dist'));

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

const authLimiter = createRateLimiter({
  windowMs: positiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60_000),
  max: positiveInt(process.env.AUTH_RATE_LIMIT_MAX, 20),
});

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy === 'true') app.set('trust proxy', 1);
  else if (/^\d+$/.test(trustProxy ?? '')) app.set('trust proxy', Number(trustProxy));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  });

  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
      status: connected ? 'ok' : 'degraded',
      database: connected ? 'up' : 'down',
    });
  });

  // Credential endpoints are the only unauthenticated write surface, so they get a
  // fixed-window limit before the route handlers run.
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/borrowers', borrowerRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/insights', insightRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/loans', loanRoutes);
  app.use('/api/reminders', reminderRoutes);
  app.use('/api/requests', requestRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/users', userRoutes);

  // Production defaults to serving the built SPA from this process. Set SERVE_CLIENT=false
  // when a static host serves client/dist separately; /api/* always stays JSON.
  const serveClientSetting = String(process.env.SERVE_CLIENT ?? '').trim().toLowerCase();
  const serveClient = serveClientSetting
    ? serveClientSetting !== 'false'
    : process.env.NODE_ENV === 'production';

  if (serveClient) {
    const indexFile = path.join(clientDist, 'index.html');
    if (!fs.existsSync(indexFile)) {
      console.warn(`[web] client build not found at ${indexFile}; run "npm run build"`);
    }
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.sendFile(indexFile, (error) => {
        if (!error) return;
        if (error.code === 'ENOENT') return next();
        next(error);
      });
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
