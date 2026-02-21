import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';

interface GroupGetMessagesData {
  groupId: string;
  cursor?: string | null; // createdAt ISO string for pagination
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

  // 1. Fetch group for membership check
  const groupDoc = await db.collection('groups').doc(data.groupId).get();
  if (!groupDoc.exists) {
    throw new HttpsError('not-found', 'Group not found');
  }

  const group = groupDoc.data()!;
  if (!group.memberUids?.includes(uid)) {
    throw new HttpsError('permission-denied', 'You are not a member of this group');
  }

  // 2. Query messages
  const pageSize = Math.min(data.limit || 50, 100);
  let query: admin.firestore.Query = db
    .collection('groupChats')
    .doc(data.groupId)
    .collection('messages')
    .orderBy('createdAt', 'asc');

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
