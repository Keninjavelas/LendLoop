import { Router } from 'express';
import {
  approveRequest,
  cancelRequest,
  createRequest,
  getIncomingRequests,
  getOutgoingRequests,
  rejectRequest,
} from '../controllers/requestController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = Router();

router.use(protect);

router.post('/', createRequest);
router.get('/incoming', getIncomingRequests);
router.get('/outgoing', getOutgoingRequests);
router.patch('/:id/approve', validateObjectId, approveRequest);
router.patch('/:id/reject', validateObjectId, rejectRequest);
router.patch('/:id/cancel', validateObjectId, cancelRequest);

export default router;
