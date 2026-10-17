import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
// Resolved from this file rather than the process cwd so the server boots the same
// way whether it is started via npm --prefix, nodemon, or a plain node command.
dotenv.config({ path: path.resolve(here, '../.env') });

const { createApp } = await import('./app.js');
const { connectDB } = await import('./config/db.js');
const { seedDefaults } = await import('./config/seedDefaults.js');
const { startReminderScheduler, stopReminderScheduler } = await import('./jobs/reminderScheduler.js');

const missing = ['MONGODB_URI', 'JWT_SECRET'].filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[startup] missing required environment variables: ${missing.join(', ')}`);
  console.error('[startup] copy server/.env.example to server/.env and fill in the values');
  process.exit(1);
}

const port = Number(process.env.PORT) || 5000;

try {
  await connectDB();

  const seeded = await seedDefaults();
  if (seeded.categories || seeded.templates) {
    console.log(
      `[seed] added ${seeded.categories} shared categories and ${seeded.templates} reminder templates`,
    );
  }

  createApp().listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });

  startReminderScheduler();
} catch (err) {
  console.error(`[startup] failed to start: ${err.message}`);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await stopReminderScheduler();
    process.exit(0);
  });
}
