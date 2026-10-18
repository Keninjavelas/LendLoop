import { Router } from 'express';
import {
  getReminderOverview,
  listReminderLogs,
  retryReminder,
  runRemindersNow,
} from '../controllers/reminderController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = Router();

router.use(protect);

router.get('/', listReminderLogs);
router.get('/overview', getReminderOverview);

// Explicit retry for a failed attempt or a generated WhatsApp link. The controller
// rejects anything already submitted to a provider.
router.post('/:id/retry', validateObjectId, retryReminder);

// Kept for the Settings automation check; the primary Reminders page no longer presents
// this developer-facing control.
router.post('/run', runRemindersNow);

export default router;
