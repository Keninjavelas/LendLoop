import { Router } from 'express';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
} from '../controllers/templateController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = Router();

router.use(protect);

router.route('/').get(listTemplates).post(createTemplate);

router
  .route('/:id')
  .patch(validateObjectId, updateTemplate)
  .delete(validateObjectId, deleteTemplate);

export default router;
