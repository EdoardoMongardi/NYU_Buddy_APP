'use client';

import { useState, useCallback, useEffect } from 'react';
import {
    activityPostGetMine,
    joinRequestGetMine,
    activityPostGetById,
    FeedPost,
    JoinRequestInfo,
    PostDetail,
    GroupInfo,
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
    const [myPosts, setMyPosts] = useState<FeedPost[]>([]);
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

            // 1. Fetch my posts
            const res = await activityPostGetMine({});
            const posts = res.data.posts;
            setMyPosts(posts);
            setLoadingPosts(false); // Posts are ready

            // 2. Fetch requests for each post (parallel)
            // Only fetch for open posts or those that might have pending requests
            // For simplicity, we check all non-expired posts or just all posts
            const requestGroups: IncomingRequestGroup[] = [];

            await Promise.all(posts.map(async (post) => {
                try {
                    // Skip if post is hopelessly old/closed? No, user might still want to see.
                    const detailRes = await activityPostGetById({ postId: post.postId });
                    const pending = detailRes.data.joinRequests?.filter(r => r.status === 'pending') || [];

                    if (pending.length > 0) {
                        requestGroups.push({ post, requests: pending });
                    }
                } catch (e) {
                    console.warn(`Failed to fetch details for post ${post.postId}`, e);
                }
            }));

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
