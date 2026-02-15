import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { sendNotificationToUser } from '../utils/notifications';
import {
  ACTIVITY_POST_STATUS,
} from '../constants/activityState';

interface GroupLeaveData {
  groupId: string;
}

export async function groupLeaveHandler(
  request: CallableRequest<GroupLeaveData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const data = request.data;
  const db = admin.firestore();

  if (!data.groupId) {
    throw new HttpsError('invalid-argument', 'Group ID is required');
  }

  // 1. Fetch group
  const groupRef = db.collection('groups').doc(data.groupId);
  const groupDoc = await groupRef.get();

  if (!groupDoc.exists) {
    throw new HttpsError('not-found', 'Group not found');
  }

  const group = groupDoc.data()!;

  // 2. Membership check
  if (!group.memberUids?.includes(uid)) {
    throw new HttpsError('permission-denied', 'You are not a member of this group');
  }

  // 3. Creator cannot leave their own group (they should close the post instead)
  if (group.creatorUid === uid) {
    throw new HttpsError(
      'failed-precondition',
      'Creator cannot leave their own group. Close the post instead.'
    );
  }

  // 4. Fetch the linked post
  const postRef = db.collection('activityPosts').doc(group.postId);
  const postDoc = await postRef.get();

  // 5. Get user display name for system message
  const userDoc = await db.collection('users').doc(uid).get();
  const displayName = userDoc.exists ? userDoc.data()!.displayName : 'Someone';

  // 6. Update group
  await groupRef.update({
    memberUids: admin.firestore.FieldValue.arrayRemove(uid),
    memberCount: admin.firestore.FieldValue.increment(-1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 7. Add system message to group chat
  await db
    .collection('groupChats')
    .doc(data.groupId)
    .collection('messages')
    .add({
      senderUid: 'system',
      senderDisplayName: 'System',
      body: `${displayName} left the group`,
      type: 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  // 8. Update post: decrement acceptedCount, re-open if was filled
  if (postDoc.exists) {
    const post = postDoc.data()!;
    const postUpdates: Record<string, unknown> = {
      acceptedCount: admin.firestore.FieldValue.increment(-1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (post.status === ACTIVITY_POST_STATUS.FILLED) {
      postUpdates.status = ACTIVITY_POST_STATUS.OPEN;
    }

    await postRef.update(postUpdates);

    // Notify creator that someone left
    await sendNotificationToUser(post.creatorUid, {
      title: 'Participant Left',
      body: `${displayName} left your activity`,
      data: {
        type: 'participant_left',
        postId: group.postId,
        groupId: data.groupId,
      },
    }).catch((err) => {
      console.error('[GroupLeave] Failed to send notification:', err);
    });
  }

  console.log(`[Group] User ${uid} left group ${data.groupId}`);

  return { success: true };
}
