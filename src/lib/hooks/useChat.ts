'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { matchSendMessage } from '@/lib/firebase/functions';

export interface ChatMessage {
    id: string;
    type: 'text' | 'status';
    senderUid: string;
    content: string;
    statusValue?: string;
    createdAt: Timestamp | null;
}

const MAX_CHARS = 500;
const MAX_WORDS = 100;
const MAX_TOTAL_MESSAGES = 400;

/**
 * Real-time chat hook for an active match.
 * Subscribes to the messages subcollection and provides send functionality.
 */
export function useChat(matchId: string | null) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const listenerRef = useRef<(() => void) | null>(null);

    // Subscribe to messages
    useEffect(() => {
        if (!matchId) {
            setMessages([]);
            setTotalCount(0);
            return;
        }

        const db = getFirebaseDb();
        const messagesRef = collection(db, 'matches', matchId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const msgs: ChatMessage[] = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    type: doc.data().type || 'text',
                    senderUid: doc.data().senderUid,
                    content: doc.data().content,
                    statusValue: doc.data().statusValue,
                    createdAt: doc.data().createdAt,
                }));
                setMessages(msgs);
                setTotalCount(msgs.length);
            },
            (err) => {
                console.error('[useChat] Listener error:', err);
                setError('Failed to load messages');
            }
        );

        listenerRef.current = unsubscribe;
        return () => unsubscribe();
    }, [matchId]);

    // Validate message content (client-side for instant feedback)
    const validateContent = useCallback((content: string): string | null => {
        const trimmed = content.trim();
        if (trimmed.length === 0) return 'Message cannot be empty';
        if (trimmed.length > MAX_CHARS) return `Message exceeds ${MAX_CHARS} character limit`;
        const wordCount = trimmed.split(/\s+/).length;
        if (wordCount > MAX_WORDS) return `Message exceeds ${MAX_WORDS} word limit`;
        if (totalCount >= MAX_TOTAL_MESSAGES) return `Chat has reached the ${MAX_TOTAL_MESSAGES} message limit`;
        return null;
    }, [totalCount]);

    // Send a message
    const sendMessage = useCallback(async (content: string) => {
        if (!matchId) return;

        const validationError = validateContent(content);
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsSending(true);
        setError(null);

        try {
            await matchSendMessage({ matchId, content: content.trim() });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to send message';
            setError(message);
            console.error('[useChat] Send error:', err);
        } finally {
            setIsSending(false);
        }
    }, [matchId, validateContent]);

    return {
        messages,
        sendMessage,
        isSending,
        error,
        totalCount,
        isAtLimit: totalCount >= MAX_TOTAL_MESSAGES,
        validateContent,
    };
}
