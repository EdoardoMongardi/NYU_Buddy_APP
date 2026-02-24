'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import {
    askGetThread,
    askGetThreads,
    askSendMessage,
    AskMessage,
    AskThreadInfo,
} from '@/lib/firebase/functions';
import { Loader2, Send, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';

interface InlineAskChatProps {
    postId: string;
    creatorUid: string;
    postStatus?: string;
    autoFocus?: boolean;
    isExpired?: boolean;
}

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

// ─── Creator view ────────────────────────────────────────────────────────────
// Uses askGetThreads for asker metadata (photo/name) and askGetThread (no
// targetAskerUid) for the FULL message history so creator replies and asker
// follow-ups are never lost.
function CreatorAsksView({ postId, isExpired }: { postId: string; isExpired?: boolean }) {
    const { user } = useAuth();
    const { toast } = useToast();
    // thread metadata keyed by askerUid
    const [threads, setThreads] = useState<AskThreadInfo[]>([]);
    // all messages for this post, keyed by askerUid
    const [msgsByAsker, setMsgsByAsker] = useState<Record<string, AskMessage[]>>({});
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState(false);
    const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
    const [sending, setSending] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        let mounted = true;
        async function fetchData() {
            try {
                setLoading(true);
                // Fetch thread summaries (for asker photo/name) AND full messages in parallel.
                // askGetThread without targetAskerUid returns ALL messages for ALL askers on
                // this post, each tagged with askerUid, so we get the complete history.
                const [threadsRes, allMsgsRes] = await Promise.all([
                    askGetThreads({ role: 'creator' }),
                    askGetThread({ postId }),
                ]);
                if (!mounted) return;

                const filteredThreads = (threadsRes.data.askThreads || []).filter(
                    t => t.postId === postId
                );
                setThreads(filteredThreads);

                // Group messages by askerUid
                const grouped: Record<string, AskMessage[]> = {};
                for (const msg of allMsgsRes.data.messages || []) {
                    const key = msg.askerUid || 'unknown';
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(msg);
                }
                setMsgsByAsker(grouped);
            } catch (err) {
                console.error('[InlineAskChat] Failed to fetch data:', err);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        fetchData();
        return () => { mounted = false; };
    }, [postId, user]);

    const handleReply = async (askerUid: string) => {
        const body = replyInputs[askerUid]?.trim();
        if (!body || sending) return;
        setSending(askerUid);
        setReplyInputs(prev => ({ ...prev, [askerUid]: '' }));

        // Optimistic update — append creator reply to the right thread
        const tempMsg: AskMessage = {
            id: `temp-${Date.now()}`,
            senderUid: user!.uid,
            senderDisplayName: user!.displayName || 'Me',
            body,
            createdAt: new Date().toISOString(),
            askerUid,
        };
        setMsgsByAsker(prev => ({
            ...prev,
            [askerUid]: [...(prev[askerUid] || []), tempMsg],
        }));

        try {
            const res = await askSendMessage({ postId, body, targetAskerUid: askerUid });
            // Replace temp ID with real one
            setMsgsByAsker(prev => ({
                ...prev,
                [askerUid]: (prev[askerUid] || []).map(m =>
                    m.id === tempMsg.id ? { ...m, id: res.data.messageId } : m
                ),
            }));
        } catch (err) {
            console.error('[InlineAskChat] Failed to send reply:', err);
            toast({ title: 'Failed to send reply', variant: 'destructive' });
            // Roll back optimistic update
            setMsgsByAsker(prev => ({
                ...prev,
                [askerUid]: (prev[askerUid] || []).filter(m => m.id !== tempMsg.id),
            }));
            setReplyInputs(prev => ({ ...prev, [askerUid]: body }));
        } finally {
            setSending(null);
        }
    };

    if (loading) {
        return (
            <div className="mt-3 flex justify-center py-2">
                <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
            </div>
        );
    }

    if (threads.length === 0) return null;

    return (
        <div className="mt-3 border-t border-gray-100 pt-3">
            {/* Collapsible header */}
            <button
                onClick={() => setCollapsed(c => !c)}
                className="w-full flex items-center gap-1.5 px-1 py-0.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
                <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-[12px] font-semibold text-gray-600">{isExpired ? 'Asks history' : 'Asks'}</span>
                <span className="text-[11px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full ml-0.5">
                    {threads.length}
                </span>
                <span className="ml-auto text-gray-400">
                    {collapsed
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronUp className="w-3.5 h-3.5" />
                    }
                </span>
            </button>

            {!collapsed && (
                <div className="space-y-3 mt-2">
                    {threads.map((thread) => {
                        const msgs = msgsByAsker[thread.askerUid] || [];
                        return (
                            <div key={thread.askerUid} className="bg-gray-50 rounded-xl p-3">
                                {/* Asker header row */}
                                <div className="flex items-center gap-2 mb-2">
                                    <ProfileAvatar
                                        photoURL={thread.askerPhotoURL}
                                        displayName={thread.askerDisplayName}
                                        size="xs"
                                        className="w-7 h-7 flex-shrink-0"
                                    />
                                    <span className="text-[12px] font-semibold text-gray-800 truncate flex-1">
                                        {thread.askerDisplayName}
                                    </span>
                                    <span className="text-[11px] text-gray-400 flex-shrink-0">
                                        {timeAgo(thread.lastMessageAt)}
                                    </span>
                                </div>

                                {/* Full conversation bubbles */}
                                <div className="space-y-1.5 mb-2.5">
                                    {msgs.map((msg) => {
                                        const isOwn = msg.senderUid === user!.uid;
                                        return (
                                            <div
                                                key={msg.id}
                                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ml-9`}
                                            >
                                                <div className={`max-w-[90%] px-3 py-2 rounded-xl text-[13px] leading-relaxed ${isOwn
                                                        ? 'bg-violet-100 text-violet-900 rounded-br-sm'
                                                        : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
                                                    }`}>
                                                    {msg.body}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Reply input */}
                                <div className="ml-9 flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={replyInputs[thread.askerUid] || ''}
                                        onChange={(e) =>
                                            setReplyInputs(prev => ({ ...prev, [thread.askerUid]: e.target.value }))
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleReply(thread.askerUid);
                                        }}
                                        placeholder={`Reply to ${thread.askerDisplayName.split(' ')[0]}…`}
                                        className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-400 min-w-0"
                                    />
                                    <button
                                        onClick={() => handleReply(thread.askerUid)}
                                        disabled={!replyInputs[thread.askerUid]?.trim() || sending === thread.askerUid}
                                        className="p-1.5 bg-violet-600 text-white rounded-full hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex-shrink-0"
                                    >
                                        {sending === thread.askerUid
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <Send className="w-3 h-3" />
                                        }
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Asker view: shows own thread as chat bubbles + send input ───
function AskerAskView({ postId, postStatus, autoFocus, isExpired }: { postId: string; postStatus?: string; autoFocus?: boolean; isExpired?: boolean }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [messages, setMessages] = useState<AskMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!user) return;
        let mounted = true;
        async function fetchThread() {
            try {
                setLoading(true);
                const res = await askGetThread({ postId });
                if (mounted) setMessages(res.data.messages || []);
            } catch (err) {
                console.error('[InlineAskChat] Failed to fetch thread:', err);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        fetchThread();
        return () => { mounted = false; };
    }, [postId, user]);

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus, loading]);

    const handleSend = async () => {
        if (!input.trim() || sending) return;
        const trimmed = input.trim();
        setSending(true);

        const tempMsg: AskMessage = {
            id: `temp-${Date.now()}`,
            senderUid: user!.uid,
            senderDisplayName: user!.displayName || 'Me',
            body: trimmed,
            createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, tempMsg]);
        setInput('');

        try {
            const res = await askSendMessage({ postId, body: trimmed });
            setMessages(prev =>
                prev.map(m => m.id === tempMsg.id ? { ...m, id: res.data.messageId } : m)
            );
        } catch (err) {
            console.error('[InlineAskChat] Failed to send:', err);
            toast({ title: 'Failed to send message', variant: 'destructive' });
            setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
            setInput(trimmed);
        } finally {
            setSending(false);
        }
    };

    if (!user) return null;

    // askSendMessage requires post to be 'open'; show read-only input for other statuses
    const canSend = !postStatus || postStatus === 'open';

    return (
        <div className="mt-3 border-t border-gray-100 pt-3">
            {/* My Ask header */}
            <div className="flex items-center gap-1.5 mb-2 px-1">
                <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-[12px] font-semibold text-gray-600">{isExpired ? 'Ask history' : 'My Ask'}</span>
            </div>

            {loading ? (
                <div className="flex justify-center py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
                </div>
            ) : (
                <div className="space-y-1.5 mb-2.5">
                    {messages.length === 0 && canSend && (
                        <p className="text-[12px] text-gray-400 italic px-1">
                            Ask a question — only the creator will see it.
                        </p>
                    )}
                    {messages.map((msg) => {
                        const isMe = msg.senderUid === user.uid;
                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[85%] px-3 py-2 rounded-xl text-[13px] leading-relaxed ${isMe
                                        ? 'bg-violet-100 text-violet-900 rounded-br-sm'
                                        : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
                                        }`}
                                >
                                    {!isMe && (
                                        <p className="text-[10px] font-semibold text-gray-500 mb-0.5">
                                            {msg.senderDisplayName}{' '}
                                            <span className="font-normal text-gray-400">Creator</span>
                                        </p>
                                    )}
                                    {msg.body}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Input — only shown when post is still open */}
            {canSend ? (
                <div className="flex items-center gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                        placeholder="Send another message…"
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-[12px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-400 min-w-0"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || sending}
                        className="p-1.5 bg-violet-600 text-white rounded-full hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex-shrink-0"
                    >
                        {sending
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Send className="w-3 h-3" />
                        }
                    </button>
                </div>
            ) : (
                messages.length > 0 && (
                    <p className="text-[11px] text-gray-400 italic px-1">This activity is no longer accepting messages.</p>
                )
            )}
        </div>
    );
}

// ─── Main export ───
export default function InlineAskChat({ postId, creatorUid, postStatus, autoFocus, isExpired }: InlineAskChatProps) {
    const { user } = useAuth();
    if (!user) return null;

    const isCreator = user.uid === creatorUid;

    if (isCreator) {
        return <CreatorAsksView postId={postId} isExpired={isExpired} />;
    }

    return <AskerAskView postId={postId} postStatus={postStatus} autoFocus={autoFocus} isExpired={isExpired} />;
}
