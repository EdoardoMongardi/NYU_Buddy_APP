'use client';

import { useState, useCallback, useEffect } from 'react';
import {
    activityPostGetMine,
    joinRequestGetMine,
    activityPostGetById,
    JoinRequestInfo,
    PostDetail,
    GroupInfo,
    FeedPost,
} from '@/lib/firebase/functions';

export interface JoinedActivity {
    request: JoinRequestInfo;
    post: PostDetail | null;
    group: GroupInfo | null;
    loading: boolean;
}

export interface IncomingRequestGroup {
    post: FeedPost;
    requests: JoinRequestInfo[];
}

export function useManageActivity() {
    const [myPosts, setMyPosts] = useState<PostDetail[]>([]);
    const [joinedActivities, setJoinedActivities] = useState<JoinedActivity[]>([]);
    const [incomingRequests, setIncomingRequests] = useState<IncomingRequestGroup[]>([]);

    const [loadingPosts, setLoadingPosts] = useState(true);
    const [loadingJoined, setLoadingJoined] = useState(true);
    const [loadingRequests, setLoadingRequests] = useState(true);

    const [error, setError] = useState<string | null>(null);

    const fetchMyPostsAndRequests = useCallback(async () => {
        try {
            setLoadingPosts(true);
            setLoadingRequests(true);
            setError(null);

            // 1. Fetch my posts (basic list)
            const res = await activityPostGetMine({});
            const feedPosts = res.data.posts;

            // 2. Enrich each post with full details in parallel (needed for groupId, etc.)
            //    and collect pending join requests at the same time.
            const requestGroups: IncomingRequestGroup[] = [];
            const postDetails: PostDetail[] = [];

            await Promise.all(feedPosts.map(async (feedPost) => {
                try {
                    const detailRes = await activityPostGetById({ postId: feedPost.postId });
                    postDetails.push(detailRes.data.post);

                    const pending = detailRes.data.joinRequests?.filter(r => r.status === 'pending') || [];
                    if (pending.length > 0) {
                        // Use feedPost for IncomingRequestGroup (compatible shape)
                        requestGroups.push({ post: feedPost as unknown as FeedPost, requests: pending });
                    }
                } catch (e) {
                    console.warn(`Failed to fetch details for post ${feedPost.postId}`, e);
                    // Fall back to feedPost cast as PostDetail so the card still renders
                    postDetails.push(feedPost as unknown as PostDetail);
                }
            }));

            // Preserve original ordering from activityPostGetMine
            const orderedDetails = feedPosts.map(
                (fp) => postDetails.find((d) => d.postId === fp.postId) ?? (fp as unknown as PostDetail)
            );

            setMyPosts(orderedDetails);
            setLoadingPosts(false);
            setIncomingRequests(requestGroups);
        } catch (err) {
            console.error('[useManageActivity] Error fetching my posts/requests:', err);
            setError(err instanceof Error ? err.message : 'Failed to load your posts');
            setLoadingPosts(false);
        } finally {
            setLoadingRequests(false);
        }
    }, []);

    const fetchJoinedActivities = useCallback(async () => {
        try {
            setLoadingJoined(true);
            // Don't reset error here if we want to preserve previous error? 
            // Better to clear it if retry.
            // setError(null); 

            const res = await joinRequestGetMine({});
            const requests = res.data.requests;

            // Initialize with loading state
            const initial: JoinedActivity[] = requests.map((r) => ({
                request: r,
                post: null,
                group: null,
                loading: true,
            }));
            setJoinedActivities(initial);

            // Enrich each request with post details in parallel
            const enriched = await Promise.all(
                requests.map(async (r) => {
                    try {
                        const detail = await activityPostGetById({ postId: r.postId });
                        return {
                            request: r,
                            post: detail.data.post,
                            group: detail.data.group,
                            loading: false,
                        };
                    } catch {
                        return {
                            request: r,
                            post: null,
                            group: null,
                            loading: false,
                        };
                    }
                })
            );
            setJoinedActivities(enriched);
        } catch (err) {
            console.error('[useManageActivity] Error fetching joined activities:', err);
            setError(err instanceof Error ? err.message : 'Failed to load joined activities');
        } finally {
            setLoadingJoined(false);
        }
    }, []);

    const refresh = useCallback(async () => {
        setError(null);
        await Promise.all([fetchMyPostsAndRequests(), fetchJoinedActivities()]);
    }, [fetchMyPostsAndRequests, fetchJoinedActivities]);

    useEffect(() => {
        refresh();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        myPosts,
        joinedActivities,
        incomingRequests,
        loadingPosts,
        loadingJoined,
        loadingRequests,
        error,
        refresh,
        refreshPosts: fetchMyPostsAndRequests,
        refreshJoined: fetchJoinedActivities,
    };
}
