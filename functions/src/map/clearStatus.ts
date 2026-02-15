import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';

export async function mapStatusClearHandler(
  request: CallableRequest
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const db = admin.firestore();

  await db.collection('mapStatus').doc(uid).delete();

  console.log(`[MapStatus] User ${uid} cleared status`);

  return { success: true };
}
