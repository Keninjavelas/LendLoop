import { schedule, shutdown, validate } from 'node-cron';
import { runDueReminders } from '../services/reminderService.js';

let task = null;
let running = false;

export async function runReminderTick(now = new Date()) {
  // Overlapping runs would race the same slots; the dedupe index would catch it, but
  // skipping outright keeps the logs honest about what actually happened.
  if (running) return { skipped: 'previous run still in flight' };

  running = true;
  try {
    const summary = await runDueReminders({ now });
    if (summary.logs || summary.failed) {
      console.log(
        `[reminders] scanned ${summary.scanned}, slots ${summary.slotsDue}, messages ${summary.logs}, failed ${summary.failed}`,
      );
    }
    return summary;
  } catch (error) {
    console.error('[reminders] scheduler run failed:', error.message);
    return { error: error.message };
  } finally {
    running = false;
  }
}

export function startReminderScheduler() {
  if (String(process.env.REMINDER_SCHEDULER_ENABLED ?? 'true').toLowerCase() === 'false') {
    console.log('[reminders] scheduler disabled by REMINDER_SCHEDULER_ENABLED');
    return null;
  }
  if (task) return task;

  const expression = process.env.REMINDER_CRON || '* * * * *';
  if (!validate(expression)) {
    console.error(`[reminders] invalid REMINDER_CRON "${expression}", scheduler not started`);
    return null;
  }

  task = schedule(expression, () => runReminderTick(), {
    timezone: process.env.REMINDER_TIMEZONE || undefined,
  });

  console.log(`[reminders] scheduler started (${expression})`);
  return task;
}

export async function stopReminderScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
  await shutdown();
}
