'use client';

import { useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import ActivityPostCard from './ActivityPostCard';
import CreatePostFAB from './CreatePostFAB';
import { FeedPost } from '@/lib/firebase/functions';

import PullToRefresh from '@/components/ui/PullToRefresh';

interface ActivityFeedProps {
  posts: FeedPost[];
  loading: boolean;
  error: string | null;
  loadingMore: boolean;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export default function ActivityFeed({
  posts,
  loading,
  error,
  loadingMore,
  hasMore,
  refresh,
  loadMore,
}: ActivityFeedProps) {

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
    <PullToRefresh onRefresh={refresh}>
      <div className="flex flex-col h-full bg-white">
        {/* Feed content */}
        <div className="flex-1 min-h-0 pb-20 pt-1">

          {/* Loading state */}
          {loading && posts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm">Loading activities...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mx-4 mb-3">
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
          <div className="space-y-0">
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
      </div>

      {/* FAB */}
      <CreatePostFAB />
    </PullToRefresh>
  );
}
