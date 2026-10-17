import { Router } from 'express';
import { listReminderLogs, runRemindersNow } from '../controllers/reminderController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.use(protect);

router.get('/', listReminderLogs);

// Fires the same pass the cron job runs, limited to the caller's own lending entries.
router.post('/run', runRemindersNow);

export default router;
