import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { UserModel } from '../models/User';
import { PaymentModel } from '../models/Payment';
import { verifyPayPalPayment } from '../services/paypalService';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export const recordPayPalPayment = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { amount, currency = 'GBP', orderId, captureId } = req.body;

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'A valid amount is required' });
    }

    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ message: 'orderId is required' });
    }

    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Convert existing balance from old format (smallest currency units) to new format (pounds) if needed
    if (user.balance > 1000) {
      user.balance = user.balance / 1000;
      await user.save();
      logger.info('Converted user balance from old format to pounds', { 
        userId: user.id, 
        oldBalance: user.balance * 1000, 
        newBalance: user.balance 
      });
    }

    // Check if payment already exists
    const existingPayment = await PaymentModel.findOne({ externalId: orderId });
    if (existingPayment) {
      logger.warn('Duplicate PayPal payment attempt', { orderId, userId: user.id });
      return res.status(409).json({ 
        message: 'This PayPal order has already been recorded.',
        balance: user.balance,
      });
    }

    // Convert amount from smallest currency unit (e.g., pence) to currency units (e.g., pounds)
    // parsedAmount is in smallest currency units (e.g., 50000 for £50)
    // We store balance in pounds in the database (e.g., 50 for £50)
    const amountInPounds = parsedAmount / 1000;

    // Verify payment with PayPal (skip in sandbox if configured)
    let verificationResult;
    if (env.paypalSkipVerification && env.paypalUseSandbox) {
      logger.warn('Skipping PayPal verification (sandbox mode with PAYPAL_SKIP_VERIFICATION=true)', {
        orderId,
        captureId,
        amount: amountInPounds,
      });
      verificationResult = { verified: true };
    } else {
      try {
        logger.info('Starting PayPal payment verification', { 
          orderId, 
          captureId, 
          amount: amountInPounds,
          currency,
          environment: env.paypalUseSandbox ? 'sandbox' : 'production'
        });
        
        verificationResult = await verifyPayPalPayment(
          orderId,
          amountInPounds,
          currency,
          captureId,
        );
      } catch (error: any) {
        logger.error('PayPal verification error', { 
          orderId, 
          captureId,
          error: error.message,
          stack: error.stack 
        });
        
        // If it's a permissions issue (401), provide specific guidance
        if (error.message.includes('401') || error.message.includes('NOT_AUTHORIZED') || error.message.includes('insufficient permissions')) {
          return res.status(502).json({ 
            message: 'PayPal verification failed due to insufficient permissions. Your PayPal app needs to have the following scopes enabled: "https://uri.paypal.com/services/payments/realtimepayment" and "https://uri.paypal.com/services/payments/payment/read". Please check your PayPal app settings in the developer dashboard.',
            error: env.node === 'development' ? error.message : undefined,
            suggestion: 'Go to https://developer.paypal.com/dashboard -> Your App -> Settings -> Advanced Options -> Enable the required scopes',
          });
        }

        // Handle service unavailable errors
        if (error.message.includes('SERVICE_UNAVAILABLE') || error.message.includes('service is currently unavailable')) {
          return res.status(503).json({ 
            message: 'PayPal service is temporarily unavailable. This is usually a temporary issue with PayPal\'s servers. Please wait a moment and try again.',
            error: env.node === 'development' ? error.message : undefined,
            retryable: true,
          });
        }
        
        // Provide more helpful error messages
        let userMessage = 'Failed to verify payment with PayPal.';
        if (error.message.includes('Order not found') || error.message.includes('Both capture')) {
          userMessage = 'Payment verification failed: The payment could not be verified. ' +
            'This usually means the frontend and backend are using different PayPal apps or the app lacks required permissions. ' +
            'Please ensure both use the same PayPal app credentials and the app has payment read permissions enabled.';
        } else if (error.message.includes('authentication')) {
          userMessage = 'PayPal authentication failed. Please check server configuration.';
        } else if (error.message.includes('unavailable')) {
          userMessage = 'PayPal service is temporarily unavailable. Please try again in a few moments.';
        }
        
        return res.status(502).json({ 
          message: userMessage,
          error: env.node === 'development' ? error.message : undefined,
        });
      }

      if (!verificationResult.verified) {
        logger.warn('PayPal payment verification failed', { 
          orderId, 
          captureId,
          orderStatus: verificationResult.orderDetails?.status,
          captureStatus: verificationResult.captureDetails?.status,
        });
        return res.status(402).json({ 
          message: 'Payment verification failed. The payment was not completed successfully.',
        });
      }
    }

    // Payment verified - record it
    // Store payment amount in smallest currency units for payment record
    // But update user balance in pounds
    try {
      await PaymentModel.create({
        user: user._id,
        provider: 'paypal',
        amount: parsedAmount, // Store in smallest currency units for payment record
        currency,
        status: 'completed',
        externalId: orderId,
        metadata: {
          captureId: verificationResult.captureDetails?.id || captureId,
          orderId,
          verified: !env.paypalSkipVerification,
          verificationSkipped: env.paypalSkipVerification && env.paypalUseSandbox,
          sandbox: env.paypalUseSandbox,
          verifiedAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        logger.warn('Race condition: payment already recorded', { orderId });
        const updatedUser = await UserModel.findById(req.user.id);
        return res.status(200).json({
          balance: updatedUser?.balance ?? user.balance,
          message: 'Payment already processed.',
        });
      }
      throw error;
    }

    // Update user balance in pounds (database stores balance in pounds)
    user.balance += amountInPounds;
    await user.save();

    logger.info('PayPal payment recorded successfully', { 
      orderId, 
      userId: user.id, 
      amount: parsedAmount,
      newBalance: user.balance,
    });

    return res.status(200).json({
      balance: user.balance,
      message: 'Payment verified and balance updated successfully.',
    });
  } catch (error) {
    next(error);
  }
};

