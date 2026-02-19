'use client';

import { useState, useCallback, useEffect } from 'react';
import { activityPostGetFeed, activityPostGetMine, FeedPost } from '@/lib/firebase/functions';

interface UseActivityFeedOptions {
  mine?: boolean;
}

export function useActivityFeed({ mine = false }: UseActivityFeedOptions = {}) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const fetchFeed = useCallback(async (cursor?: string | null, category?: string | null) => {
    try {
      if (!cursor) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      if (mine) {
        const res = await activityPostGetMine({ status: null });
        setPosts(res.data.posts);
        setNextCursor(null);
      } else {
        const res = await activityPostGetFeed({
          cursor: cursor || null,
          category: category ?? categoryFilter ?? null,
        });

        if (cursor) {
          setPosts((prev) => [...prev, ...res.data.posts]);
        } else {
          setPosts(res.data.posts);
        }
        setNextCursor(res.data.nextCursor);
      }
    } catch (err) {
      console.error('[useActivityFeed] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [mine, categoryFilter]);

  // Initial load
  useEffect(() => {
    fetchFeed(null, categoryFilter);
  }, [categoryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    return fetchFeed(null, categoryFilter);
  }, [fetchFeed, categoryFilter]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    await fetchFeed(nextCursor, categoryFilter);
  }, [fetchFeed, nextCursor, loadingMore, categoryFilter]);

  const setCategory = useCallback((category: string | null) => {
    setCategoryFilter(category);
  }, []);

  return {
    posts,
    loading,
    error,
    loadingMore,
    hasMore: !!nextCursor,
    refresh,
    loadMore,
    categoryFilter,
    setCategory,
  };
}
