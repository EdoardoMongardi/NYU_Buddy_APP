'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import JoinRequestInbox from '@/components/activity/JoinRequestInbox';
import InlineAskChat from '@/components/activity/InlineAskChat';
import {
    Loader2,
    RefreshCw,
    Clock,
    MapPin,
    Users,
    MessageCircle,
    FileText,
    UserPlus,
    Inbox,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useManageActivity, JoinedActivity } from '@/lib/hooks/useManageActivity';
import { CATEGORY_LABELS, ActivityCategory } from '@/lib/schemas/activity';
import { FeedPost, PostDetail } from '@/lib/firebase/functions';

// ─── Category styling ───────────────────────────────────────────────────────
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
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
}

function CategoryPill({ category }: { category: string }) {
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
    const label = CATEGORY_LABELS[category as ActivityCategory] || category;
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 ${color}`}>
            {label}
        </span>
    );
}

// ─────────────────────────────────────────────────
//  My Post Card
// ─────────────────────────────────────────────────
function MyPostCard({ post }: { post: PostDetail }) {
    const router = useRouter();
    const isExpired = post.status === 'expired';
    const isClosed = post.status === 'closed';
    const isFilled = post.status === 'filled';
    const isOpen = post.status === 'open';

    return (
        <div className={`w-full text-left bg-white rounded-2xl border border-gray-100 p-4 shadow-sm ${isExpired ? 'opacity-60' : ''}`}>
            {/* Header: category + status */}
            <div className="flex items-center justify-between mb-2.5">
                <CategoryPill category={post.category} />
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border flex-shrink-0 ${isOpen ? 'bg-green-50 text-green-700 border-green-100' :
                    isFilled ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        isClosed ? 'bg-gray-50 text-gray-600 border-gray-100' :
                            'bg-red-50 text-red-600 border-red-100'
                    }`}>
                    {(isOpen || isFilled) && (
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOpen ? 'bg-green-500' : 'bg-amber-500'}`} />
                    )}
                    {isOpen ? 'Open' : isFilled ? 'Filled' : isClosed ? 'Closed' : 'Expired'}
                </span>
            </div>

            {/* Body */}
            <p className="text-[15px] text-gray-800 leading-relaxed mb-2.5 line-clamp-2">
                {post.body}
            </p>

            {/* Meta row */}
            <div className="flex items-center gap-3 text-[12px] text-gray-400 mb-1">
                {post.locationName && (
                    <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate max-w-[110px]">{post.locationName}</span>
                    </span>
                )}
                <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    {timeAgo(post.createdAt)}
                </span>
                <span className={`flex items-center gap-1 ml-auto font-medium ${isFilled ? 'text-amber-500' : 'text-gray-500'
                    }`}>
                    <Users className="w-3.5 h-3.5 flex-shrink-0" />
                    {post.acceptedCount}/{post.maxParticipants}
                </span>
            </div>

            {/* Open group chat button — only when not expired/closed and there are members */}
            {!isExpired && !isClosed && post.acceptedCount > 0 && (
                <button
                    onClick={() => router.push(`/post/${post.postId}`)}
                    className="w-full mt-2.5 flex items-center gap-2 bg-violet-50 text-violet-600 text-[13px] font-semibold px-3 py-2.5 rounded-xl border border-violet-100 hover:bg-violet-100 transition-colors active:scale-[0.98]"
                >
                    <MessageCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Open group chat</span>
                    <span className="ml-auto">→</span>
                </button>
            )}

            {/* View chat history button — when expired and a group was created */}
            {isExpired && post.groupId && (
                <button
                    onClick={() => router.push(`/post/${post.postId}`)}
                    className="w-full mt-2.5 flex items-center gap-2 bg-gray-50 text-gray-500 text-[13px] font-semibold px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors active:scale-[0.98]"
                >
                    <MessageCircle className="w-4 h-4 flex-shrink-0" />
                    <span>View chat history</span>
                    <span className="ml-auto">→</span>
                </button>
            )}

            {/* Inline Ask threads */}
            <InlineAskChat postId={post.postId} creatorUid={post.creatorUid} isExpired={isExpired} />
        </div>
    );
}

// ─────────────────────────────────────────────────
//  Joined Activity Card
// ─────────────────────────────────────────────────
function JoinedActivityCard({ item }: { item: JoinedActivity }) {
    const router = useRouter();
    const { request, post, loading } = item;

    const isPending = request.status === 'pending';
    const isAccepted = request.status === 'accepted';
    const isDeclined = request.status === 'declined';
    const isWithdrawn = request.status === 'withdrawn';
    const isKicked = request.status === 'kicked';
    const isLeft = request.status === 'left';

    const isExpired = post?.status === 'expired' || (post?.expiresAt && new Date(post.expiresAt) < new Date());
    const isInactive = isDeclined || isKicked || isLeft || isWithdrawn;

    if (loading) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
        );
    }

    const canEnterChat = isAccepted && post && !isExpired && !isInactive;
    const canViewChatHistory = (isKicked || isLeft || (isExpired && isAccepted)) && post?.groupId;

    return (
        <div className={`bg-white rounded-2xl border border-gray-100 p-4 shadow-sm ${isInactive ? 'opacity-60' : ''}`}>
            {/* Header: category + status */}
            <div className="flex items-center justify-between mb-2.5">
                <CategoryPill category={post?.category || 'other'} />
                {isPending && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-600 border border-violet-100 flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                        Pending
                    </span>
                )}
                {isAccepted && !isExpired && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-100 flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                        Accepted
                    </span>
                )}
                {isDeclined && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-600 border border-red-100 flex-shrink-0">
                        Denied
                    </span>
                )}
                {isWithdrawn && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-50 text-gray-600 border border-gray-100 flex-shrink-0">
                        Withdrawn
                    </span>
                )}
                {isKicked && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-500 border border-red-100 flex-shrink-0">
                        Not Available
                    </span>
                )}
                {isLeft && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-50 text-gray-500 border border-gray-100 flex-shrink-0">
                        Left
                    </span>
                )}
                {isExpired && !isKicked && !isLeft && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-600 border border-red-100 flex-shrink-0">
                        Expired
                    </span>
                )}
            </div>

            {/* Post body */}
            {post && (
                <p className="text-[15px] text-gray-800 leading-relaxed mb-2.5 line-clamp-2">
                    {post.body}
                </p>
            )}

            {/* Creator info */}
            {post && (
                <div className="flex items-center gap-2 mb-1">
                    <ProfileAvatar
                        photoURL={post.creatorPhotoURL}
                        displayName={post.creatorDisplayName}
                        size="xs"
                        className="w-6 h-6 flex-shrink-0"
                    />
                    <span className="text-[12px] text-gray-500 truncate flex-1">
                        by {post.creatorDisplayName}
                    </span>
                    <span className="text-[12px] text-gray-400 flex-shrink-0">
                        {timeAgo(request.createdAt)}
                    </span>
                </div>
            )}

            {/* Enter group chat button — accepted active members */}
            {canEnterChat && (
                <button
                    onClick={() => router.push(`/post/${post!.postId}`)}
                    className="w-full mt-2.5 flex items-center gap-2 bg-violet-50 text-violet-600 text-[13px] font-semibold px-3 py-2.5 rounded-xl border border-violet-100 hover:bg-violet-100 transition-colors active:scale-[0.98]"
                >
                    <MessageCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Enter group chat</span>
                    <span className="ml-auto">→</span>
                </button>
            )}

            {/* View chat history — kicked/left former members */}
            {canViewChatHistory && (
                <button
                    onClick={() => router.push(`/post/${post!.postId}`)}
                    className="w-full mt-2.5 flex items-center gap-2 bg-gray-50 text-gray-500 text-[13px] font-semibold px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors active:scale-[0.98]"
                >
                    <MessageCircle className="w-4 h-4 flex-shrink-0" />
                    <span>View chat history</span>
                    <span className="ml-auto">→</span>
                </button>
            )}

            {/* Ask section — show for pending/accepted (active), or any status when expired (history) */}
            {(isPending || isAccepted || isExpired) && post && (
                <InlineAskChat postId={post.postId} creatorUid={post.creatorUid} postStatus={post.status} isExpired={!!isExpired} />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────
//  ManageActivityTab
// ─────────────────────────────────────────────────
export default function ManageActivityTab() {
    const [activeSection, setActiveSection] = useState<'my-posts' | 'joined' | 'requests'>('my-posts');
    const {
        myPosts,
        joinedActivities,
        incomingRequests,
        loadingPosts,
        loadingJoined,
        loadingRequests,
        error,
        refresh,
    } = useManageActivity();

    const isLoading =
        activeSection === 'my-posts' ? loadingPosts :
            activeSection === 'joined' ? loadingJoined : loadingRequests;

    const totalRequests = incomingRequests.reduce((acc, g) => acc + g.requests.length, 0);

    return (
        <div
            className="w-full overflow-hidden flex flex-col"
            style={{
                overscrollBehavior: 'none',
                height: 'calc(100dvh - 48px - env(safe-area-inset-bottom, 0px))',
            }}
        >
            {/* Header + tabs */}
            <div className="shrink-0 pt-3 bg-white border-b border-gray-100">
                <h2 className="text-[20px] font-bold text-gray-900 mb-2 px-5">Manage Activity</h2>

                <div className="flex relative">
                    {/* My Activities tab */}
                    <button
                        onClick={() => setActiveSection('my-posts')}
                        className={`flex-1 py-3 text-[13px] font-semibold text-center transition-colors flex items-center justify-center gap-1.5 ${activeSection === 'my-posts' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <span>My Activities</span>
                        {myPosts.length > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeSection === 'my-posts' ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-500'
                                }`}>
                                {myPosts.length}
                            </span>
                        )}
                    </button>

                    {/* Joined tab */}
                    <button
                        onClick={() => setActiveSection('joined')}
                        className={`flex-1 py-3 text-[13px] font-semibold text-center transition-colors flex items-center justify-center gap-1.5 ${activeSection === 'joined' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <span>Joined</span>
                        {joinedActivities.length > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeSection === 'joined' ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-500'
                                }`}>
                                {joinedActivities.length}
                            </span>
                        )}
                    </button>

                    {/* Requests tab */}
                    <button
                        onClick={() => setActiveSection('requests')}
                        className={`flex-1 py-3 text-[13px] font-semibold text-center transition-colors flex items-center justify-center gap-1.5 ${activeSection === 'requests' ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <span>Requests</span>
                        {totalRequests > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeSection === 'requests' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                                }`}>
                                {totalRequests}
                            </span>
                        )}
                    </button>

                    {/* Animated underline */}
                    <motion.div
                        className="absolute bottom-0 h-[3px] bg-violet-600 rounded-full"
                        animate={{
                            left: activeSection === 'my-posts' ? '0%' : activeSection === 'joined' ? '33.33%' : '66.66%',
                            width: '33.33%',
                        }}
                        transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                    />
                </div>
            </div>

            {/* Content area */}
            <div
                className="flex-1 overflow-y-auto min-h-0 pb-20 px-4 pt-3 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none' }}
            >
                {/* Refresh */}
                <div className="flex justify-center my-2">
                    <button
                        onClick={refresh}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-3">
                        <p className="text-red-700 text-sm text-center">{error}</p>
                        <button onClick={refresh} className="mt-2 text-red-600 text-sm font-medium w-full text-center">
                            Try again
                        </button>
                    </div>
                )}

                {/* ── My Activities ── */}
                {activeSection === 'my-posts' && (
                    <>
                        {loadingPosts && myPosts.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                                <p className="text-sm">Loading your posts…</p>
                            </div>
                        )}
                        {!loadingPosts && myPosts.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <FileText className="w-10 h-10 mb-3 text-gray-300" />
                                <p className="text-lg font-medium text-gray-600 mb-1">No posts yet</p>
                                <p className="text-sm text-gray-400">Create a post to find activity buddies!</p>
                            </div>
                        )}
                        <div className="space-y-3">
                            {myPosts.map((post) => (
                                <MyPostCard key={post.postId} post={post} />
                            ))}
                        </div>
                    </>
                )}

                {/* ── Joined ── */}
                {activeSection === 'joined' && (
                    <>
                        {loadingJoined && joinedActivities.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                                <p className="text-sm">Loading joined activities…</p>
                            </div>
                        )}
                        {!loadingJoined && joinedActivities.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <UserPlus className="w-10 h-10 mb-3 text-gray-300" />
                                <p className="text-lg font-medium text-gray-600 mb-1">No joined activities</p>
                                <p className="text-sm text-gray-400">Join activities from the Home feed!</p>
                            </div>
                        )}
                        <div className="space-y-3">
                            {joinedActivities.map((item) => (
                                <JoinedActivityCard key={item.request.requestId} item={item} />
                            ))}
                        </div>
                    </>
                )}

                {/* ── Requests ── */}
                {activeSection === 'requests' && (
                    <>
                        {loadingRequests && incomingRequests.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                                <p className="text-sm">Checking for requests…</p>
                            </div>
                        )}
                        {!loadingRequests && incomingRequests.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Inbox className="w-10 h-10 mb-3 text-gray-300" />
                                <p className="text-lg font-medium text-gray-600 mb-1">No pending requests</p>
                                <p className="text-sm text-gray-400">You&apos;re all caught up!</p>
                            </div>
                        )}
                        <div className="space-y-4">
                            {incomingRequests.map((group) => {
                                const categoryLabel = CATEGORY_LABELS[group.post.category as ActivityCategory] || group.post.category;
                                const categoryColor = CATEGORY_COLORS[group.post.category] || CATEGORY_COLORS.other;

                                return (
                                    <div key={group.post.postId} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                                        {/* Post summary header */}
                                        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2 bg-gray-50/50">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${categoryColor}`}>
                                                {categoryLabel}
                                            </span>
                                            <span className="text-[13px] text-gray-700 font-medium truncate flex-1">
                                                {group.post.body}
                                            </span>
                                        </div>
                                        {/* Requests list */}
                                        <JoinRequestInbox
                                            postId={group.post.postId}
                                            requests={group.requests}
                                            onRefresh={refresh}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
