import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

mongoose.set('strictQuery', true);

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as typeof globalThis & { __mongooseCache?: MongooseCache };

const mongooseCache: MongooseCache =
  globalForMongoose.__mongooseCache ?? (globalForMongoose.__mongooseCache = { conn: null, promise: null });

const isLikelyUnreachableFromVercel = (mongoUri: string) =>
  /localhost|127\.0\.0\.1|\.internal\b|railway\.internal\b/i.test(mongoUri);

export const connectDatabase = async (): Promise<void> => {
  if (mongooseCache.conn) return;

  try {
    if (isLikelyUnreachableFromVercel(env.mongoUri)) {
      logger.warn(
        'MONGODB_URI looks like a private/local address. On Vercel this will fail unless the database is publicly reachable (e.g. Atlas, or a public Railway URL).',
      );
    }

    const isServerless = Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

    if (!mongooseCache.promise) {
      mongooseCache.promise = mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10000, // 10 seconds to select server
      socketTimeoutMS: 45000, // 45 seconds socket timeout
      connectTimeoutMS: 10000, // 10 seconds connection timeout
      maxPoolSize: isServerless ? 5 : 10, // Serverless should keep a smaller pool
      minPoolSize: isServerless ? 0 : 2, // Serverless should not hold warm connections
      });
    }

    mongooseCache.conn = await mongooseCache.promise;
    logger.info('MongoDB connected');
  } catch (error) {
    mongooseCache.promise = null;
    logger.error('MongoDB connection error', error);
    throw error;
  }
};

