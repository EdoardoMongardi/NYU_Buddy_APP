import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import {
  ACTIVITY_POST_STATUS,
  CLOSE_REASON,
  JOIN_REQUEST_STATUS,
  GROUP_STATUS,
} from '../constants/activityState';

interface ClosePostData {
  postId: string;
  reason?: string; // 'creator_closed' or 'creator_deleted'
}

export async function activityPostCloseHandler(
  request: CallableRequest<ClosePostData>
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

  // 1. Fetch the post
  const postRef = db.collection('activityPosts').doc(data.postId);
  const postDoc = await postRef.get();

  if (!postDoc.exists) {
    throw new HttpsError('not-found', 'Post not found');
  }

  const post = postDoc.data()!;

  // 2. Owner check
  if (post.creatorUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the post creator can close this post');
  }

  // 3. Status check: only open or filled posts can be closed
  if (
    post.status !== ACTIVITY_POST_STATUS.OPEN &&
    post.status !== ACTIVITY_POST_STATUS.FILLED
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Post is already closed or expired'
    );
  }

  const closeReason = data.reason === 'creator_deleted'
    ? CLOSE_REASON.CREATOR_DELETED
    : CLOSE_REASON.CREATOR_CLOSED;

  // 4. Use batch to update post + expire pending requests
  const batch = db.batch();

  // Close the post
  batch.update(postRef, {
    status: ACTIVITY_POST_STATUS.CLOSED,
    closeReason: closeReason,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Expire all pending join requests for this post
  const pendingRequests = await db
    .collection('joinRequests')
    .where('postId', '==', data.postId)
    .where('status', '==', JOIN_REQUEST_STATUS.PENDING)
    .get();

  for (const reqDoc of pendingRequests.docs) {
    batch.update(reqDoc.ref, {
      status: JOIN_REQUEST_STATUS.EXPIRED,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Dissolve group if exists
  if (post.groupId) {
    const groupRef = db.collection('groups').doc(post.groupId);
    batch.update(groupRef, {
      status: GROUP_STATUS.DISSOLVED,
      dissolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  console.log(
    `[ActivityPost] Closed post ${data.postId} by user ${uid}, reason: ${closeReason}, ` +
    `expired ${pendingRequests.size} pending requests`
  );

  return { success: true };
}
