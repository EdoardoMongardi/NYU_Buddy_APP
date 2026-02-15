'use client';

import { useRouter } from 'next/navigation';
import { MapPin, Clock, Users } from 'lucide-react';
import { FeedPost } from '@/lib/firebase/functions';
import { CATEGORY_LABELS, ActivityCategory } from '@/lib/schemas/activity';

const CATEGORY_COLORS: Record<string, string> = {
  coffee: 'bg-amber-100 text-amber-700',
  study: 'bg-blue-100 text-blue-700',
  food: 'bg-orange-100 text-orange-700',
  event: 'bg-purple-100 text-purple-700',
  explore: 'bg-green-100 text-green-700',
  sports: 'bg-red-100 text-red-700',
  other: 'bg-gray-100 text-gray-700',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function timeUntilExpiry(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = then - now;
  if (diffMs <= 0) return 'expired';
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m left`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h left`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d left`;
}

interface ActivityPostCardProps {
  post: FeedPost;
}

export default function ActivityPostCard({ post }: ActivityPostCardProps) {
  const router = useRouter();

  const slots = `${post.acceptedCount}/${post.maxParticipants}`;
  const isFilled = post.status === 'filled';
  const categoryColor = CATEGORY_COLORS[post.category] || CATEGORY_COLORS.other;
  const categoryLabel = CATEGORY_LABELS[post.category as ActivityCategory] || post.category;

  return (
    <button
      onClick={() => router.push(`/post/${post.postId}`)}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow active:scale-[0.99] touch-scale"
    >
      {/* Header: avatar + name + time */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
          {post.creatorPhotoURL ? (
            <img
              src={post.creatorPhotoURL}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm font-medium">
              {post.creatorDisplayName?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {post.creatorDisplayName}
          </p>
          <p className="text-[12px] text-gray-400">{timeAgo(post.createdAt)}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${categoryColor}`}>
          {categoryLabel}
        </span>
      </div>

      {/* Body */}
      <p className="text-[15px] text-gray-800 leading-relaxed mb-3">
        {post.body}
      </p>

      {/* Meta row */}
      <div className="flex items-center gap-4 text-[12px] text-gray-400">
        {post.locationName && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate max-w-[120px]">{post.locationName}</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {timeUntilExpiry(post.expiresAt)}
        </span>
        <span className={`flex items-center gap-1 ml-auto font-medium ${
          isFilled ? 'text-amber-500' : 'text-green-500'
        }`}>
          <Users className="w-3.5 h-3.5" />
          {slots} {isFilled ? 'Full' : 'joined'}
        </span>
      </div>
    </button>
  );
}
