'use client';

import { useState, useEffect } from 'react';
import { askGetThreads, AskThreadInfo } from '@/lib/firebase/functions';
import InlineAskChat from '@/components/activity/InlineAskChat';
import { Loader2, MessageCircle } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';

interface PostAskThreadsProps {
    postId: string;
    creatorUid: string;
}

export default function PostAskThreads({ postId, creatorUid }: PostAskThreadsProps) {
    const { user } = useAuth();
    const [threads, setThreads] = useState<AskThreadInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || user.uid !== creatorUid) {
            setLoading(false);
            return;
        }

        let mounted = true;

        async function fetchThreads() {
            try {
                setLoading(true);
                const res = await askGetThreads({ role: 'creator', postId, limit: 10 });
                if (mounted) {
                    setThreads(res.data.askThreads || []);
                }
            } catch (err) {
                console.error('[PostAskThreads] Error:', err);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        fetchThreads();

        return () => {
            mounted = false;
        };
    }, [postId, creatorUid, user]);

    if (loading) {
        return (
            <div className="flex justify-center items-center py-4 text-gray-400 border-t border-gray-50 mt-2">
                <Loader2 className="w-4 h-4 animate-spin" />
            </div>
        );
    }

    if (threads.length === 0) {
        return null;
    }

    return (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-widest pl-1">
                <MessageCircle className="w-3.5 h-3.5" />
                Incoming Asks ({threads.length})
            </div>
            {threads.map((thread) => (
                <div key={thread.askId} className="flex flex-col gap-2">
                    {/* Caller Context */}
                    <div className="text-sm font-medium text-gray-800 pl-1 flex items-center gap-2">
                        {thread.askerPhotoURL ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thread.askerPhotoURL} alt="avatar" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                            <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-500">
                                {thread.askerDisplayName[0]?.toUpperCase()}
                            </div>
                        )}
                        {thread.askerDisplayName} <span className="text-xs text-gray-400 font-normal border border-gray-200 rounded-md px-1 py-0.5">Asker</span>
                    </div>
                    <div className="pl-4 border-l-2 border-violet-100 mb-2">
                        <InlineAskChat
                            postId={postId}
                            creatorUid={creatorUid}
                            targetAskerUid={thread.askerUid}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}
