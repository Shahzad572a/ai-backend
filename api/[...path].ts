import app from '../src/app';
import { connectDatabase } from '../src/config/database';
import { logger } from '../src/utils/logger';

// Vercel Serverless Function entrypoint:
// - handles all `/api/*` requests
// - ensures MongoDB is connected before routing to Express
export default async function handler(req: any, res: any) {
  try {
    await connectDatabase();
    return app(req, res);
  } catch (err) {
    logger.error('Request failed before routing (likely DB connection issue)', err);
    return res.status(500).json({ message: 'Database connection failed' });
  }
}


