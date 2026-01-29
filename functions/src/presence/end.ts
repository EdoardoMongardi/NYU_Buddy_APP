import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

export async function presenceEndHandler(request: CallableRequest) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;

  // Delete presence document
  const presenceRef = admin.firestore().collection('presence').doc(uid);

  const presenceDoc = await presenceRef.get();

  if (!presenceDoc.exists) {
    // No active presence, that's fine
    return { success: true };
  }

  await presenceRef.delete();

  return { success: true };
}