import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { sendNotificationToUser } from '../utils/notifications';
import {
  ACTIVITY_POST_STATUS,
} from '../constants/activityState';

interface GroupKickData {
  groupId: string;
  targetUid: string;
}

export async function groupKickHandler(
  request: CallableRequest<GroupKickData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const data = request.data;
  const db = admin.firestore();

  if (!data.groupId || !data.targetUid) {
    throw new HttpsError('invalid-argument', 'groupId and targetUid are required');
  }

  // 1. Fetch group
  const groupRef = db.collection('groups').doc(data.groupId);
  const groupDoc = await groupRef.get();

  if (!groupDoc.exists) {
    throw new HttpsError('not-found', 'Group not found');
  }

  const group = groupDoc.data()!;

  // 2. Creator check
  if (group.creatorUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the creator can remove participants');
  }

  // 3. Can't kick yourself
  if (data.targetUid === uid) {
    throw new HttpsError('failed-precondition', 'Cannot kick yourself');
  }

  // 4. Target must be in the group
  if (!group.memberUids?.includes(data.targetUid)) {
    throw new HttpsError('not-found', 'User is not in this group');
  }

  // 5. Get target display name
  const targetDoc = await db.collection('users').doc(data.targetUid).get();
  const targetDisplayName = targetDoc.exists ? targetDoc.data()!.displayName : 'Someone';

  // 6. Update group
  await groupRef.update({
    memberUids: admin.firestore.FieldValue.arrayRemove(data.targetUid),
    memberCount: admin.firestore.FieldValue.increment(-1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 7. System message
  await db
    .collection('groupChats')
    .doc(data.groupId)
    .collection('messages')
    .add({
      senderUid: 'system',
      senderDisplayName: 'System',
      body: `${targetDisplayName} was removed from the group`,
      type: 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  // 8. Update post
  const postRef = db.collection('activityPosts').doc(group.postId);
  const postDoc = await postRef.get();

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
  }

  // 9. Notify kicked user
  const postData = postDoc.exists ? postDoc.data()! : null;
  const truncatedBody = postData
    ? (postData.body.length > 30 ? postData.body.substring(0, 30) + '...' : postData.body)
    : 'an activity';

  await sendNotificationToUser(data.targetUid, {
    title: 'Removed from Activity',
    body: `You were removed from "${truncatedBody}"`,
    data: {
      type: 'participant_kicked',
      postId: group.postId,
      groupId: data.groupId,
    },
  }).catch((err) => {
    console.error('[GroupKick] Failed to send notification:', err);
  });

  console.log(`[Group] Creator ${uid} kicked ${data.targetUid} from group ${data.groupId}`);

  return { success: true };
}
