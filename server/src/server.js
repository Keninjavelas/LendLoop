import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const here = path.dirname(fileURLToPath(import.meta.url));
// Resolved from this file rather than the process cwd so the server boots the same
// way whether it is started via npm --prefix, nodemon, or a plain node command.
dotenv.config({ path: path.resolve(here, '../.env') });

const { createApp } = await import('./app.js');
const { connectDB } = await import('./config/db.js');
const { validateEnvironment } = await import('./config/env.js');
const { seedDefaults } = await import('./config/seedDefaults.js');
const { startReminderScheduler, stopReminderScheduler } = await import('./jobs/reminderScheduler.js');

const { errors, warnings, nodeEnv, port } = validateEnvironment(process.env);
for (const warning of warnings) console.warn(`[config] ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`[startup] ${error}`);
  console.error('[startup] copy server/.env.example to server/.env and fill in real values');
  process.exit(1);
}

let server;
let shuttingDown = false;

async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${reason}`);

  const forceExit = setTimeout(() => {
    console.error('[shutdown] timed out; exiting');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    await stopReminderScheduler();
    if (server) {
      const closing = new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      server.closeIdleConnections?.();
      await closing;
    }
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    clearTimeout(forceExit);
    process.exit(exitCode);
  } catch (error) {
    console.error(`[shutdown] failed: ${error.message}`);
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => shutdown(signal));
}

process.on('unhandledRejection', (reason) => {
  console.error('[runtime] unhandled rejection:', reason);
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  console.error('[runtime] uncaught exception:', error);
  shutdown('uncaughtException', 1);
});

try {
  await connectDB();

  const seeded = await seedDefaults();
  if (seeded.categories || seeded.templates) {
    console.log(
      `[seed] added ${seeded.categories} shared categories and ${seeded.templates} reminder templates`,
    );
  }

  server = createApp().listen(port, () => {
    console.log(`[api] listening on http://localhost:${port} (${nodeEnv})`);
  });

  startReminderScheduler();
} catch (err) {
  console.error(`[startup] failed to start: ${err.message}`);
  process.exit(1);
}
