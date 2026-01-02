import app from './app';
import { env } from './config/env';
import { connectDatabase } from './config/database';
import { logger } from './utils/logger';

const checkEmailConfiguration = () => {
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;
  
  if (!emailUser || !emailPassword) {
    logger.warn('');
    logger.warn('⚠️  EMAIL SERVICE NOT CONFIGURED!');
    logger.warn('Password reset emails will NOT be sent.');
    logger.warn('');
    logger.warn('To enable email functionality, add these to your .env file:');
    logger.warn('  EMAIL_HOST=smtp.gmail.com');
    logger.warn('  EMAIL_PORT=587');
    logger.warn('  EMAIL_USER=your-email@gmail.com');
    logger.warn('  EMAIL_PASSWORD=your-app-password');
    logger.warn('  EMAIL_FROM=noreply@flowframe.com (optional)');
    logger.warn('');
    logger.warn('For Gmail:');
    logger.warn('  1. Enable 2-Step Verification');
    logger.warn('  2. Generate an App Password: https://myaccount.google.com/apppasswords');
    logger.warn('  3. Use the App Password (not your regular password)');
    logger.warn('');
  } else {
    logger.info('✅ Email service configured');
  }
};

const startServer = async () => {
  await connectDatabase();
  checkEmailConfiguration();

  app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port}`);
  });
};

startServer().catch((error) => {
  logger.error('Server failed to start', error);
  process.exit(1);
});

