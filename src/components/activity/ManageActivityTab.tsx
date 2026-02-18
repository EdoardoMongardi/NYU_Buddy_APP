'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Loader2,
    RefreshCw,
    Clock,
    MapPin,
    Users,
    MessageCircle,
    Check,
    X,
    FileText,
    UserPlus,
} from 'lucide-react';
import { useManageActivity, JoinedActivity } from '@/lib/hooks/useManageActivity';
import { CATEGORY_LABELS, ActivityCategory } from '@/lib/schemas/activity';
import { FeedPost } from '@/lib/firebase/functions';

const CATEGORY_COLORS: Record<string, string> = {
    coffee: 'bg-amber-100 text-amber-700',
    study: 'bg-blue-100 text-blue-700',
    food: 'bg-orange-100 text-orange-700',
    event: 'bg-purple-100 text-purple-700',
    explore: 'bg-green-100 text-green-700',
    sports: 'bg-red-100 text-red-700',
    other: 'bg-gray-100 text-gray-700',
};

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
    open: { label: 'Open', color: 'text-green-700', bg: 'bg-green-50 border-green-100' },
    filled: { label: 'Filled', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-100' },
    closed: { label: 'Closed', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-100' },
    expired: { label: 'Expired', color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
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

// ─────────────────────────────────────────────────
//  My Post Card
// ─────────────────────────────────────────────────
function MyPostCard({ post }: { post: FeedPost }) {
    const router = useRouter();
    const statusStyle = STATUS_STYLES[post.status] || STATUS_STYLES.other;
    const categoryColor = CATEGORY_COLORS[post.category] || CATEGORY_COLORS.other;
    const categoryLabel = CATEGORY_LABELS[post.category as ActivityCategory] || post.category;

    return (
        <button
            onClick={() => router.push(`/post/${post.postId}`)}
            className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow active:scale-[0.99] touch-scale"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${categoryColor}`}>
                    {categoryLabel}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusStyle.bg} ${statusStyle.color}`}>
                    {statusStyle.label}
                </span>
            </div>

            {/* Body */}
            <p className="text-[15px] text-gray-800 leading-relaxed mb-3 line-clamp-2">
                {post.body}
            </p>

            {/* Meta row */}
            <div className="flex items-center gap-3 text-[12px] text-gray-400">
                {post.locationName && (
                    <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[100px]">{post.locationName}</span>
                    </span>
                )}
                <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {timeAgo(post.createdAt)}
                </span>
                <span className={`flex items-center gap-1 ml-auto font-medium ${post.status === 'filled' ? 'text-amber-500' : 'text-green-500'
                    }`}>
                    <Users className="w-3.5 h-3.5" />
                    {post.acceptedCount}/{post.maxParticipants}
                </span>
            </div>

            {/* Chat entry hint */}
            {post.status !== 'expired' && post.status !== 'closed' && post.acceptedCount > 0 && (
                <div className="mt-3 flex items-center gap-2 text-violet-600 text-[13px] font-medium">
                    <MessageCircle className="w-4 h-4" />
                    <span>Open group chat →</span>
                </div>
            )}
        </button>
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

    if (loading) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
            </div>
        );
    }

    const handleClick = () => {
        if (isAccepted && post) {
            router.push(`/post/${post.postId}`);
        } else if (isPending && post) {
            router.push(`/post/${post.postId}`);
        }
    };

    const categoryColor = post
        ? CATEGORY_COLORS[post.category] || CATEGORY_COLORS.other
        : 'bg-gray-100 text-gray-700';
    const categoryLabel = post
        ? CATEGORY_LABELS[post.category as ActivityCategory] || post.category
        : 'Activity';

    return (
        <button
            onClick={handleClick}
            disabled={isDeclined}
            className={`w-full text-left bg-white rounded-2xl border p-4 transition-shadow touch-scale ${isDeclined
                ? 'border-gray-100 opacity-60 cursor-default'
                : 'border-gray-100 hover:shadow-md active:scale-[0.99]'
                }`}
        >
            {/* Header: category + status badge */}
            <div className="flex items-center justify-between mb-2">
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${categoryColor}`}>
                    {categoryLabel}
                </span>
                {isPending && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-50 text-violet-600 border border-violet-100">
                        <Clock className="w-3 h-3" />
                        Pending
                    </span>
                )}
                {isAccepted && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-100">
                        <Check className="w-3 h-3" />
                        Accepted
                    </span>
                )}
                {isDeclined && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-gray-50 text-gray-500 border border-gray-100">
                        <X className="w-3 h-3" />
                        Declined
                    </span>
                )}
            </div>

            {/* Post body */}
            {post && (
                <p className="text-[15px] text-gray-800 leading-relaxed mb-2 line-clamp-2">
                    {post.body}
                </p>
            )}

            {/* Creator info */}
            {post && (
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                        {post.creatorPhotoURL ? (
                            <img src={post.creatorPhotoURL} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px] font-medium">
                                {post.creatorDisplayName?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                        )}
                    </div>
                    <span className="text-[12px] text-gray-500">
                        by {post.creatorDisplayName}
                    </span>
                    <span className="text-[12px] text-gray-400 ml-auto">
                        {timeAgo(request.createdAt)}
                    </span>
                </div>
            )}

            {/* Chat entry for accepted */}
            {isAccepted && post && (
                <div className="mt-2 flex items-center gap-2 text-violet-600 text-[13px] font-medium">
                    <MessageCircle className="w-4 h-4" />
                    <span>Enter group chat →</span>
                </div>
            )}

            {/* Pending message */}
            {isPending && request.message && (
                <div className="mt-2 px-3 py-2 bg-gray-50 rounded-xl">
                    <p className="text-[12px] text-gray-500 italic">&ldquo;{request.message}&rdquo;</p>
                </div>
            )}
        </button>
    );
}

