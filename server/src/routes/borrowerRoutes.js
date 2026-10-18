import { Router } from 'express';
import { getBorrower, listBorrowers } from '../controllers/borrowerController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = Router();

router.use(protect);
router.get('/', listBorrowers);
router.get('/:id', validateObjectId, getBorrower);

export default router;
