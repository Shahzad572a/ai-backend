import { Router } from 'express';
import { dbHealthCheck, healthCheck } from '../controllers/healthController';

const router = Router();

router.get('/', healthCheck);
router.get('/db', dbHealthCheck);

export default router;

