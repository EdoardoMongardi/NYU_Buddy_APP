import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { JOIN_REQUEST_STATUS } from '../constants/activityState';

interface GroupGetMessagesData {
  groupId: string;
  cursor?: string | null;
  limit?: number;
}

export async function groupGetMessagesHandler(
  request: CallableRequest<GroupGetMessagesData>
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

  const groupDoc = await db.collection('groups').doc(data.groupId).get();
  if (!groupDoc.exists) {
    throw new HttpsError('not-found', 'Group not found');
  }

  const group = groupDoc.data()!;
  let messagesCutoff: admin.firestore.Timestamp | null = null;

  if (!group.memberUids?.includes(uid)) {
    const requestId = `${group.postId}_${uid}`;
    const requestDoc = await db.collection('joinRequests').doc(requestId).get();
    if (!requestDoc.exists) {
      throw new HttpsError('permission-denied', 'You are not a member of this group');
    }
    const reqData = requestDoc.data()!;
    if (
      reqData.status !== JOIN_REQUEST_STATUS.KICKED &&
      reqData.status !== JOIN_REQUEST_STATUS.LEFT
    ) {
      throw new HttpsError('permission-denied', 'You are not a member of this group');
    }
    messagesCutoff = reqData.updatedAt || null;
  }

  const pageSize = Math.min(data.limit || 50, 100);
  let query: admin.firestore.Query = db
    .collection('groupChats')
    .doc(data.groupId)
    .collection('messages')
    .orderBy('createdAt', 'asc');

  if (messagesCutoff) {
    query = query.where('createdAt', '<=', messagesCutoff);
  }

  if (data.cursor) {
    const cursorDate = new Date(data.cursor);
    if (!isNaN(cursorDate.getTime())) {
      const cursorTimestamp = admin.firestore.Timestamp.fromDate(cursorDate);
      query = query.startAfter(cursorTimestamp);
    }
  }

  query = query.limit(pageSize + 1);

  const snapshot = await query.get();
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  const messages = docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      senderUid: d.senderUid,
      senderDisplayName: d.senderDisplayName,
      senderPhotoURL: d.senderPhotoURL ?? null,
      body: d.body,
      type: d.type,
      createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
    };
  });

  const lastDoc = docs[docs.length - 1];
  const nextCursor = hasMore && lastDoc
    ? lastDoc.data().createdAt?.toDate?.()?.toISOString() || null
    : null;

  return {
    messages,
    nextCursor,
  };
}
