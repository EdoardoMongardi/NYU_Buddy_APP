/* eslint-disable @next/next/no-img-element */
'use client';

import { MapPin } from 'lucide-react';
import { FeedPost } from '@/lib/firebase/functions';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';

interface PostCardGridProps {
  post: FeedPost;
  onClick: (post: FeedPost) => void;
}

export default function PostCardGrid({ post, onClick }: PostCardGridProps) {
  const hasMedia = !!post.imageUrl;

  return (
    <button
      onClick={() => onClick(post)}
      className="relative w-full aspect-[4/5] md:aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100 touch-scale active:scale-[0.97] transition-transform cursor-pointer hover:ring-2 hover:ring-violet-300 hover:ring-offset-2"
    >
      {hasMedia ? (
        <img
          src={post.imageUrl!}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-violet-100 to-violet-50" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

      {post.locationName && (
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-white/85 backdrop-blur-sm rounded-full px-2 py-1 md:px-2.5 md:py-1.5">
          <MapPin className="w-3 h-3 text-violet-600 flex-shrink-0" />
          <span className="text-[10px] md:text-[11px] font-semibold text-gray-800 truncate max-w-[80px] md:max-w-[120px]">
            {post.locationName}
          </span>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-2.5 md:p-3">
        <p className="text-[13px] md:text-[14px] font-bold text-white leading-tight line-clamp-2 mb-1.5 drop-shadow-sm">
          {post.body.length > 60 ? post.body.slice(0, 60) + '…' : post.body}
        </p>
        <div className="flex items-center gap-1.5">
          <ProfileAvatar
            photoURL={post.creatorPhotoURL}
            displayName={post.creatorDisplayName}
            size="xs"
            className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0 ring-1 ring-white/50"
          />
          <span className="text-[11px] md:text-[12px] font-medium text-white/80 truncate drop-shadow-sm">
            {post.creatorDisplayName?.split(' ')[0]}
          </span>
        </div>
      </div>
    </button>
  );
}
