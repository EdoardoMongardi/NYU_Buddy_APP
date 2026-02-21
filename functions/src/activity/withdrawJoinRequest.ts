import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { JOIN_REQUEST_STATUS } from '../constants/activityState';

interface WithdrawJoinRequestData {
  postId: string;
}

export async function joinRequestWithdrawHandler(
  request: CallableRequest<WithdrawJoinRequestData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const data = request.data;
  const db = admin.firestore();

  if (!data.postId) {
    throw new HttpsError('invalid-argument', 'Post ID is required');
  }

  const requestId = `${data.postId}_${uid}`;
  const requestRef = db.collection('joinRequests').doc(requestId);
  const requestDoc = await requestRef.get();

  if (!requestDoc.exists) {
    throw new HttpsError('not-found', 'Join request not found');
  }

  const requestData = requestDoc.data()!;

  // Can only withdraw pending requests
  if (requestData.status !== JOIN_REQUEST_STATUS.PENDING) {
    throw new HttpsError(
      'failed-precondition',
      'Can only withdraw pending requests'
    );
  }

  // Verify ownership
  if (requestData.requesterUid !== uid) {
    throw new HttpsError('permission-denied', 'Not your request');
  }

  await requestRef.update({
    status: JOIN_REQUEST_STATUS.WITHDRAWN,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`[JoinRequest] User ${uid} withdrew request for post ${data.postId}`);

  return { success: true };
}
