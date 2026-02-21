'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { groupSendMessage, GroupChatMsg } from '@/lib/firebase/functions';

interface UseGroupChatReturn {
  messages: GroupChatMsg[];
  loading: boolean;
  error: string | null;
  sendMessage: (body: string) => Promise<void>;
  sending: boolean;
}

export function useGroupChat(groupId: string | null): UseGroupChatReturn {
  const [messages, setMessages] = useState<GroupChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const initialLoadDone = useRef(false);

  // Real-time listener on group chat messages
  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    initialLoadDone.current = false;

    const messagesRef = collection(getFirebaseDb(), 'groupChats', groupId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(200));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs: GroupChatMsg[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            senderUid: data.senderUid || '',
            senderDisplayName: data.senderDisplayName || '',
            body: data.body || '',
            type: data.type || 'user',
            createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          };
        });
        setMessages(msgs);
        setLoading(false);
        initialLoadDone.current = true;
      },
      (err) => {
        console.error('[useGroupChat] Snapshot error:', err);
        setError('Failed to load messages');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [groupId]);

  const sendMessage = useCallback(async (body: string) => {
    if (!groupId || !body.trim()) return;
    setSending(true);
    try {
      await groupSendMessage({ groupId, body: body.trim() });
    } catch (err) {
      console.error('[useGroupChat] Send error:', err);
      throw err;
    } finally {
      setSending(false);
    }
  }, [groupId]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    sending,
  };
}
