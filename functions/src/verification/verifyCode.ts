import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

const MAX_ATTEMPTS = 5;

export async function verifyCodeHandler(
  request: CallableRequest
): Promise<{ success: boolean }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  const uid = request.auth.uid;
  const code = (request.data as { code?: string })?.code?.trim();

  if (!code || code.length !== 6) {
    throw new HttpsError('invalid-argument', 'A 6-digit code is required');
  }

  const db = admin.firestore();
  const codeRef = db.collection('verificationCodes').doc(uid);
  const snap = await codeRef.get();

  if (!snap.exists) {
    throw new HttpsError(
      'not-found',
      'No verification code found. Please request a new one.'
    );
  }

  const data = snap.data()!;

  // Check expiry
  const expiresAt = data.expiresAt?.toDate?.() ?? new Date(0);
  if (Date.now() > expiresAt.getTime()) {
    await codeRef.delete();
    throw new HttpsError(
      'deadline-exceeded',
      'Code has expired. Please request a new one.'
    );
  }

  // Check max attempts
  if ((data.attempts || 0) >= MAX_ATTEMPTS) {
    await codeRef.delete();
    throw new HttpsError(
      'resource-exhausted',
      'Too many attempts. Please request a new code.'
    );
  }

  // Increment attempts
  await codeRef.update({
    attempts: admin.firestore.FieldValue.increment(1),
  });

  if (data.code !== code) {
    const remaining = MAX_ATTEMPTS - (data.attempts || 0) - 1;
    throw new HttpsError(
      'permission-denied',
      `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
    );
  }

  // Code matches — mark email as verified in Firebase Auth
  await admin.auth().updateUser(uid, { emailVerified: true });

  // Sync to Firestore user doc
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (userSnap.exists) {
    await userRef.update({
      isVerified: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Clean up
  await codeRef.delete();

  return { success: true };
}
