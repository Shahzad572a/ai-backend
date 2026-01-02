import { Router } from 'express';
import { recordPayPalPayment } from '../controllers/paymentController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/paypal', requireAuth, recordPayPalPayment);

export default router;

