import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { JOIN_REQUEST_STATUS } from '../constants/activityState';

interface GetMyJoinRequestsData {
  status?: string | null;
}

const VALID_STATUSES: string[] = [
  JOIN_REQUEST_STATUS.PENDING,
  JOIN_REQUEST_STATUS.ACCEPTED,
  JOIN_REQUEST_STATUS.DECLINED,
  JOIN_REQUEST_STATUS.WITHDRAWN,
  JOIN_REQUEST_STATUS.EXPIRED,
];

export async function joinRequestGetMineHandler(
  request: CallableRequest<GetMyJoinRequestsData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const data = request.data || {};
  const db = admin.firestore();

  let query: admin.firestore.Query = db
    .collection('joinRequests')
    .where('requesterUid', '==', uid);

  if (data.status && VALID_STATUSES.includes(data.status)) {
    query = query.where('status', '==', data.status);
  }

  query = query.orderBy('createdAt', 'desc').limit(50);

  const snapshot = await query.get();

  const requests = snapshot.docs.map((doc) => {
    const r = doc.data();
    return {
      requestId: doc.id,
      postId: r.postId,
      requesterUid: r.requesterUid,
      requesterDisplayName: r.requesterDisplayName,
      requesterPhotoURL: r.requesterPhotoURL,
      message: r.message,
      status: r.status,
      respondedAt: r.respondedAt?.toDate?.()?.toISOString() || null,
      createdAt: r.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: r.updatedAt?.toDate?.()?.toISOString() || null,
    };
  });

  return { requests };
}
