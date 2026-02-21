import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';

interface SendMessageData {
    matchId: string;
    content: string;
}

const MAX_CHARS = 500;
const MAX_WORDS = 100;
const MAX_TOTAL_MESSAGES = 400;

/**
 * Sends a text message in a match chat.
 * 
 * Validates:
 * - Caller is authenticated and email-verified
 * - Caller is a participant (user1Uid or user2Uid)
 * - Match is in an active state (not cancelled/completed/expired)
 * - Content ≤ 500 chars AND ≤ 100 words
 * - Total messages ≤ 400
 */
export async function matchSendMessageHandler(
    request: CallableRequest<SendMessageData>
) {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    await requireEmailVerification(request);

    const uid = request.auth.uid;
    const { matchId, content } = request.data;

    // Validate inputs
    if (!matchId || typeof matchId !== 'string') {
        throw new HttpsError('invalid-argument', 'Match ID is required');
    }

    if (!content || typeof content !== 'string') {
        throw new HttpsError('invalid-argument', 'Message content is required');
    }

    const trimmed = content.trim();

    if (trimmed.length === 0) {
        throw new HttpsError('invalid-argument', 'Message cannot be empty');
    }

    if (trimmed.length > MAX_CHARS) {
        throw new HttpsError(
            'invalid-argument',
            `Message exceeds ${MAX_CHARS} character limit (${trimmed.length} chars)`
        );
    }

    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount > MAX_WORDS) {
        throw new HttpsError(
            'invalid-argument',
            `Message exceeds ${MAX_WORDS} word limit (${wordCount} words)`
        );
    }

    const db = admin.firestore();
    const matchRef = db.collection('matches').doc(matchId);

    // Verify match exists, is active, and user is participant
    const matchSnap = await matchRef.get();

    if (!matchSnap.exists) {
        throw new HttpsError('not-found', 'Match not found');
    }

    const match = matchSnap.data()!;

    // Verify participant
    if (match.user1Uid !== uid && match.user2Uid !== uid) {
        throw new HttpsError('permission-denied', 'You are not part of this match');
    }

    // Verify match is active (not terminal)
    const terminalStatuses = ['cancelled', 'completed', 'expired_pending_confirmation'];
    if (terminalStatuses.includes(match.status)) {
        throw new HttpsError(
            'failed-precondition',
            'Cannot send messages in a finished match'
        );
    }

    // Check total message count
    const messagesRef = matchRef.collection('messages');
    const countSnapshot = await messagesRef.count().get();
    const totalCount = countSnapshot.data().count;

    if (totalCount >= MAX_TOTAL_MESSAGES) {
        throw new HttpsError(
            'resource-exhausted',
            `Chat has reached the ${MAX_TOTAL_MESSAGES} message limit`
        );
    }

    // Write the message
    const messageDoc = await messagesRef.add({
        type: 'text',
        senderUid: uid,
        content: trimmed,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update the parent match document to trigger client snapshot listeners
    await matchRef.update({
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSenderUid: uid,
    });

    console.log(`[matchSendMessage] Message ${messageDoc.id} sent by ${uid} in match ${matchId}`);

    return { success: true, messageId: messageDoc.id };
}
