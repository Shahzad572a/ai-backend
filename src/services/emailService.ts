import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let transporter: nodemailer.Transporter | null = null;

const createTransporter = async () => {
  if (transporter) {
    return transporter;
  }

  // For development, use a test account or SMTP
  // For production, configure with real SMTP credentials
  const emailHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const emailPort = Number(process.env.EMAIL_PORT || 587);
  // Strip quotes if present (some .env files add quotes)
  const emailUser = process.env.EMAIL_USER?.replace(/^["']|["']$/g, '') || '';
  const emailPassword = process.env.EMAIL_PASSWORD?.replace(/^["']|["']$/g, '') || '';
  const emailFrom = (process.env.EMAIL_FROM?.replace(/^["']|["']$/g, '') || emailUser || 'noreply@flowframe.com');

  if (!emailUser || !emailPassword) {
    logger.error('❌ EMAIL CREDENTIALS NOT CONFIGURED!');
    logger.error('Please set the following environment variables in your .env file:');
    logger.error('  EMAIL_HOST=smtp.gmail.com (or your SMTP server)');
    logger.error('  EMAIL_PORT=587');
    logger.error('  EMAIL_USER=your-email@gmail.com');
    logger.error('  EMAIL_PASSWORD=your-app-password');
    logger.error('  EMAIL_FROM=noreply@flowframe.com (optional)');
    logger.error('Password reset emails will NOT be sent without proper configuration.');
    throw new Error('Email service not configured. Please set EMAIL_USER and EMAIL_PASSWORD environment variables.');
  }

  logger.info(`📧 Email service configured: ${emailHost}:${emailPort}`);
  logger.info(`   From: ${emailFrom}`);
  logger.info(`   User: ${emailUser}`);

  transporter = nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465,
    auth: {
      user: emailUser,
      pass: emailPassword,
    },
  });

  // Verify the transporter connection (only on first creation)
  try {
    logger.info('🔍 Verifying email transporter connection...');
    await transporter.verify();
    logger.info('✅ Email transporter verified successfully');
  } catch (error: any) {
    logger.error('❌ Email transporter verification failed:');
    logger.error(`   Error: ${error.message}`);
    if (error.code) {
      logger.error(`   Code: ${error.code}`);
    }
    if (error.command) {
      logger.error(`   Command: ${error.command}`);
    }
    transporter = null; // Reset transporter so it can be recreated
    throw error;
  }

  return transporter;
};

export const sendPasswordResetEmail = async (email: string, resetToken: string) => {
  try {
    const transporter = await createTransporter();
    const frontendUrl = env.frontendUrl || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    const emailFrom = (process.env.EMAIL_FROM?.replace(/^["']|["']$/g, '') || process.env.EMAIL_USER?.replace(/^["']|["']$/g, '') || 'noreply@flowframe.com');

    const mailOptions = {
      from: emailFrom,
      to: email,
      subject: 'Reset Your FlowFrame Password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">FlowFrame</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
              <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
              <p>Hello,</p>
              <p>We received a request to reset your password for your FlowFrame account. Click the button below to reset your password:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
              </div>
              <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
              <p style="color: #667eea; font-size: 12px; word-break: break-all;">${resetUrl}</p>
              <p style="color: #666; font-size: 14px; margin-top: 30px;">This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">© ${new Date().getFullYear()} FlowFrame. All rights reserved.</p>
            </div>
          </body>
        </html>
      `,
      text: `
        Reset Your FlowFrame Password
        
        We received a request to reset your password for your FlowFrame account.
        
        Click this link to reset your password:
        ${resetUrl}
        
        This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
        
        © ${new Date().getFullYear()} FlowFrame. All rights reserved.
      `,
    };

    logger.info(`📧 Attempting to send password reset email:`);
    logger.info(`   To: ${email}`);
    logger.info(`   From: ${emailFrom}`);
    logger.info(`   Subject: Reset Your FlowFrame Password`);
    
    const info = await transporter.sendMail(mailOptions);
    
    logger.info(`✅ Password reset email sent successfully!`);
    logger.info(`   To: ${email}`);
    logger.info(`   MessageId: ${info.messageId}`);
    logger.info(`   Response: ${info.response || 'N/A'}`);
    logger.info(`   Reset URL: ${resetUrl}`);
    
    return info;
  } catch (error: any) {
    logger.error(`❌ Failed to send password reset email to ${email}:`);
    logger.error(`   Error: ${error.message}`);
    if (error.code) {
      logger.error(`   Error Code: ${error.code}`);
    }
    if (error.response) {
      logger.error(`   SMTP Response: ${error.response}`);
    }
    throw error;
  }
};

