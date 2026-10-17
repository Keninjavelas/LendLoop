import { Router } from 'express';
import {
  createLoan,
  getLoanById,
  getLoanHistory,
  getLoans,
  returnLoan,
  updateLoanCategory,
  updateLoanDeadline,
  updateLoanPriority,
  updateLoanSettings,
} from '../controllers/loanController.js';
import {
  getLoanReminders,
  getReminderSchedule,
  previewReminder,
  sendReminder,
} from '../controllers/reminderController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = Router();

router.use(protect);

router.route('/').get(getLoans).post(createLoan);

router.get('/:id', validateObjectId, getLoanById);
router.patch('/:id', validateObjectId, updateLoanSettings);

router.patch('/:id/deadline', validateObjectId, updateLoanDeadline);
router.patch('/:id/priority', validateObjectId, updateLoanPriority);
router.patch('/:id/category', validateObjectId, updateLoanCategory);
router.patch('/:id/return', validateObjectId, returnLoan);

router.get('/:id/history', validateObjectId, getLoanHistory);
router.get('/:id/reminders', validateObjectId, getLoanReminders);
router.post('/:id/reminders', validateObjectId, sendReminder);
router.get('/:id/reminders/preview', validateObjectId, previewReminder);
router.get('/:id/reminders/schedule', validateObjectId, getReminderSchedule);

export default router;
