/* eslint-disable @next/next/no-img-element */
'use client';

import { FeedPost } from '@/lib/firebase/functions';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';

const CATEGORY_BG: Record<string, string> = {
  coffee: 'bg-amber-50',
  study: 'bg-blue-50',
  food: 'bg-orange-50',
  event: 'bg-purple-50',
  explore: 'bg-green-50',
  sports: 'bg-red-50',
  other: 'bg-gray-100',
};

interface PostCardGridProps {
  post: FeedPost;
  onClick: (post: FeedPost) => void;
}

export default function PostCardGrid({ post, onClick }: PostCardGridProps) {
  const hasMedia = !!post.imageUrl;
  const displayTitle = post.title || post.body;

  return (
    <button
      onClick={() => onClick(post)}
      className="w-full text-left rounded-2xl overflow-hidden bg-white active:scale-[0.97] transition-transform cursor-pointer hover:ring-2 hover:ring-violet-300 hover:ring-offset-2 shadow-sm"
    >
      {/* Image */}
      <div className="relative w-full aspect-[4/5]">
        {hasMedia ? (
          <img
            src={post.imageUrl!}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className={`w-full h-full ${CATEGORY_BG[post.category] || CATEGORY_BG.other} flex items-center justify-center`}>
            <span className="text-4xl opacity-40">
              {post.category === 'coffee' && '☕'}
              {post.category === 'study' && '📚'}
              {post.category === 'food' && '🍕'}
              {post.category === 'event' && '🎉'}
              {post.category === 'explore' && '🗺️'}
              {post.category === 'sports' && '⚽'}
              {post.category === 'other' && '✨'}
            </span>
          </div>
        )}
      </div>

      {/* Info below image */}
      <div className="px-2.5 py-2 md:px-3 md:py-2.5">
        <p className="text-[13px] md:text-[14px] font-bold text-gray-900 leading-tight truncate">
          {displayTitle}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <ProfileAvatar
            photoURL={post.creatorPhotoURL}
            displayName={post.creatorDisplayName}
            size="xs"
            className="w-5 h-5 flex-shrink-0"
          />
          <span className="text-[11px] md:text-[12px] text-gray-500 truncate">
            {post.creatorDisplayName?.split(' ')[0]}
          </span>
        </div>
      </div>
    </button>
  );
}
