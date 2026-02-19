'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Clock, MapPin, Users, Loader2, AlertCircle } from 'lucide-react';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { useAuth } from '@/lib/hooks/useAuth';
import { useActivityPost } from '@/lib/hooks/useActivityPost';
import { CATEGORY_LABELS, ActivityCategory } from '@/lib/schemas/activity';
import JoinRequestButton from '@/components/activity/JoinRequestButton';
import JoinRequestInbox from '@/components/activity/JoinRequestInbox';
import GroupChatPanel from '@/components/activity/GroupChatPanel';
import GroupMemberList from '@/components/activity/GroupMemberList';

const CATEGORY_COLORS: Record<string, string> = {
  coffee: 'bg-amber-100 text-amber-700',
  study: 'bg-blue-100 text-blue-700',
  food: 'bg-orange-100 text-orange-700',
  event: 'bg-purple-100 text-purple-700',
  explore: 'bg-green-100 text-green-700',
  sports: 'bg-red-100 text-red-700',
  other: 'bg-gray-100 text-gray-700',
};

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-green-100 text-green-700' },
  filled: { label: 'Filled', color: 'bg-amber-100 text-amber-700' },
  closed: { label: 'Closed', color: 'bg-gray-100 text-gray-600' },
  expired: { label: 'Expired', color: 'bg-red-100 text-red-600' },
};

function timeUntilExpiry(dateStr: string | null): string {
  if (!dateStr) return '';
  const diffMs = new Date(dateStr).getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  const min = Math.floor(diffMs / 60000);
  if (min < 60) return `${min}m left`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h left`;
  return `${Math.floor(hrs / 24)}d left`;
}

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const postId = params.postId as string;
  const { post, joinRequests, group, myJoinRequest, loading, error, refresh } = useActivityPost(postId);

  const isCreator = user?.uid === post?.creatorUid;
  const isMember = group?.memberUids?.includes(user?.uid || '');
  const statusBadge = post ? STATUS_BADGES[post.status] : null;

  if (loading) {
    return (
      <div className="max-w-md mx-auto flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="max-w-md mx-auto py-10 px-4">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Post</h1>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-700 text-sm">{error || 'Post not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 py-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Activity</h1>
        {statusBadge && (
          <span className={`ml-auto px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusBadge.color}`}>
            {statusBadge.label}
          </span>
        )}
      </div>

      {/* Post card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
        {/* Creator info */}
        <div className="flex items-center gap-3 mb-3">
          <ProfileAvatar
            photoURL={post.creatorPhotoURL}
            displayName={post.creatorDisplayName}
            size="sm"
            className="w-10 h-10 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{post.creatorDisplayName}</p>
            <p className="text-[12px] text-gray-400">
              {post.createdAt ? new Date(post.createdAt).toLocaleString() : ''}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${CATEGORY_COLORS[post.category] || CATEGORY_COLORS.other}`}>
            {CATEGORY_LABELS[post.category as ActivityCategory] || post.category}
          </span>
        </div>

        {/* Body */}
        <p className="text-[16px] text-gray-800 leading-relaxed mb-4">
          {post.body}
        </p>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-gray-500">
          {post.locationName && (
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {post.locationName}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {timeUntilExpiry(post.expiresAt)}
          </span>
          <span className={`flex items-center gap-1 font-medium ${post.status === 'filled' ? 'text-amber-500' : 'text-green-500'
            }`}>
            <Users className="w-4 h-4" />
            {post.acceptedCount}/{post.maxParticipants} joined
          </span>
        </div>
      </div>

      {/* Visitor: Join Request Button */}
      {!isCreator && !isMember && (
        <JoinRequestButton
          postId={postId}
          postStatus={post.status}
          myJoinRequest={myJoinRequest}
          onRefresh={refresh}
        />
      )}

      {/* Creator: Join Request Inbox */}
      {isCreator && joinRequests && joinRequests.length > 0 && (
        <div className="mb-4">
          <JoinRequestInbox
            postId={postId}
            requests={joinRequests}
            onRefresh={refresh}
          />
        </div>
      )}

      {/* Group section (members + chat) — visible to creator and participants */}
      {(isCreator || isMember) && group && (
        <>
          <GroupMemberList
            group={group}
            isCreator={isCreator}
            currentUid={user?.uid || ''}
            onRefresh={refresh}
          />
          <GroupChatPanel groupId={group.groupId} />
        </>
      )}
    </div>
  );
}
