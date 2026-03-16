import * as admin from 'firebase-admin';
import { logger } from '../utils';

let firebaseApp: admin.app.App | null = null;

/**
 * Initializes the Firebase Admin SDK.
 * Supports two modes:
 *  1. Service Account JSON file path via FIREBASE_SERVICE_ACCOUNT_PATH
 *  2. Individual env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *
 * If neither is configured, Firebase is disabled (push notifications silently skipped).
 */
export const initializeFirebase = (): void => {
  if (firebaseApp) return; // Already initialized

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!serviceAccountPath && !projectId) {
    logger.warn(
      '⚠️  Firebase not configured. Push notifications will be disabled. ' +
        'Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY to enable.'
    );
    return;
  }

  try {
    let credential: admin.credential.Credential;

    if (serviceAccountPath) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const serviceAccount = require(serviceAccountPath);
      credential = admin.credential.cert(serviceAccount);
      logger.info('🔑 Firebase: using service account file');
    } else {
      // Individual env vars — useful for platforms like Railway, Render, Heroku
      credential = admin.credential.cert({
        projectId,
        clientEmail,
        // Replace escaped newlines that some env providers serialize
        privateKey: privateKey!.replace(/\\n/g, '\n'),
      });
      logger.info('🔑 Firebase: using individual env vars');
    }

    firebaseApp = admin.initializeApp({ credential });
    logger.info('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize Firebase Admin SDK:', error);
    // Don't crash the server — just disable push notifications
    firebaseApp = null;
  }
};

/**
 * Returns the Firebase Messaging instance, or null if Firebase is not initialized.
 */
export const getFirebaseMessaging = (): admin.messaging.Messaging | null => {
  if (!firebaseApp) return null;
  return admin.messaging(firebaseApp);
};

/**
 * Returns whether Firebase has been successfully initialized.
 */
export const isFirebaseReady = (): boolean => firebaseApp !== null;
