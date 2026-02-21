import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';

interface AskGetThreadData {
    postId: string;
    targetAskerUid?: string; // required if creator is fetching
    cursor?: string | null;
    limit?: number;
}

export async function askGetThreadHandler(
    request: CallableRequest<AskGetThreadData>
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

    // 1. Determine the askId
    const postDoc = await db.collection('activityPosts').doc(data.postId).get();
    if (!postDoc.exists) {
        throw new HttpsError('not-found', 'Post not found');
    }

    const post = postDoc.data()!;
    const isCreator = uid === post.creatorUid;
    const askerUid = isCreator ? data.targetAskerUid : uid;

    if (isCreator && !askerUid) {
        // Fetch ALL ask threads for this post
        const asksSnap = await db.collection('asks')
            .where('postId', '==', data.postId)
            .where('creatorUid', '==', uid)
            .get();

        const messagePromises = asksSnap.docs.map(askDoc => {
            return db.collection('asks')
                .doc(askDoc.id)
                .collection('messages')
                .get();
        });

        const messagesSnaps = await Promise.all(messagePromises);
        let allMessages: any[] = [];

        for (let i = 0; i < messagesSnaps.length; i++) {
            const snap = messagesSnaps[i];
            const askDoc = asksSnap.docs[i];
            // askId is formatted as postId_askerUid
            const currentAskerUid = askDoc.id.split('_')[1];

            snap.docs.forEach(doc => {
                const d = doc.data();
                allMessages.push({
                    id: doc.id,
                    senderUid: d.senderUid,
                    senderDisplayName: d.senderDisplayName,
                    body: d.body,
                    createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
                    askerUid: currentAskerUid,
                });
            });
        }

        // Sort chronologically
        allMessages.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

        return {
            askThread: null,
            messages: allMessages,
            nextCursor: null,
        };
    }

    if (!askerUid) {
        throw new HttpsError('invalid-argument', 'targetAskerUid is required');
    }

    const askId = `${data.postId}_${askerUid}`;

    // 2. Fetch thread metadata
    const askDoc = await db.collection('asks').doc(askId).get();
    if (!askDoc.exists) {
        return { askThread: null, messages: [], nextCursor: null };
    }

    const askThread = { ...askDoc.data() };
    if (askThread.createdAt) {
        askThread.createdAt = askThread.createdAt.toDate?.()?.toISOString() || null;
    }
    if (askThread.lastMessageAt) {
        askThread.lastMessageAt = askThread.lastMessageAt.toDate?.()?.toISOString() || null;
    }

    // 3. Query messages
    const pageSize = Math.min(data.limit || 50, 100);
    let query: admin.firestore.Query = db
        .collection('asks')
        .doc(askId)
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
            createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
            askerUid: askerUid,
        };
    });

    const lastDoc = docs[docs.length - 1];
    const nextCursor = hasMore && lastDoc
        ? lastDoc.data().createdAt?.toDate?.()?.toISOString() || null
        : null;

    return {
        askThread,
        messages,
        nextCursor,
    };
}
