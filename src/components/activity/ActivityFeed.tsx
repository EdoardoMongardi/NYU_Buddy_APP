'use client';

import { useCallback, useRef } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { useActivityFeed } from '@/lib/hooks/useActivityFeed';
import ActivityPostCard from './ActivityPostCard';
import CategoryFilter from './CategoryFilter';
import CreatePostFAB from './CreatePostFAB';

export default function ActivityFeed() {
  const {
    posts,
    loading,
    error,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
    categoryFilter,
    setCategory,
  } = useActivityFeed();

  const observer = useRef<IntersectionObserver | null>(null);
  const lastPostRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loadingMore) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      });
      if (node) observer.current.observe(node);
    },
    [loadingMore, hasMore, loadMore]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Category Filter */}
      <div className="shrink-0 py-3">
        <CategoryFilter selected={categoryFilter} onSelect={setCategory} />
      </div>

      {/* Feed content */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-20">
        {/* Pull-to-refresh button */}
        <div className="flex justify-center mb-3">
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Loading state */}
        {loading && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">Loading activities...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mx-1 mb-3">
            <p className="text-red-700 text-sm text-center">{error}</p>
            <button
              onClick={refresh}
              className="mt-2 text-red-600 text-sm font-medium w-full text-center"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-lg font-medium text-gray-600 mb-1">No activities yet</p>
            <p className="text-sm text-gray-400">Be the first to post one!</p>
          </div>
        )}

        {/* Posts */}
        <div className="space-y-3 px-0.5">
          {posts.map((post, index) => (
            <div
              key={post.postId}
              ref={index === posts.length - 1 ? lastPostRef : undefined}
            >
              <ActivityPostCard post={post} />
            </div>
          ))}
        </div>

        {/* Loading more indicator */}
        {loadingMore && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}
      </div>

      {/* FAB */}
      <CreatePostFAB />
    </div>
  );
}
