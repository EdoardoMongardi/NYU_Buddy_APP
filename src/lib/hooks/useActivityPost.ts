'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { activityPostGetById, PostDetail, JoinRequestInfo, GroupInfo } from '@/lib/firebase/functions';

interface UseActivityPostReturn {
  post: PostDetail | null;
  joinRequests: JoinRequestInfo[] | null;
  group: GroupInfo | null;
  myJoinRequest: { requestId: string; status: string; message: string | null; createdAt: string | null } | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useActivityPost(postId: string | null): UseActivityPostReturn {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequestInfo[] | null>(null);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [myJoinRequest, setMyJoinRequest] = useState<{ requestId: string; status: string; message: string | null; createdAt: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!postId) return;
    try {
      setError(null);
      const result = await activityPostGetById({ postId });
      // #region agent log
      fetch('http://127.0.0.1:7276/ingest/3b772985-a450-48d2-8329-a96e1da0faa0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'079af5'},body:JSON.stringify({sessionId:'079af5',location:'useActivityPost.ts:fetchDetails',message:'activityPostGetById result',data:{postId,myJoinRequestStatus:result.data.myJoinRequest?.status||null,myJoinRequestId:result.data.myJoinRequest?.requestId||null,groupId:result.data.group?.groupId||null,groupMemberUids:result.data.group?.memberUids||null,postStatus:result.data.post?.status||null,postGroupId:result.data.post?.groupId||null},timestamp:Date.now(),hypothesisId:'A,B,C'})}).catch(()=>{});
      // #endregion
      setPost(result.data.post);
      setJoinRequests(result.data.joinRequests);
      setGroup(result.data.group);
      setMyJoinRequest(result.data.myJoinRequest);
    } catch (err) {
      console.error('[useActivityPost] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load post');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  // Initial fetch
  useEffect(() => {
    if (!postId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchDetails();
  }, [postId, fetchDetails]);

  // Real-time listener on the post document for status changes
  useEffect(() => {
    if (!postId) return;

    const unsubscribe = onSnapshot(
      doc(getFirebaseDb(), 'activityPosts', postId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setPost((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              status: data.status,
              acceptedCount: data.acceptedCount,
              groupId: data.groupId,
              closeReason: data.closeReason,
              updatedAt: data.updatedAt?.toDate?.()?.toISOString() || prev.updatedAt,
            };
          });
        }
      },
      (err) => {
        console.error('[useActivityPost] Snapshot error:', err);
      }
    );

    return () => unsubscribe();
  }, [postId]);

  return {
    post,
    joinRequests,
    group,
    myJoinRequest,
    loading,
    error,
    refresh: fetchDetails,
  };
}
