import { Router } from 'express';
import {
  createItem,
  deleteItem,
  getItemById,
  getMyItems,
  listItems,
  updateItem,
} from '../controllers/itemController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = Router();

// Browsing is public so the landing page can send visitors straight to Explore.
router.route('/').get(listItems).post(protect, createItem);

// Registered before "/:id" so "mine" is never treated as an ObjectId.
router.get('/mine', protect, getMyItems);

router
  .route('/:id')
  .get(validateObjectId, getItemById)
  .patch(protect, validateObjectId, updateItem)
  .delete(protect, validateObjectId, deleteItem);

export default router;
