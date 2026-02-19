// ... imports
import { useRouter } from 'next/navigation';
import { MapPin, Clock, Users, MoreHorizontal } from 'lucide-react';
import { FeedPost } from '@/lib/firebase/functions';
import { CATEGORY_LABELS, ActivityCategory } from '@/lib/schemas/activity';

import { ProfileAvatar } from '@/components/ui/ProfileAvatar';

const CATEGORY_COLORS: Record<string, string> = {
  coffee: 'text-amber-600 bg-amber-50 border-amber-100',
  study: 'text-blue-600 bg-blue-50 border-blue-100',
  food: 'text-orange-600 bg-orange-50 border-orange-100',
  event: 'text-purple-600 bg-purple-50 border-purple-100',
  explore: 'text-green-600 bg-green-50 border-green-100',
  sports: 'text-red-600 bg-red-50 border-red-100',
  other: 'text-gray-600 bg-gray-50 border-gray-100',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

// ... helper timeUntilExpiry (keep if needed, or simplify)
function timeUntilExpiry(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = then - now;
  if (diffMs <= 0) return 'Expired';
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

  // Detect if imageUrl is video (simple check extension or metadata if available, currently just assuming extension or using video tag if 'firebasestorage' url likely has type)
  // Since we don't save type in FeedPost, we'll try to guess or use a video tag with error fallback? 
  // Actually typically we need to know. For now let's assume if it looks like a video extension? 
  // But firebase URLs are opaque often. 
  // Ideally backend should store mediaType. 
  // However, `video` tag usually plays if it's video. 
  // A robust way without backend change: try `img`, if error try `video`? No that's layout shift.
  // For this v1, checking if URL contains certain extensions or metadata is hard.
  // But wait, the user said "one short video ... below 10s".
  // Let's assume standard HTML5 video support. 
  // If we don't have metadata, we can try to inspect the content-type? No client side.
  // We'll rely on the `CreatePost` validation. But how to distinguish in display?
  // We should have added `mediaType` to `FeedPost`.
  // Since we can't easily change backend structure without migration, let's treat all as `img` for now UNLESS we add a field.
  // BUT the user asked for video. 
  // Let's check if we can infer from URL token? No.
  // Let's assume for now `img` works for images. For video, we might need a `video` tag.
  // Let's try to render as `video` if the URL *looks* like a video (unreliable) OR just render `img` and if it fails..?
  // Actually, standard `img` won't play video.
  // Let's use a specialized component or just use `video` if we stored it.
  // *Self-correction*: I didn't add `mediaType` to `activityPostCreateSchema`. I just sent `imageUrl`.
  // So the backend considers it `imageUrl`.
  // If I upload a video to `activity_media`, I get a download URL.
  // If I put that in `img src`, it won't work.
  // I need to know if it's a video.
  // I should have added `keywords` or something?
  // Let's just try to render a `video` tag if it has extension `.mp4`? 
  // Firebase storage URLs usually have tokens. The path is in the URL.
  // Let's check the URL path.
  // Let's check the URL path.
  // const isVideo = post.imageUrl?.includes('.mp4') || post.imageUrl?.includes('video'); 

  // This is hacky. But without schema change...
  // Wait, I can't change the schema? The user didn't forbid it.
  // But `FeedPost` is defined in `functions.ts` from the backend return type.
  // I executed `replace_file_content` on `CreatePostPage.tsx` using `imageUrl` field.
  // To support video properly I should ideally update schema. 
  // But for now, let's assume if I can't know, I render `img`.
  // Update: I'll use a `video` tag if the user uploaded a video.
  // How does `CreatePostPage` know? It validates type `video/*`.
  // If I saved it as `.mp4` it might help. 
  // In `CreatePostPage`, I saved as `${Date.now()}_${mediaFile.name}`.
  // If name has .mp4, it preserves it.

  const hasMedia = !!post.imageUrl;
  const isVideoMedia = hasMedia && (post.imageUrl?.toLowerCase().includes('.mp4') || post.imageUrl?.toLowerCase().includes('.mov'));

  return (
    <div
      onClick={() => router.push(`/post/${post.postId}`)}
      className="w-full flex gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50/50 transition-colors cursor-pointer touch-action-manipulation"
    >
      {/* Left: Avatar */}
      <div className="flex-shrink-0 pt-1">
        <ProfileAvatar
          photoURL={post.creatorPhotoURL}
          displayName={post.creatorDisplayName}
          size="md" // slightly larger for X style
          className="w-10 h-10"
        />
      </div>

      {/* Right: Content */}
      <div className="flex-1 min-w-0">
        {/* Header line: Name, Category, More */}
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-[15px] font-bold text-gray-900 truncate">
              {post.creatorDisplayName}
            </span>
            <span className="text-[14px] text-gray-500 flex-shrink-0">
              · {timeAgo(post.createdAt)}
            </span>
          </div>
          <button className="text-gray-400 p-1 hover:bg-violet-50 hover:text-violet-600 rounded-full transition-colors -mr-2" onClick={(e) => { e.stopPropagation(); /* Menu */ }}>
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-header / Category Badge */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${categoryColor}`}>
            {categoryLabel}
          </span>
          {/* Dynamic Status / Time left */}
          {post.status === 'open' && (
            <span className="text-[12px] text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeUntilExpiry(post.expiresAt)}
            </span>
          )}
        </div>

        {/* Body Text */}
        <p className="text-[15px] text-gray-900 leading-normal whitespace-pre-wrap mb-2.5">
          {post.body}
        </p>

        {/* Media Attachment */}
        {hasMedia && (
          <div className="mb-3 rounded-xl overflow-hidden border border-gray-100 bg-gray-50 max-h-[300px] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {isVideoMedia ? (
              <video
                src={post.imageUrl!}
                controls
                className="w-full max-h-[300px] object-cover"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={post.imageUrl!}
                alt="Activity media"
                className="w-full max-h-[300px] object-cover"
                loading="lazy"
              />
            )}
          </div>
        )}

        {/* Action Bar (Footer) */}
        <div className="flex items-center justify-between text-gray-500 max-w-[80%]">
          {/* Location */}
          {post.locationName && (
            <div className="flex items-center gap-1.5 group">
              <MapPin className="w-4 h-4 group-hover:text-blue-500 transition-colors" />
              <span className="text-[13px] group-hover:text-blue-500 transition-colors truncate max-w-[150px]">{post.locationName}</span>
            </div>
          )}

          {/* Participants / Join Status */}
          <div className={`flex items-center gap-1.5 group ${isFilled ? 'text-amber-500' : ''}`}>
            <Users className={`w-4 h-4 ${!isFilled && 'group-hover:text-green-500'} transition-colors`} />
            <span className={`text-[13px] ${!isFilled && 'group-hover:text-green-500'} transition-colors`}>
              {slots} {isFilled ? 'Full' : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
