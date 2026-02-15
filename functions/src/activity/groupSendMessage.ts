import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { sendNotificationToUser } from '../utils/notifications';
import {
  GROUP_STATUS,
  ACTIVITY_LIMITS,
} from '../constants/activityState';

interface GroupSendMessageData {
  groupId: string;
  body: string;
}

export async function groupSendMessageHandler(
  request: CallableRequest<GroupSendMessageData>
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

  const body = data.body?.trim();
  if (!body || body.length === 0) {
    throw new HttpsError('invalid-argument', 'Message body is required');
  }
  if (body.length > ACTIVITY_LIMITS.CHAT_MESSAGE_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Message must be at most ${ACTIVITY_LIMITS.CHAT_MESSAGE_MAX_LENGTH} characters`
    );
  }

  // 1. Fetch group
  const groupDoc = await db.collection('groups').doc(data.groupId).get();
  if (!groupDoc.exists) {
    throw new HttpsError('not-found', 'Group not found');
  }

  const group = groupDoc.data()!;

  // 2. Membership check
  if (!group.memberUids?.includes(uid)) {
    throw new HttpsError('permission-denied', 'You are not a member of this group');
  }

  // 3. Group must be active
  if (group.status !== GROUP_STATUS.ACTIVE) {
    throw new HttpsError('failed-precondition', 'This group is no longer active');
  }

  // 4. Get sender profile
  const userDoc = await db.collection('users').doc(uid).get();
  const senderDisplayName = userDoc.exists ? userDoc.data()!.displayName : 'Unknown';

  // 5. Create message
  const messageRef = await db
    .collection('groupChats')
    .doc(data.groupId)
    .collection('messages')
    .add({
      senderUid: uid,
      senderDisplayName: senderDisplayName,
      body: body,
      type: 'user',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  // 6. Notify other group members (direct send, no batching in Round A)
  const otherMembers = group.memberUids.filter((m: string) => m !== uid);
  const truncatedBody = body.length > 50 ? body.substring(0, 50) + '...' : body;

  await Promise.allSettled(
    otherMembers.map((memberUid: string) =>
      sendNotificationToUser(memberUid, {
        title: `${senderDisplayName}`,
        body: truncatedBody,
        data: {
          type: 'group_chat_message',
          groupId: data.groupId,
          postId: group.postId,
        },
      })
    )
  );

  return { success: true, messageId: messageRef.id };
}
