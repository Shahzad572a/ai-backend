import { Router } from 'express';
import {
  createArtworkController,
  getArtworksController,
  deleteArtworkController,
  updateArtworkController,
} from '../controllers/artworkController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/', requireAuth, createArtworkController);
router.get('/', requireAuth, getArtworksController);
router.delete('/:id', requireAuth, deleteArtworkController);
router.put('/:id', requireAuth, updateArtworkController);

export default router;

