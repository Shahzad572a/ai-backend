import { Router } from 'express';
import {
  createGenerationController,
  getGenerationsController,
  getGenerationController,
  deleteGenerationController,
  getGenerationStatsController,
} from '../controllers/generationController';
import { requireAuth } from '../middleware/auth';

const router = Router();

// All generation routes require authentication
router.post('/', requireAuth, createGenerationController);
router.get('/', requireAuth, getGenerationsController);
router.get('/stats', requireAuth, getGenerationStatsController);
router.get('/:id', requireAuth, getGenerationController);
router.delete('/:id', requireAuth, deleteGenerationController);

export default router;

