import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';

export const healthCheck = (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
};

export const dbHealthCheck = async (_req: Request, res: Response) => {
  try {
    await connectDatabase();

    const db = mongoose.connection.db;
    const ping = db ? await db.admin().ping() : null;

    return res.status(200).json({
      status: 'ok',
      mongooseReadyState: mongoose.connection.readyState, // 1 means connected
      ping,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message ?? 'Database health check failed',
      mongooseReadyState: mongoose.connection.readyState,
      timestamp: new Date().toISOString(),
    });
  }
};

