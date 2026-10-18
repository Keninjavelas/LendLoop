import { Router } from 'express';
import { exportInsightsCsv, getInsights } from '../controllers/insightController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.use(protect);
router.get('/', getInsights);
router.get('/export', exportInsightsCsv);

export default router;
