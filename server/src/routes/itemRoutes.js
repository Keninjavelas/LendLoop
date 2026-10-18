import { Router } from 'express';
import {
  archiveItem,
  createItem,
  deleteItem,
  getItemById,
  getMyItems,
  listItems,
  restoreItem,
  updateItem,
} from '../controllers/itemController.js';
import { optionalProtect, protect } from '../middleware/authMiddleware.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = Router();

// Browsing is public so the landing page can send visitors straight to Explore.
router.route('/').get(listItems).post(protect, createItem);

// Registered before "/:id" so "mine" is never treated as an ObjectId.
router.get('/mine', protect, getMyItems);

router
  .route('/:id')
  // A signed-in owner receives their private active-loan, pending-request and history
  // context on the same public payload.
  .get(optionalProtect, validateObjectId, getItemById)
  .patch(protect, validateObjectId, updateItem)
  .delete(protect, validateObjectId, deleteItem);

router.patch('/:id/archive', protect, validateObjectId, archiveItem);
router.patch('/:id/restore', protect, validateObjectId, restoreItem);

export default router;
