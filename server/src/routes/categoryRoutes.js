import { Router } from 'express';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../controllers/categoryController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = Router();

router.use(protect);

router.route('/').get(listCategories).post(createCategory);

router
  .route('/:id')
  .patch(validateObjectId, updateCategory)
  .delete(validateObjectId, deleteCategory);

export default router;