// ─────────────────────────────────────────────────
//  ManageActivityTab
// ─────────────────────────────────────────────────
export default function ManageActivityTab() {
    const [activeSection, setActiveSection] = useState<'my-posts' | 'joined'>('my-posts');
    const {
        myPosts,
        joinedActivities,
        loadingPosts,
        loadingJoined,
        error,
        refresh,
    } = useManageActivity();

    const isLoading = activeSection === 'my-posts' ? loadingPosts : loadingJoined;

    return (
        <div
            className="max-w-md mx-auto h-full overflow-hidden flex flex-col px-5"
            style={{ overscrollBehavior: 'none' }}
        >
            {/* Section header */}
            <div className="shrink-0 pt-4 pb-2">
                <h2 className="text-[20px] font-bold text-gray-900 mb-3">Manage Activity</h2>

                {/* Segmented control */}
                <div className="flex bg-gray-100/80 rounded-xl p-1">
                    <button
                        onClick={() => setActiveSection('my-posts')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-medium transition-all ${activeSection === 'my-posts'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-400'
                            }`}
                    >
                        <FileText className="w-4 h-4" />
                        My Posts
                        {myPosts.length > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center bg-violet-100 text-violet-600 text-[10px] font-bold rounded-full px-1">
                                {myPosts.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveSection('joined')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-medium transition-all ${activeSection === 'joined'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-400'
                            }`}
                    >
                        <UserPlus className="w-4 h-4" />
                        Joined
                        {joinedActivities.length > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center bg-violet-100 text-violet-600 text-[10px] font-bold rounded-full px-1">
                                {joinedActivities.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto min-h-0 pb-20">
                {/* Refresh */}
                <div className="flex justify-center my-3">
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
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mx-1 mb-3">
                        <p className="text-red-700 text-sm text-center">{error}</p>
                        <button onClick={refresh} className="mt-2 text-red-600 text-sm font-medium w-full text-center">
                            Try again
                        </button>
                    </div>
                )}

                {/* My Posts Section */}
                {activeSection === 'my-posts' && (
                    <>
                        {loadingPosts && myPosts.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                                <p className="text-sm">Loading your posts...</p>
                            </div>
                        )}

                        {!loadingPosts && myPosts.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <FileText className="w-10 h-10 mb-3 text-gray-300" />
                                <p className="text-lg font-medium text-gray-600 mb-1">No posts yet</p>
                                <p className="text-sm text-gray-400">Create a post to find activity buddies!</p>
                            </div>
                        )}

                        <div className="space-y-3 px-0.5">
                            {myPosts.map((post) => (
                                <MyPostCard key={post.postId} post={post} />
                            ))}
                        </div>
                    </>
                )}

                {/* Joined Activities Section */}
                {activeSection === 'joined' && (
                    <>
                        {loadingJoined && joinedActivities.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                                <p className="text-sm">Loading joined activities...</p>
                            </div>
                        )}

                        {!loadingJoined && joinedActivities.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                                <UserPlus className="w-10 h-10 mb-3 text-gray-300" />
                                <p className="text-lg font-medium text-gray-600 mb-1">No joined activities</p>
                                <p className="text-sm text-gray-400">Join activities from the Home feed!</p>
                            </div>
                        )}

                        <div className="space-y-3 px-0.5">
                            {joinedActivities.map((item) => (
                                <JoinedActivityCard key={item.request.requestId} item={item} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
