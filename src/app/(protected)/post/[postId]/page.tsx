'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Clock, MapPin, Users, Loader2, AlertCircle, X, LogOut } from 'lucide-react';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { useAuth } from '@/lib/hooks/useAuth';
import { useActivityPost } from '@/lib/hooks/useActivityPost';
import { CATEGORY_LABELS, ActivityCategory } from '@/lib/schemas/activity';
import JoinRequestButton from '@/components/activity/JoinRequestButton';
import JoinRequestInbox from '@/components/activity/JoinRequestInbox';
import GroupChatPanel from '@/components/activity/GroupChatPanel';
import GroupMemberList from '@/components/activity/GroupMemberList';
import { groupLeave } from '@/lib/firebase/functions';
import { useVisualViewport } from '@/lib/hooks/useVisualViewport';
import { useLockBodyScroll } from '@/lib/hooks/useLockBodyScroll';
import { useToast } from '@/hooks/use-toast';

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

  const { toast } = useToast();

  // State for member view
  const [showMembers, setShowMembers] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [wasRemoved, setWasRemoved] = useState(false);

  // Keyboard avoidance hooks
  const isKbOpen = useVisualViewport();
  useLockBodyScroll();

  const isCreator = user?.uid === post?.creatorUid;
  const isMember = group?.memberUids?.includes(user?.uid || '');
  const isFormerMember = !isMember && (myJoinRequest?.status === 'kicked' || myJoinRequest?.status === 'left');
  const formerMemberStatus = isFormerMember ? (myJoinRequest!.status as 'kicked' | 'left') : null;
  const statusBadge = post ? STATUS_BADGES[post.status] : null;

  const handleLeaveActivity = async () => {
    if (!group || isLeaving) return;
    const confirmed = window.confirm('Are you sure you want to leave this activity? You will lose access to the group chat.');
    if (!confirmed) return;
    setIsLeaving(true);
    try {
      await groupLeave({ groupId: group.groupId });
      toast({ title: 'You left the activity' });
      router.back();
    } catch (err) {
      toast({
        title: 'Failed to leave',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
      setIsLeaving(false);
    }
  };

  const handleChatRemoved = () => {
    setWasRemoved(true);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
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

  // ─── FORMER MEMBER VIEW (Read-only Chat) ───
  if (isFormerMember && post.groupId) {
    return (
      <div
        className="fixed inset-x-0 mx-auto w-full max-w-lg flex flex-col bg-white overflow-hidden z-50 sm:border-x sm:border-gray-200"
        style={{
          zIndex: 50,
          top: 'var(--vv-offset-top, 0px)',
          height: 'calc(var(--vvh, 100dvh) - 48px - env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-gray-100 flex-shrink-0">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-gray-900 leading-tight truncate">
                Chat History
              </h1>
              <p className="text-[11px] text-gray-400 truncate">
                {formerMemberStatus === 'kicked' ? 'You were removed from this activity' : 'You left this activity'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <GroupChatPanel
            groupId={post.groupId}
            fullScreen={true}
            readOnly={true}
            readOnlyStatus={formerMemberStatus}
          />
        </div>
      </div>
    );
  }

  // ─── VISITOR VIEW (Scrolling Layout) ───
  if (!isCreator && !isMember) {
    return (
      <div className="max-w-md mx-auto pb-8 px-5">
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
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 shadow-sm">
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

          {/* Title / Body */}
          <p className="text-[17px] font-bold text-gray-900 leading-snug mb-1">
            {post.title || post.body}
          </p>
          {post.title && post.body && post.body !== post.title && (
            <p className="text-[14px] text-gray-600 leading-relaxed mb-4">
              {post.body}
            </p>
          )}

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
            <span className={`flex items-center gap-1 font-medium ${post.status === 'filled' ? 'text-amber-500' : 'text-green-500'}`}>
              <Users className="w-4 h-4" />
              {post.acceptedCount}/{post.maxParticipants} joined
            </span>
          </div>
        </div>

        {/* Join Request Button */}
        <JoinRequestButton
          postId={postId}
          postStatus={post.status}
          myJoinRequest={myJoinRequest}
          onRefresh={refresh}
        />
      </div>
    );
  }

  // ─── CREATOR MANAGEMENT VIEW (No group yet) ───
  if (isCreator && !group) {
    return (
      <div className="max-w-md mx-auto pb-8 px-5">
        <div className="flex items-center gap-3 py-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Manage Activity</h1>
          {statusBadge && (
            <span className={`ml-auto px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 shadow-sm">
          {post.imageUrl && (
            <div className="relative w-full rounded-xl overflow-hidden mb-3 bg-gray-100">
              <img src={post.imageUrl} alt="" className="w-full max-h-[200px] object-cover" />
            </div>
          )}
          <p className="text-[17px] font-bold text-gray-900 leading-snug mb-1">
            {post.title || post.body}
          </p>
          {post.body && post.body !== (post.title || '') && (
            <p className="text-[14px] text-gray-600 leading-relaxed mb-3">{post.body}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-gray-500 mt-2">
            {post.locationName && (
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{post.locationName}</span>
            )}
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{timeUntilExpiry(post.expiresAt)}</span>
            <span className={`flex items-center gap-1 font-medium ${post.status === 'filled' ? 'text-amber-500' : 'text-green-500'}`}>
              <Users className="w-4 h-4" />{post.acceptedCount}/{post.maxParticipants} joined
            </span>
          </div>
        </div>

        {joinRequests && joinRequests.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              Pending Requests
              <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full">
                {joinRequests.length}
              </span>
            </h3>
            <JoinRequestInbox postId={postId} requests={joinRequests} onRefresh={refresh} />
          </div>
        )}

        {(!joinRequests || joinRequests.length === 0) && (
          <div className="bg-gray-50 rounded-2xl p-6 text-center mb-4">
            <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-[14px] text-gray-500">No join requests yet</p>
            <p className="text-[12px] text-gray-400 mt-1">People can find and request to join your activity</p>
          </div>
        )}

        <button
          onClick={async () => {
            const confirmed = window.confirm('Are you sure you want to close this activity?');
            if (!confirmed) return;
            try {
              const { activityPostClose } = await import('@/lib/firebase/functions');
              await activityPostClose({ postId });
              toast({ title: 'Activity closed' });
              router.back();
            } catch (err) {
              toast({ title: 'Failed to close', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' });
            }
          }}
          className="w-full py-3 rounded-xl text-[14px] font-medium border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
        >
          Close Activity
        </button>
      </div>
    );
  }

  // ─── MEMBER VIEW (Fixed Layout with Chat) ───
  return (
    <div
      className="fixed inset-x-0 mx-auto w-full max-w-lg flex flex-col bg-white overflow-hidden z-50 sm:border-x sm:border-gray-200"
      style={{
        zIndex: 50, // Ensure it sits on top if nested
        top: 'var(--vv-offset-top, 0px)',
        height: isKbOpen
          ? 'var(--vvh, 100dvh)'
          : 'calc(var(--vvh, 100dvh) - 48px - env(safe-area-inset-bottom, 0px))',
        transitionProperty: 'height',
        transitionDuration: 'var(--vvh-duration, 0ms)',
        transitionTimingFunction: 'ease-out',
      }}
    >
      {/* Compact Header for Chat Mode */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-gray-100 flex-shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>

          <div className="min-w-0">
            <h1 className="text-base font-semibold text-gray-900 leading-tight truncate">
              Activity Chat
            </h1>
            <div className="flex items-center gap-2 text-[11px] text-gray-500 truncate">
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {timeUntilExpiry(post.expiresAt)}
              </span>
              <span>•</span>
              <span className="truncate">{CATEGORY_LABELS[post.category as ActivityCategory] || post.category}</span>
              {post.locationName && (
                <>
                  <span>•</span>
                  <span className="truncate">{post.locationName}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {!isCreator && !wasRemoved && (
            <button
              onClick={handleLeaveActivity}
              disabled={isLeaving}
              className="flex flex-col items-center justify-center px-2 py-1 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
            >
              {isLeaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogOut className="w-5 h-5" />
              )}
              <span className="text-[10px] font-medium leading-none mt-0.5">Leave</span>
            </button>
          )}
          <button
            onClick={() => setShowMembers(true)}
            className="flex flex-col items-center justify-center px-2 py-1 rounded-lg hover:bg-gray-50 text-violet-600"
          >
            <div className="flex items-center gap-1">
              <Users className="w-5 h-5" />
              <span className="text-sm font-semibold">{post.acceptedCount}/{post.maxParticipants}</span>
            </div>
            <span className="text-[10px] font-medium leading-none mt-0.5">Members</span>
          </button>
        </div>
      </div>

      {/* Chat Panel - Takes remaining space */}
      <div className="flex-1 overflow-hidden relative">
        {group && (
          <GroupChatPanel groupId={group.groupId} fullScreen={true} onRemoved={handleChatRemoved} />
        )}
      </div>

      {/* Members Overlay */}
      {showMembers && (
        <div className="absolute inset-0 z-[60] bg-white flex flex-col animate-in fade-in slide-in-from-bottom duration-200">
          {/* Overlay Header */}
          <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-bold text-gray-900">Members</h2>
            <button
              onClick={() => setShowMembers(false)}
              className="p-2 -mr-2 rounded-full hover:bg-gray-100"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>

          {/* Overlay Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Join Requests (Creator only) */}
            {isCreator && joinRequests && joinRequests.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  Pending Requests
                  <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full">
                    {joinRequests.length}
                  </span>
                </h3>
                <JoinRequestInbox
                  postId={postId}
                  requests={joinRequests}
                  onRefresh={refresh}
                />
                <div className="border-b border-gray-100 pt-2" />
              </div>
            )}

            {/* Members List */}
            {group && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Who&apos;s Joined
                </h3>
                <GroupMemberList
                  group={group}
                  isCreator={isCreator}
                  currentUid={user?.uid || ''}
                  onRefresh={refresh}
                  onLeave={() => router.back()}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
