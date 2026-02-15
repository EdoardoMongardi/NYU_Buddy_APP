import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { sendNotificationToUser } from '../utils/notifications';
import {
  ACTIVITY_POST_STATUS,
  JOIN_REQUEST_STATUS,
  GROUP_STATUS,
} from '../constants/activityState';

interface RespondJoinRequestData {
  postId: string;
  requesterUid: string;
  action: 'accept' | 'decline';
}

export async function joinRequestRespondHandler(
  request: CallableRequest<RespondJoinRequestData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const data = request.data;
  const db = admin.firestore();

  if (!data.postId || !data.requesterUid || !data.action) {
    throw new HttpsError('invalid-argument', 'postId, requesterUid, and action are required');
  }

  if (data.action !== 'accept' && data.action !== 'decline') {
    throw new HttpsError('invalid-argument', 'Action must be accept or decline');
  }

  // 1. Fetch the post
  const postRef = db.collection('activityPosts').doc(data.postId);
  const postDoc = await postRef.get();

  if (!postDoc.exists) {
    throw new HttpsError('not-found', 'Post not found');
  }

  const post = postDoc.data()!;

  // 2. Creator check
  if (post.creatorUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the post creator can respond to requests');
  }

  // 3. Fetch the join request
  const requestId = `${data.postId}_${data.requesterUid}`;
  const requestRef = db.collection('joinRequests').doc(requestId);
  const requestDoc = await requestRef.get();

  if (!requestDoc.exists) {
    throw new HttpsError('not-found', 'Join request not found');
  }

  const joinRequest = requestDoc.data()!;

  if (joinRequest.status !== JOIN_REQUEST_STATUS.PENDING) {
    throw new HttpsError(
      'failed-precondition',
      'Request is no longer pending'
    );
  }

  // ==================
  // DECLINE PATH
  // ==================
  if (data.action === 'decline') {
    await requestRef.update({
      status: JOIN_REQUEST_STATUS.DECLINED,
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Notify requester
    const truncatedBody = post.body.length > 30
      ? post.body.substring(0, 30) + '...'
      : post.body;

    await sendNotificationToUser(data.requesterUid, {
      title: 'Request Update',
      body: `Your request for "${truncatedBody}" was not accepted`,
      data: {
        type: 'join_request_declined',
        postId: data.postId,
      },
    }).catch((err) => {
      console.error('[JoinRequest] Failed to send decline notification:', err);
    });

    console.log(`[JoinRequest] Creator ${uid} declined request from ${data.requesterUid} on post ${data.postId}`);
    return { success: true, action: 'declined' };
  }

  // ==================
  // ACCEPT PATH
  // ==================

  // Check post is still open
  if (post.status !== ACTIVITY_POST_STATUS.OPEN) {
    throw new HttpsError(
      'failed-precondition',
      'Post is no longer accepting requests'
    );
  }

  // Simple slot check (Round A: no transaction, simple check)
  const currentAccepted = post.acceptedCount || 0;
  if (currentAccepted >= post.maxParticipants) {
    throw new HttpsError(
      'failed-precondition',
      'All participant slots are filled'
    );
  }

  const batch = db.batch();

  // Update join request to accepted
  batch.update(requestRef, {
    status: JOIN_REQUEST_STATUS.ACCEPTED,
    respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Create or update group
  let groupId = post.groupId;
  if (!groupId) {
    // First accept — create group
    const groupRef = db.collection('groups').doc();
    groupId = groupRef.id;

    batch.set(groupRef, {
      groupId: groupRef.id,
      postId: data.postId,
      creatorUid: uid,
      memberUids: [uid, data.requesterUid],
      memberCount: 2,
      status: GROUP_STATUS.ACTIVE,
      dissolvedAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Link group to post
    batch.update(postRef, {
      groupId: groupRef.id,
    });

    // Create system message in group chat
    const msgRef = db
      .collection('groupChats')
      .doc(groupRef.id)
      .collection('messages')
      .doc();

    batch.set(msgRef, {
      senderUid: 'system',
      senderDisplayName: 'System',
      body: `${joinRequest.requesterDisplayName} joined the activity`,
      type: 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    // Subsequent accept — add to existing group
    const groupRef = db.collection('groups').doc(groupId);

    batch.update(groupRef, {
      memberUids: admin.firestore.FieldValue.arrayUnion(data.requesterUid),
      memberCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // System message
    const msgRef = db
      .collection('groupChats')
      .doc(groupId)
      .collection('messages')
      .doc();

    batch.set(msgRef, {
      senderUid: 'system',
      senderDisplayName: 'System',
      body: `${joinRequest.requesterDisplayName} joined the activity`,
      type: 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Increment acceptedCount on post
  const newAccepted = currentAccepted + 1;
  const postUpdates: Record<string, unknown> = {
    acceptedCount: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Check if this fills the post
  if (newAccepted >= post.maxParticipants) {
    postUpdates.status = ACTIVITY_POST_STATUS.FILLED;
  }

  batch.update(postRef, postUpdates);

  // Update requester stats
  batch.update(db.collection('users').doc(data.requesterUid), {
    'activityStats.postsJoined': admin.firestore.FieldValue.increment(1),
    'activityStats.requestsAccepted': admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // Notify requester of acceptance
  const truncatedBody = post.body.length > 30
    ? post.body.substring(0, 30) + '...'
    : post.body;

  await sendNotificationToUser(data.requesterUid, {
    title: "You're in!",
    body: `${post.creatorDisplayName} accepted your request for "${truncatedBody}"`,
    data: {
      type: 'join_request_accepted',
      postId: data.postId,
      groupId: groupId || '',
    },
  }).catch((err) => {
    console.error('[JoinRequest] Failed to send accept notification:', err);
  });

  console.log(
    `[JoinRequest] Creator ${uid} accepted request from ${data.requesterUid} on post ${data.postId}, ` +
    `groupId: ${groupId}, newAccepted: ${newAccepted}/${post.maxParticipants}`
  );

  return {
    success: true,
    action: 'accepted',
    groupId: groupId,
  };
}
