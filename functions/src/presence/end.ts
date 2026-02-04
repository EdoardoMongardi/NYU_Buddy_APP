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

  // Cleanup pending offers (outgoing/incoming)
  // We do this before deleting presence so the client sees updates
  try {
    // Dynamic import to avoid circular dependencies if any
    const { cleanupPendingOffers } = await import('../offers/cleanup');
    await cleanupPendingOffers(admin.firestore(), uid);
  } catch (error) {
    console.error('Error cleaning up offers:', error);
    // Continue deleting presence even if cleanup fails
  }

  await presenceRef.delete();

  return { success: true };
}