import { UserModel } from '../models/User';
import { hashPassword, verifyPassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { verifyGoogleIdToken } from '../config/firebaseAdmin';

const NEW_USER_CREDIT = 1.0; // £1.00 in pounds

interface AuthPayload {
  id: string;
  name: string;
  email: string;
  balance: number;
  provider: 'local' | 'google';
}

export const formatUser = (user: typeof UserModel.prototype): AuthPayload => {
  // Convert balance from smallest currency units to pounds if it's in old format
  // Old format: balance > 1000 (e.g., 40050 for £40.05)
  // New format: balance < 1000 (e.g., 40.05 for £40.05)
  let balance = user.balance;
  if (balance > 1000) {
    // This is likely in smallest currency units (old format), convert to pounds
    balance = balance / 1000;
    // Update the database to new format
    user.balance = balance;
    user.save().catch((err: any) => {
      console.error('Failed to update user balance format:', err);
    });
  }
  
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    balance: balance, // Balance in pounds
    provider: user.provider,
  };
};

export const signupWithEmail = async (name: string, email: string, password: string) => {
  const existing = await UserModel.findOne({ email });
  if (existing) {
    throw new Error('Account already exists with this email');
  }

  const passwordHash = await hashPassword(password);
  const user = await UserModel.create({
    name,
    email,
    passwordHash,
    provider: 'local',
    balance: NEW_USER_CREDIT, // Give new users £1.00 free credit
  });

  const token = signToken({ sub: user.id, email: user.email });
  return { user: formatUser(user), token };
};

export const loginWithEmail = async (email: string, password: string) => {
  const user = await UserModel.findOne({ email });
  // Allow login if user has a passwordHash (works for both local and Google users who set a password)
  if (!user || !user.passwordHash) {
    throw new Error('Invalid credentials');
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  const token = signToken({ sub: user.id, email: user.email });
  return { user: formatUser(user), token };
};

export const loginWithGoogle = async (idToken: string) => {
  const decoded = await verifyGoogleIdToken(idToken);
  const { email, name, uid } = decoded;

  if (!email || !name) {
    throw new Error('Unable to verify Google account');
  }

  let user = await UserModel.findOne({ email });
  if (!user) {
    // New user - give them free credit
    user = await UserModel.create({
      name,
      email,
      provider: 'google',
      googleUid: uid,
      balance: NEW_USER_CREDIT, // Give new users £1.00 free credit
      lastLoginAt: new Date(),
    });
  } else {
    user.provider = 'google';
    user.googleUid = uid;
    user.lastLoginAt = new Date();
    await user.save();
  }

  const token = signToken({ sub: user.id, email: user.email });
  return { user: formatUser(user), token };
};

export const requestPasswordReset = async (email: string) => {
  const { logger } = await import('../utils/logger');
  const normalizedEmail = email.toLowerCase();
  
  logger.info(`🔐 Password reset requested for: ${normalizedEmail}`);
  
  // Check if user exists (regardless of provider)
  const user = await UserModel.findOne({ email: normalizedEmail });
  if (!user) {
    // Don't reveal if user exists or not for security
    logger.warn(`⚠️  User not found: ${normalizedEmail}`);
    return;
  }

  logger.info(`✅ User found (provider: ${user.provider}), generating reset token for: ${normalizedEmail}`);

  const crypto = await import('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

  const { PasswordResetModel } = await import('../models/PasswordReset');
  
  // Invalidate any existing reset tokens for this email
  await PasswordResetModel.updateMany(
    { email: normalizedEmail },
    { used: true }
  );

  // Create new reset token
  await PasswordResetModel.create({
    email: normalizedEmail,
    token: resetToken,
    expiresAt,
    used: false,
  });

  logger.info(`📝 Reset token created and saved to database for: ${normalizedEmail}`);

  // Send email - this must succeed or throw an error
  logger.info(`📧 Calling email service to send reset email to: ${normalizedEmail}`);
  const { sendPasswordResetEmail } = await import('./emailService');
  await sendPasswordResetEmail(normalizedEmail, resetToken);
  logger.info(`✅ Email service completed for: ${normalizedEmail}`);
};

export const resetPassword = async (token: string, newPassword: string) => {
  const { PasswordResetModel } = await import('../models/PasswordReset');
  const passwordReset = await PasswordResetModel.findOne({
    token,
    used: false,
    expiresAt: { $gt: new Date() },
  });

  if (!passwordReset) {
    throw new Error('Invalid or expired reset token');
  }

  // Find user regardless of provider (allows Google users to set a password)
  const user = await UserModel.findOne({ email: passwordReset.email });
  if (!user) {
    throw new Error('User not found');
  }

  // Update password (this works for both local and Google users)
  // Google users can now login with either Google or email/password
  user.passwordHash = await hashPassword(newPassword);
  
  // If user was Google-only, they can now use both login methods
  // Keep their provider as 'google' but add password support
  await user.save();

  // Mark token as used
  passwordReset.used = true;
  await passwordReset.save();

  return { user: formatUser(user) };
};

