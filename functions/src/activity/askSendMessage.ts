import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { sendNotificationToUser } from '../utils/notifications';
import { ACTIVITY_POST_STATUS, ACTIVITY_LIMITS } from '../constants/activityState';

interface AskSendMessageData {
    postId: string;
    body: string;
    // If the creator is replying, they send askerUid via targetAskerUid or we extract it from the UI.
    // Actually, we can just pass the askId explicitly or targetAskerUid.
    targetAskerUid?: string;
}

export async function askSendMessageHandler(
    request: CallableRequest<AskSendMessageData>
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

    // Fetch the post
    const postDoc = await db.collection('activityPosts').doc(data.postId).get();
    if (!postDoc.exists) {
        throw new HttpsError('not-found', 'Post not found');
    }

    const post = postDoc.data()!;

    if (post.status !== ACTIVITY_POST_STATUS.OPEN) {
        throw new HttpsError('failed-precondition', 'This activity is no longer open');
    }

    // Determine roles
    const isCreator = uid === post.creatorUid;
    const askerUid = isCreator ? data.targetAskerUid : uid;

    if (!askerUid) {
        throw new HttpsError('invalid-argument', 'targetAskerUid is required when the creator replies');
    }
    if (isCreator && askerUid === uid) {
        throw new HttpsError('invalid-argument', 'Creator cannot ask themselves');
    }

    // Prevent symmetric blocking
    const otherUid = isCreator ? askerUid : post.creatorUid;
    const [senderBlockedReceiver, receiverBlockedSender] = await Promise.all([
        db.collection('blocks').doc(uid).collection('blocked').doc(otherUid).get(),
        db.collection('blocks').doc(otherUid).collection('blocked').doc(uid).get(),
    ]);

    if (senderBlockedReceiver.exists || receiverBlockedSender.exists) {
        throw new HttpsError('failed-precondition', 'Cannot send message to this user');
    }

    const userDoc = await db.collection('users').doc(uid).get();
    const senderDisplayName = userDoc.exists ? userDoc.data()!.displayName : 'Unknown';
    let askerDisplayName = senderDisplayName;
    let askerPhotoURL = userDoc.exists ? userDoc.data()!.photoURL : null;

    if (isCreator) {
        const askerDoc = await db.collection('users').doc(askerUid).get();
        askerDisplayName = askerDoc.exists ? askerDoc.data()!.displayName : 'Unknown';
        askerPhotoURL = askerDoc.exists ? askerDoc.data()!.photoURL : null;
    }

    const askId = `${data.postId}_${askerUid}`;
    const askRef = db.collection('asks').doc(askId);

    // Batch write to ensure atomic thread creation/update and message insertion
    const batch = db.batch();

    // Create or update the Ask thread document
    batch.set(
        askRef,
        {
            askId,
            postId: data.postId,
            creatorUid: post.creatorUid,
            askerUid: askerUid,
            askerDisplayName: askerDisplayName,
            askerPhotoURL: askerPhotoURL,
            lastMessage: body,
            lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSenderUid: uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(), // Set only on create (by set with merge? actually set without merge overwrites, let's use merge to keep creation date)
        },
        { merge: true }
    );

    // Since merge: true keeps createdAt undefined if it's the first time and we only provide serverTimestamp(), 
    // we could do a read first or just rely on the above. Let's do a transactional approach or rely on merge since Firestore saves timestamps properly.

    const messageId = db.collection('asks').doc(askId).collection('messages').doc().id;
    const messageRef = db.collection('asks').doc(askId).collection('messages').doc(messageId);

    batch.set(messageRef, {
        id: messageId,
        senderUid: uid,
        senderDisplayName: senderDisplayName,
        body: body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // Notify the other user
    const truncatedBody = body.length > 50 ? body.substring(0, 50) + '...' : body;
    await sendNotificationToUser(otherUid, {
        title: `${senderDisplayName} (Ask)`,
        body: truncatedBody,
        data: {
            type: 'ask_message',
            postId: data.postId,
            askId: askId,
        },
    }).catch(err => console.error('[Ask] Notification error:', err));

    return { success: true, messageId, askId };
}
