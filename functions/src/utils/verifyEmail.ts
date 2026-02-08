import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

/**
 * U21 Fix: Email Verification Enforcement
 *
 * Requires that the calling user has a verified email address.
 * Zero grace period - enforcement is immediate.
 *
 * @param request - The callable function request object
 * @throws HttpsError with code 'failed-precondition' if email not verified
 */
export async function requireEmailVerification(
  request: CallableRequest
): Promise<void> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;

  // Check Firebase Auth emailVerified status
  const userRecord = await admin.auth().getUser(uid);

  if (!userRecord.emailVerified) {
    throw new HttpsError(
      'failed-precondition',
      'EMAIL_NOT_VERIFIED',
      {
        requiresVerification: true,
        message: 'Please verify your email address to use this feature. Check your inbox for the verification link.',
      }
    );
  }
}
