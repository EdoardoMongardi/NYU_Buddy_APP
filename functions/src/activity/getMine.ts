import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import {
  ACTIVITY_POST_STATUS,
  ActivityPostStatus,
} from '../constants/activityState';

interface GetMineData {
  status?: string | null; // optional filter by status
}

const VALID_STATUSES: string[] = [
  ACTIVITY_POST_STATUS.OPEN,
  ACTIVITY_POST_STATUS.FILLED,
  ACTIVITY_POST_STATUS.CLOSED,
  ACTIVITY_POST_STATUS.EXPIRED,
];

export async function activityPostGetMineHandler(
  request: CallableRequest<GetMineData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const data = request.data || {};
  const db = admin.firestore();

  let query: admin.firestore.Query = db
    .collection('activityPosts')
    .where('creatorUid', '==', uid);

  // Optional status filter
  if (data.status && VALID_STATUSES.includes(data.status)) {
    query = query.where('status', '==', data.status as ActivityPostStatus);
  }

  query = query.orderBy('createdAt', 'desc').limit(50);

  const snapshot = await query.get();

  const posts = snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      postId: d.postId,
      creatorUid: d.creatorUid,
      creatorDisplayName: d.creatorDisplayName,
      creatorPhotoURL: d.creatorPhotoURL,
      body: d.body,
      category: d.category,
      imageUrl: d.imageUrl,
      maxParticipants: d.maxParticipants,
      acceptedCount: d.acceptedCount,
      locationName: d.locationName,
      locationLat: d.locationLat,
      locationLng: d.locationLng,
      status: d.status,
      closeReason: d.closeReason,
      groupId: d.groupId,
      editCount: d.editCount,
      expiresAt: d.expiresAt?.toDate?.()?.toISOString() || null,
      createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: d.updatedAt?.toDate?.()?.toISOString() || null,
    };
  });

  return { posts };
}
