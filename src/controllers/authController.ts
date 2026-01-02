import { Request, Response, NextFunction } from 'express';
import { loginWithEmail, signupWithEmail, loginWithGoogle, formatUser } from '../services/authService';
import { AuthenticatedRequest } from '../middleware/auth';
import { UserModel } from '../models/User';

export const signupController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    const result = await signupWithEmail(name, email.toLowerCase(), password);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const loginController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const result = await loginWithEmail(email.toLowerCase(), password);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const googleAuthController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: 'idToken is required' });
    }
    const result = await loginWithGoogle(idToken);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const getCurrentUserController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(formatUser(user));
  } catch (error) {
    next(error);
  }
};

export const forgotPasswordController = async (req: Request, res: Response, next: NextFunction) => {
  const { logger } = await import('../utils/logger');
  try {
    const { email } = req.body;
    logger.info(`📨 Forgot password request received for: ${email}`);
    
    if (!email) {
      logger.warn('⚠️  Forgot password request missing email');
      return res.status(400).json({ message: 'Email is required' });
    }

    const { requestPasswordReset } = await import('../services/authService');
    await requestPasswordReset(email);
    
    logger.info(`✅ Password reset process completed for: ${email}`);
    // Always return success to prevent email enumeration
    res.status(200).json({ message: 'A confirmation email is sent. Check your inbox.' });
  } catch (error: any) {
    // Log the error for debugging but still return success to prevent email enumeration
    logger.error('❌ Password reset request error:');
    logger.error(`   Email: ${req.body?.email || 'unknown'}`);
    logger.error(`   Error: ${error.message}`);
    logger.error(`   Stack: ${error.stack}`);
    // Still return success to user (security best practice)
    res.status(200).json({ message: 'A confirmation email is sent. Check your inbox.' });
  }
};

export const resetPasswordController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const { resetPassword } = await import('../services/authService');
    const result = await resetPassword(token, password);
    
    res.status(200).json({ message: 'Password has been reset successfully', user: result.user });
  } catch (error: any) {
    next(error);
  }
};

