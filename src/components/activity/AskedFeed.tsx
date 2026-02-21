'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { askGetThreads, AskThreadInfo } from '@/lib/firebase/functions';
import ActivityPostCard from '@/components/activity/ActivityPostCard';
import { Loader2, MessageSquareOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/hooks/useAuth';

export default function AskedFeed() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [threads, setThreads] = useState<AskThreadInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);

    const fetchThreads = useCallback(async (cursor: string | null = null, append = false) => {
        if (!user) return;
        try {
            if (append) setLoadingMore(true);
            else setLoading(true);

            const res = await askGetThreads({ role: 'asker', cursor, limit: 15 });

            const newThreads = res.data.askThreads || [];
            if (append) {
                setThreads(prev => {
                    const existingIds = new Set(prev.map(t => t.askId));
                    const unique = newThreads.filter(t => !existingIds.has(t.askId));
                    return [...prev, ...unique];
                });
            } else {
                setThreads(newThreads);
            }
            setNextCursor(res.data.nextCursor || null);
        } catch (err: unknown) {
            console.error('[AskedFeed] Error:', err);
            toast({
                title: 'Error loading Asked posts',
                description: err instanceof Error ? err.message : 'Unknown error',
                variant: 'destructive',
            });
        } finally {
            if (append) setLoadingMore(false);
            else setLoading(false);
        }
    }, [user, toast]);

    // Initial load
    useEffect(() => {
        fetchThreads(null, false);
    }, [fetchThreads]);

    // Infinite Scroll Intersection Observer
    const observerTarget = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const target = observerTarget.current;
        if (!target) return;

        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && nextCursor && !loading && !loadingMore) {
                    fetchThreads(nextCursor, true);
                }
            },
            { rootMargin: '200px' }
        );

        observer.observe(target);
        return () => observer.unobserve(target);
    }, [nextCursor, loading, loadingMore, fetchThreads]);

    if (loading && threads.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 min-h-[50vh]">
                <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
                <p className="text-gray-500 text-sm font-medium">Loading your asked posts...</p>
            </div>
        );
    }

    if (!loading && threads.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-5 min-h-[50vh]">
                <MessageSquareOff className="w-12 h-12 text-gray-200 mb-4 stroke-1" />
                <h3 className="text-lg font-semibold text-gray-800 mb-1 tracking-tight">No Asked Posts</h3>
                <p className="text-sm text-gray-500 text-center max-w-[260px] leading-relaxed">
                    When you ask for more details about a post, it will appear here.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full pb-20">
            {threads.map((thread) => {
                if (!thread.post) return null;
                return (
                    <ActivityPostCard
                        key={thread.askId}
                        post={thread.post}
                        defaultAskExpanded={true}
                    />
                );
            })}

            {/* Infinite scroll marker */}
            <div ref={observerTarget} className="h-20 flex items-center justify-center w-full">
                {loadingMore && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
                {!loadingMore && !nextCursor && threads.length > 0 && (
                    <p className="text-[13px] text-gray-400 font-medium pb-24">You&apos;ve reached the end</p>
                )}
            </div>
        </div>
    );
}
