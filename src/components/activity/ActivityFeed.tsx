'use client';

import { useState, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import PostCardGrid from './PostCardGrid';
import PostDetailModal from './PostDetailModal';
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
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);

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

  const handleCardClick = (post: FeedPost) => {
    setSelectedPost(post);
  };

  const handleNext = () => {
    if (!selectedPost) return;
    const idx = posts.findIndex(p => p.postId === selectedPost.postId);
    if (idx < posts.length - 1) {
      setSelectedPost(posts[idx + 1]);
    }
  };

  return (
    <>
      <PullToRefresh onRefresh={refresh}>
        <div className="flex flex-col h-full bg-white">
          <div className="flex-1 min-h-0 pb-20 pt-1">

            {loading && posts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p className="text-sm">Loading activities...</p>
              </div>
            )}

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

            {!loading && !error && posts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <p className="text-lg font-medium text-gray-600 mb-1">No activities yet</p>
                <p className="text-sm text-gray-400">Be the first to post one!</p>
              </div>
            )}

            {/* 2-col mobile, 3-col desktop grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-[6px] px-[6px] pt-[6px]">
              {posts.map((post, index) => (
                <div
                  key={post.postId}
                  ref={index === posts.length - 1 ? lastPostRef : undefined}
                >
                  <PostCardGrid post={post} onClick={handleCardClick} />
                </div>
              ))}
            </div>

            {loadingMore && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            )}
          </div>
        </div>
      </PullToRefresh>

      <CreatePostFAB />

      {/* Post Detail Modal */}
      {selectedPost && (
        <PostDetailModal
          feedPost={selectedPost}
          onClose={() => setSelectedPost(null)}
          onNext={
            posts.findIndex(p => p.postId === selectedPost.postId) < posts.length - 1
              ? handleNext
              : undefined
          }
        />
      )}
    </>
  );
}
