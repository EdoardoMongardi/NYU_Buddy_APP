'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { groupSendMessage, GroupChatMsg } from '@/lib/firebase/functions';

interface UseGroupChatReturn {
  messages: GroupChatMsg[];
  loading: boolean;
  error: string | null;
  removed: boolean;
  sendMessage: (body: string) => Promise<void>;
  sending: boolean;
}

export function useGroupChat(groupId: string | null): UseGroupChatReturn {
  const [messages, setMessages] = useState<GroupChatMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
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
            senderPhotoURL: data.senderPhotoURL ?? null,
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
        // #region agent log
        fetch('http://127.0.0.1:7276/ingest/3b772985-a450-48d2-8329-a96e1da0faa0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'079af5'},body:JSON.stringify({sessionId:'079af5',location:'useGroupChat.ts:snapshotError',message:'Firestore snapshot error',data:{groupId,errorCode:err?.code,errorMessage:err?.message,initialLoadDone:initialLoadDone.current},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        const isPermissionError =
          err?.code === 'permission-denied' ||
          err?.message?.includes('Missing or insufficient permissions');
        if (isPermissionError && initialLoadDone.current) {
          setRemoved(true);
        } else {
          setError('Failed to load messages');
        }
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
    removed,
    sendMessage,
    sending,
  };
}
