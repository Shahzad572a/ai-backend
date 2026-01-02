import admin from 'firebase-admin';
import { env } from './env';
import { logger } from '../utils/logger';

let firebaseApp: admin.app.App | null = null;

export const initializeFirebaseAdmin = () => {
  if (firebaseApp) {
    return firebaseApp;
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey,
    }),
  });

  logger.info('Firebase Admin initialized');
  return firebaseApp;
};

export const verifyGoogleIdToken = async (idToken: string) => {
  const app = initializeFirebaseAdmin();
  return app.auth().verifyIdToken(idToken);
};

