import { Router } from 'express';
import {
  changePassword,
  deleteAccount,
  getProfile,
  updateProfile,
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.use(protect);

router.route('/me').get(getProfile).patch(updateProfile).delete(deleteAccount);
router.patch('/me/password', changePassword);

export default router;
