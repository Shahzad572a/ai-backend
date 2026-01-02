import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import paymentRoutes from './payment.routes';
import generationRoutes from './generation.routes';
import artworkRoutes from './artwork.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/payments', paymentRoutes);
router.use('/generations', generationRoutes);
router.use('/artworks', artworkRoutes);

export default router;

