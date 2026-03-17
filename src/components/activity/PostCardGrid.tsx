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
      className="w-full text-left rounded-[4px] overflow-hidden bg-white active:scale-[0.98] transition-transform cursor-pointer"
    >
      {/* Image */}
      <div className="relative w-full aspect-[3/4]">
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
      <div className="px-2 pt-2 pb-2.5">
        <p className="text-[13px] md:text-[14px] font-semibold text-gray-900 leading-snug line-clamp-2 break-words">
          {displayTitle}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <ProfileAvatar
            photoURL={post.creatorPhotoURL}
            displayName={post.creatorDisplayName}
            size="xs"
            className="w-4 h-4 flex-shrink-0"
          />
          <span className="text-[11px] text-gray-400 truncate">
            {post.creatorDisplayName?.split(' ')[0]}
          </span>
        </div>
      </div>
    </button>
  );
}
