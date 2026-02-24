/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X, ChevronRight, Clock, MapPin, Users, Loader2, AlertCircle, UserPlus, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { useAuth } from '@/lib/hooks/useAuth';
import { FeedPost, activityPostGetById, PostDetail, JoinRequestInfo, GroupInfo } from '@/lib/firebase/functions';
import { CATEGORY_LABELS, ActivityCategory } from '@/lib/schemas/activity';
import JoinRequestButton from './JoinRequestButton';
import InlineAskChat from './InlineAskChat';

const CATEGORY_COLORS: Record<string, string> = {
  coffee: 'bg-amber-100 text-amber-700',
  study: 'bg-blue-100 text-blue-700',
  food: 'bg-orange-100 text-orange-700',
  event: 'bg-purple-100 text-purple-700',
  explore: 'bg-green-100 text-green-700',
  sports: 'bg-red-100 text-red-700',
  other: 'bg-gray-100 text-gray-700',
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

interface PostDetailModalProps {
  feedPost: FeedPost;
  onClose: () => void;
  onNext?: () => void;
}

export default function PostDetailModal({ feedPost, onClose, onNext }: PostDetailModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  const [post, setPost] = useState<PostDetail | null>(null);
  const [, setJoinRequests] = useState<JoinRequestInfo[] | null>(null);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [myJoinRequest, setMyJoinRequest] = useState<{
    requestId: string; status: string; message: string | null; createdAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setPortalRoot(document.body); }, []);

  const fetchDetails = useCallback(async () => {
    try {
      setError(null);
      const result = await activityPostGetById({ postId: feedPost.postId });
      setPost(result.data.post);
      setJoinRequests(result.data.joinRequests);
      setGroup(result.data.group);
      setMyJoinRequest(result.data.myJoinRequest);
    } catch (err) {
      console.error('[PostDetailModal] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load post');
    } finally {
      setLoading(false);
    }
  }, [feedPost.postId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  const isCreator = user?.uid === feedPost.creatorUid;
  const isMember = group?.memberUids?.includes(user?.uid || '');
  const categoryLabel = CATEGORY_LABELS[feedPost.category as ActivityCategory] || feedPost.category;
  const categoryColor = CATEGORY_COLORS[feedPost.category] || CATEGORY_COLORS.other;
  const hasMedia = !!feedPost.imageUrl;

  const handleJoinNavigate = () => {
    onClose();
    router.push(`/post/${feedPost.postId}/join`);
  };

  const handleOpenFullPost = () => {
    onClose();
    router.push(`/post/${feedPost.postId}`);
  };

  if (!portalRoot) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Blurred backdrop */}
        <div className="absolute inset-0" onClick={onClose}>
          {hasMedia && (
            <img
              src={feedPost.imageUrl!}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl"
            />
          )}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
        </div>

        {/* Floating X button (top-left) */}
        <button
          onClick={onClose}
          className="absolute top-[max(env(safe-area-inset-top,12px),12px)] left-4 z-[110] w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <X className="w-[18px] h-[18px] text-gray-800" />
        </button>

        {/* Floating Next button (top-right) */}
        {onNext && (
          <button
            onClick={onNext}
            className="absolute top-[max(env(safe-area-inset-top,12px),12px)] right-4 z-[110] w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <ChevronRight className="w-[18px] h-[18px] text-gray-800" />
          </button>
        )}

        {/* Content wrapper — constrains card + action button within viewport */}
        <div
          className="relative z-[105] flex flex-col items-center w-[calc(100%-32px)] max-w-[420px] md:max-w-[520px]"
          style={{ maxHeight: 'calc(100dvh - 120px)' }}
        >
          {/* Main scrollable card */}
          <motion.div
            className="bg-white rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl flex flex-col w-full min-h-0"
            style={{ flex: '1 1 0%' }}
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              {/* Hero image */}
              {hasMedia && (
                <div className="relative w-full aspect-[16/10] bg-gray-100">
                  <img
                    src={feedPost.imageUrl!}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white to-transparent" />
                  <div className="absolute top-3 left-3">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${categoryColor}`}>
                      {categoryLabel}
                    </span>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="px-4 pb-4">
                {/* Post title */}
                <div className={hasMedia ? '-mt-2' : 'pt-4'}>
                  {!hasMedia && (
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mb-3 ${categoryColor}`}>
                      {categoryLabel}
                    </span>
                  )}
                  <p className="text-[18px] font-bold text-gray-900 leading-snug mb-2">
                    {feedPost.title || feedPost.body}
                  </p>
                </div>

                {/* Creator info */}
                <div className="flex items-center gap-2.5 mb-3">
                  <ProfileAvatar
                    photoURL={feedPost.creatorPhotoURL}
                    displayName={feedPost.creatorDisplayName}
                    size="sm"
                    className="w-8 h-8 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-gray-900">{feedPost.creatorDisplayName}</p>
                  </div>
                </div>

                {/* Description (body) — only when title exists and body is separate */}
                {feedPost.title && feedPost.body && feedPost.body !== feedPost.title && (
                  <p className="text-[14px] text-gray-600 leading-relaxed mb-3">
                    {feedPost.body}
                  </p>
                )}

                {/* Meta: event date/time, expiry, location, participants */}
                <div className="space-y-0 border-t border-gray-100">
                  {(feedPost.eventDate || feedPost.eventTime) && (
                    <div className="flex items-center gap-2.5 py-3 border-b border-gray-100">
                      <Calendar className="w-[18px] h-[18px] text-violet-500 flex-shrink-0" />
                      <span className="text-[14px] text-gray-700">
                        {feedPost.eventDate && new Date(feedPost.eventDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {feedPost.eventDate && feedPost.eventTime && ' · '}
                        {feedPost.eventTime && (() => {
                          const [h, m] = feedPost.eventTime!.split(':').map(Number);
                          const ampm = h >= 12 ? 'PM' : 'AM';
                          const hour12 = h % 12 || 12;
                          return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
                        })()}
                      </span>
                    </div>
                  )}
                  {feedPost.expiresAt && (
                    <div className="flex items-center gap-2.5 py-3 border-b border-gray-100">
                      <Clock className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" />
                      <span className="text-[14px] text-gray-700">{timeUntilExpiry(feedPost.expiresAt)}</span>
                    </div>
                  )}
                  {feedPost.locationName && (
                    <div className="flex items-center gap-2.5 py-3 border-b border-gray-100">
                      <MapPin className="w-[18px] h-[18px] text-red-400 flex-shrink-0" />
                      <span className="text-[14px] text-gray-700">{feedPost.locationName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 py-3 border-b border-gray-100">
                    <Users className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" />
                    <span className={`text-[14px] font-medium ${feedPost.status === 'filled' ? 'text-amber-600' : 'text-gray-700'}`}>
                      {feedPost.acceptedCount}/{feedPost.maxParticipants} joined
                      {feedPost.status === 'filled' && ' · Full'}
                    </span>
                  </div>
                </div>

                {loading && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 rounded-xl p-3 mt-3">
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {error}
                    </div>
                  </div>
                )}

                {!loading && !isCreator && !isMember && (
                  <div className="mt-1">
                    <InlineAskChat
                      postId={feedPost.postId}
                      creatorUid={feedPost.creatorUid}
                      postStatus={feedPost.status}
                      autoFocus={false}
                    />
                  </div>
                )}

                {!loading && isCreator && (
                  <div className="mt-1">
                    <InlineAskChat
                      postId={feedPost.postId}
                      creatorUid={feedPost.creatorUid}
                      postStatus={feedPost.status}
                    />
                  </div>
                )}

                {!loading && isMember && (
                  <button
                    onClick={handleOpenFullPost}
                    className="mt-3 w-full py-3 rounded-xl text-[14px] font-semibold bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors text-center"
                  >
                    Open Activity Chat
                  </button>
                )}
              </div>
            </div>
          </motion.div>

          {/* Floating action button (below the card) */}
          {!loading && !isCreator && !isMember && (
            <motion.div
              className="flex-shrink-0 w-full mt-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              {myJoinRequest ? (
                <JoinRequestButton
                  postId={feedPost.postId}
                  postStatus={post?.status || feedPost.status}
                  myJoinRequest={myJoinRequest}
                  onRefresh={fetchDetails}
                />
              ) : (
                <button
                  onClick={handleJoinNavigate}
                  disabled={feedPost.status !== 'open'}
                  className="w-full py-4 rounded-full text-[16px] font-bold bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98] shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-5 h-5" />
                  Join
                </button>
              )}
            </motion.div>
          )}

          {!loading && isCreator && (
            <motion.div
              className="flex-shrink-0 w-full mt-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <button
                onClick={handleOpenFullPost}
                className="w-full py-4 rounded-full text-[16px] font-bold bg-white text-violet-600 hover:bg-gray-50 active:scale-[0.98] shadow-lg transition-all flex items-center justify-center gap-2"
              >
                Manage Activity
              </button>
            </motion.div>
          )}

          {!loading && isMember && !isCreator && (
            <motion.div
              className="flex-shrink-0 w-full mt-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <button
                onClick={handleOpenFullPost}
                className="w-full py-4 rounded-full text-[16px] font-bold bg-white text-violet-600 hover:bg-gray-50 active:scale-[0.98] shadow-lg transition-all flex items-center justify-center gap-2"
              >
                Open Activity Chat
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    portalRoot
  );
}
