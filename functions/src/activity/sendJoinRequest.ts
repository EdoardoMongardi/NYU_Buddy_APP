import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { sendNotificationToUser } from '../utils/notifications';
import {
  ACTIVITY_POST_STATUS,
  JOIN_REQUEST_STATUS,
  ACTIVITY_LIMITS,
} from '../constants/activityState';

interface SendJoinRequestData {
  postId: string;
  message?: string | null;
}

export async function joinRequestSendHandler(
  request: CallableRequest<SendJoinRequestData>
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

  // Validate message
  if (data.message && data.message.length > ACTIVITY_LIMITS.JOIN_MESSAGE_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Message must be at most ${ACTIVITY_LIMITS.JOIN_MESSAGE_MAX_LENGTH} characters`
    );
  }

  // 1. Fetch the post
  const postRef = db.collection('activityPosts').doc(data.postId);
  const postDoc = await postRef.get();

  if (!postDoc.exists) {
    throw new HttpsError('not-found', 'Post not found');
  }

  const post = postDoc.data()!;

  // 2. Cannot request your own post
  if (post.creatorUid === uid) {
    throw new HttpsError('failed-precondition', 'Cannot request to join your own post');
  }

  // 3. Post must be open
  if (post.status !== ACTIVITY_POST_STATUS.OPEN) {
    throw new HttpsError(
      'failed-precondition',
      'This activity is no longer accepting requests'
    );
  }

  // 4. Symmetric block check
  const [senderBlockedCreator, creatorBlockedSender] = await Promise.all([
    db.collection('blocks').doc(uid).collection('blocked').doc(post.creatorUid).get(),
    db.collection('blocks').doc(post.creatorUid).collection('blocked').doc(uid).get(),
  ]);

  if (senderBlockedCreator.exists) {
    throw new HttpsError('failed-precondition', 'Cannot send request to this user');
  }
  if (creatorBlockedSender.exists) {
    throw new HttpsError('failed-precondition', 'This user is not available');
  }

  // 5. Check for existing request (idempotency via composite ID)
  const requestId = `${data.postId}_${uid}`;
  const existingRequest = await db.collection('joinRequests').doc(requestId).get();

  // 5a. Also check if user is already in the group (they might have been accepted but request state got wonky)
  if (post.groupId) {
    const groupDoc = await db.collection('groups').doc(post.groupId).get();
    if (groupDoc.exists) {
      const g = groupDoc.data()!;
      if (g.memberUids?.includes(uid)) {
        throw new HttpsError(
          'failed-precondition',
          'You are already part of this activity'
        );
      }
    }
  }

  if (existingRequest.exists) {
    const existing = existingRequest.data()!;
    if (existing.status === JOIN_REQUEST_STATUS.PENDING) {
      // Already pending — idempotent return
      return { requestId, status: JOIN_REQUEST_STATUS.PENDING };
    }
    if (existing.status === JOIN_REQUEST_STATUS.DECLINED) {
      throw new HttpsError(
        'failed-precondition',
        'Your request was already declined for this activity'
      );
    }
    if (existing.status === JOIN_REQUEST_STATUS.ACCEPTED) {
      throw new HttpsError(
        'failed-precondition',
        'You are already part of this activity'
      );
    }
    if (existing.status === JOIN_REQUEST_STATUS.WITHDRAWN) {
      // Allow re-request after withdrawal — update the existing doc
      await db.collection('joinRequests').doc(requestId).update({
        status: JOIN_REQUEST_STATUS.PENDING,
        message: data.message?.trim() || null,
        respondedAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { requestId, status: JOIN_REQUEST_STATUS.PENDING };
    }
  }

  // 6. Rate limit: max 10 pending requests across all posts
  const pendingRequestsQuery = await db
    .collection('joinRequests')
    .where('requesterUid', '==', uid)
    .where('status', '==', JOIN_REQUEST_STATUS.PENDING)
    .get();

  if (pendingRequestsQuery.size >= ACTIVITY_LIMITS.MAX_PENDING_REQUESTS) {
    throw new HttpsError(
      'resource-exhausted',
      `Maximum ${ACTIVITY_LIMITS.MAX_PENDING_REQUESTS} pending requests allowed`
    );
  }

  // 7. Get requester profile for denormalized fields
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User profile not found');
  }
  const userData = userDoc.data()!;

  // 8. Create the join request
  const requestData = {
    postId: data.postId,
    creatorUid: post.creatorUid,
    requesterUid: uid,
    requesterDisplayName: userData.displayName || '',
    requesterPhotoURL: userData.photoURL || null,
    message: data.message?.trim() || null,
    status: JOIN_REQUEST_STATUS.PENDING,
    respondedAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection('joinRequests').doc(requestId).set(requestData);

  // 9. Update requester stats
  await db.collection('users').doc(uid).update({
    'activityStats.requestsSent': admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 10. Notify the creator
  const truncatedBody = post.body.length > 40
    ? post.body.substring(0, 40) + '...'
    : post.body;

  await sendNotificationToUser(post.creatorUid, {
    title: 'New Join Request',
    body: `${userData.displayName} wants to join: "${truncatedBody}"`,
    data: {
      type: 'join_request_received',
      postId: data.postId,
      requesterUid: uid,
    },
  }).catch((err) => {
    console.error('[JoinRequest] Failed to send notification:', err);
  });

  console.log(`[JoinRequest] User ${uid} requested to join post ${data.postId}`);

  return { requestId, status: JOIN_REQUEST_STATUS.PENDING };
}
