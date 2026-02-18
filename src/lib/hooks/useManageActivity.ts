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

export function useManageActivity() {
    const [myPosts, setMyPosts] = useState<FeedPost[]>([]);
    const [joinedActivities, setJoinedActivities] = useState<JoinedActivity[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [loadingJoined, setLoadingJoined] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMyPosts = useCallback(async () => {
        try {
            setLoadingPosts(true);
            setError(null);
            const res = await activityPostGetMine({ status: null });
            setMyPosts(res.data.posts);
        } catch (err) {
            console.error('[useManageActivity] Error fetching my posts:', err);
            setError(err instanceof Error ? err.message : 'Failed to load your posts');
        } finally {
            setLoadingPosts(false);
        }
    }, []);

    const fetchJoinedActivities = useCallback(async () => {
        try {
            setLoadingJoined(true);
            setError(null);
            const res = await joinRequestGetMine({ status: null });
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
        await Promise.all([fetchMyPosts(), fetchJoinedActivities()]);
    }, [fetchMyPosts, fetchJoinedActivities]);

    useEffect(() => {
        refresh();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        myPosts,
        joinedActivities,
        loadingPosts,
        loadingJoined,
        error,
        refresh,
        refreshPosts: fetchMyPosts,
        refreshJoined: fetchJoinedActivities,
    };
}
