import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';

interface AskGetThreadsData {
    role: 'asker' | 'creator';
    cursor?: string | null;
    limit?: number;
}

export async function askGetThreadsHandler(
    request: CallableRequest<AskGetThreadsData>
) {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    await requireEmailVerification(request);

    const uid = request.auth.uid;
    const data = request.data;
    const db = admin.firestore();

    if (!data.role || (data.role !== 'asker' && data.role !== 'creator')) {
        throw new HttpsError('invalid-argument', 'Valid roled is required ("asker" or "creator")');
    }

    const queryField = data.role === 'asker' ? 'askerUid' : 'creatorUid';
    const pageSize = Math.min(data.limit || 20, 50);

    let query: admin.firestore.Query = db
        .collection('asks')
        .where(queryField, '==', uid)
        .orderBy('lastMessageAt', 'desc');

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

    // Enrich with post info
    const askThreads = await Promise.all(
        docs.map(async (doc) => {
            const d = doc.data();
            let postData = null;
            if (d.postId) {
                const postDoc = await db.collection('activityPosts').doc(d.postId).get();
                if (postDoc.exists) {
                    const p = postDoc.data()!;
                    postData = {
                        ...p,
                        createdAt: p.createdAt?.toDate?.()?.toISOString() || null,
                        expiresAt: p.expiresAt?.toDate?.()?.toISOString() || null,
                        updatedAt: p.updatedAt?.toDate?.()?.toISOString() || null,
                    };
                }
            }

            return {
                ...d,
                createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
                lastMessageAt: d.lastMessageAt?.toDate?.()?.toISOString() || null,
                post: postData,
            };
        })
    );

    const lastDoc = docs[docs.length - 1];
    const nextCursor = hasMore && lastDoc
        ? lastDoc.data().lastMessageAt?.toDate?.()?.toISOString() || null
        : null;

    return {
        askThreads,
        nextCursor,
    };
}
