import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, FirebaseStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Check if Firebase is configured
const isFirebaseConfigured = firebaseConfig.apiKey && firebaseConfig.projectId;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let storage: FirebaseStorage | null = null;

// Only initialize if config is present (for build safety)
if (isFirebaseConfigured) {
  app = getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0];

  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, 'us-east1');
  storage = getStorage(app);

  // Connect to emulators in development (only if USE_EMULATORS env var is set)
  // To use emulators, set NEXT_PUBLIC_USE_EMULATORS=true in .env.local
  if (process.env.NEXT_PUBLIC_USE_EMULATORS === 'true' && typeof window !== 'undefined') {
    const globalAny = globalThis as unknown as Record<string, boolean>;
    const hasConnectedEmulators = globalAny.__FIREBASE_EMULATORS_CONNECTED__;

    if (!hasConnectedEmulators) {
      try {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
        connectFirestoreEmulator(db, 'localhost', 8080);
        connectFunctionsEmulator(functions, 'localhost', 5001);
        if (storage) connectStorageEmulator(storage, 'localhost', 9199);
        globalAny.__FIREBASE_EMULATORS_CONNECTED__ = true;
      } catch {
        // Emulators might not be running
      }
    }
  }
}

// Helper functions to get non-null instances (throws if not configured)
export function getFirebaseAuth(): Auth {
  if (!auth) throw new Error('Firebase Auth not configured');
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) throw new Error('Firestore not configured');
  return db;
}

export function getFirebaseFunctions(): Functions {
  if (!functions) throw new Error('Firebase Functions not configured');
  return functions;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) throw new Error('Firebase Storage not configured');
  return storage;
}

// Export with type assertions for convenience (components should handle null case)
export { app, auth, db, functions, storage };