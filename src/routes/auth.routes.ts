import { Router } from 'express';
import { signupController, loginController, googleAuthController, getCurrentUserController, forgotPasswordController, resetPasswordController } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/signup', signupController);
router.post('/login', loginController);
router.post('/google', googleAuthController);
router.post('/forgot-password', forgotPasswordController);
router.post('/reset-password', resetPasswordController);
router.get('/me', requireAuth, getCurrentUserController);

export default router;

