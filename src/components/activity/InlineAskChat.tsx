'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { askGetThread, askSendMessage, AskMessage } from '@/lib/firebase/functions';
import { Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InlineAskChatProps {
    postId: string;
    creatorUid: string;
    onClose?: () => void;
    autoFocus?: boolean;
}

export default function InlineAskChat({ postId, creatorUid, onClose, autoFocus }: InlineAskChatProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [messages, setMessages] = useState<AskMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);

    // For creator: track who they tapped to reply to
    const [replyToAsker, setReplyToAsker] = useState<{ uid: string, name: string } | null>(null);

    const isCreator = user?.uid === creatorUid;

    useEffect(() => {
        if (!user) return;

        let mounted = true;

        async function fetchThread() {
            try {
                setLoading(true);
                // For creator, targetAskerUid is undefined -> fetches ALL comments
                // For asker, the backend uses their own uid automatically
                const res = await askGetThread({
                    postId,
                    limit: 100,
                });
                if (mounted) {
                    setMessages(res.data.messages || []);
                }
            } catch (err) {
                console.error('[InlineAskChat] Failed to fetch thread:', err);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        fetchThread();

        return () => {
            mounted = false;
        };
    }, [postId, isCreator, user]);

    const handleSend = async () => {
        if (!input.trim() || sending) return;
        if (isCreator && !replyToAsker) return; // Creator must select someone to reply to

        const trimmed = input.trim();
        const targetAskerUid = isCreator ? replyToAsker!.uid : undefined;
        setSending(true);

        // Optimistic UI update
        const tempId = `temp-${Date.now()}`;
        const newMsg: AskMessage = {
            id: tempId,
            senderUid: user!.uid,
            senderDisplayName: user!.displayName || 'Me',
            body: trimmed,
            createdAt: new Date().toISOString(),
            askerUid: targetAskerUid,
        };

        setMessages((prev) => [...prev, newMsg]);
        setInput('');
        if (isCreator) setReplyToAsker(null); // Reset reply state

        try {
            const res = await askSendMessage({
                postId,
                body: trimmed,
                targetAskerUid: targetAskerUid,
            });
            // Replace temp ID with real one
            setMessages((prev) => prev.map(m => m.id === tempId ? { ...m, id: res.data.messageId } : m));
        } catch (err) {
            console.error('[InlineAskChat] Failed to send message:', err);
            toast({ title: 'Message failed to send', variant: 'destructive' });
            setMessages((prev) => prev.filter(m => m.id !== tempId));
            setInput(trimmed);
        } finally {
            setSending(false);
        }
    };

    if (!user) return null;

    // If Creator and no messages exist, hide the section entirely
    if (isCreator && messages.length === 0 && !loading) {
        return null;
    }

    return (
        <div className="bg-gray-50/70 rounded-xl overflow-hidden flex flex-col mt-3">
            {/* Header / Top padding */}
            {onClose && (
                <div className="flex justify-end pt-1 pr-2">
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-[11px] font-medium px-2 py-1">
                        Close Ask
                    </button>
                </div>
            )}

            {/* Messages Area (WeChat Moment Style) */}
            <div className="px-3 pb-2 pt-2 text-[13px] leading-relaxed">
                {loading ? (
                    <div className="flex justify-center items-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    </div>
                ) : messages.length === 0 && !isCreator ? (
                    <div className="text-gray-400 italic py-2">
                        Ask a question. Only the creator will see it.
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {messages.map((msg) => {
                            const isMe = msg.senderUid === user.uid;
                            let displayNameHTML;

                            if (isCreator) {
                                if (isMe) {
                                    // Creator replied
                                    const askerName = messages.find(m => m.senderUid === msg.askerUid && m.senderUid !== user.uid)?.senderDisplayName || 'Unknown';
                                    displayNameHTML = (
                                        <>
                                            <span className="font-semibold text-violet-700 cursor-pointer">You</span>
                                            <span className="text-gray-500 mx-1 border border-gray-200 text-[10px] px-1 rounded-md bg-white">Replied</span>
                                            <span className="font-semibold text-violet-700 cursor-pointer">{askerName}</span>
                                            <span className="font-semibold text-violet-700">: </span>
                                        </>
                                    );
                                } else {
                                    // Asker asked
                                    displayNameHTML = (
                                        <>
                                            <span className="font-semibold text-violet-700 cursor-pointer">{msg.senderDisplayName}</span>
                                            <span className="font-semibold text-violet-700">: </span>
                                        </>
                                    );
                                }
                            } else {
                                if (isMe) {
                                    displayNameHTML = (
                                        <>
                                            <span className="font-semibold text-violet-700 cursor-pointer">You</span>
                                            <span className="font-semibold text-violet-700">: </span>
                                        </>
                                    );
                                } else {
                                    displayNameHTML = (
                                        <>
                                            <span className="font-semibold text-violet-700 cursor-pointer">{msg.senderDisplayName}</span>
                                            <span className="font-semibold text-gray-500 mx-1 text-[10px] border border-gray-200 px-1 rounded-md bg-white">Creator</span>
                                            <span className="font-semibold text-violet-700">: </span>
                                        </>
                                    );
                                }
                            }

                            return (
                                <div
                                    key={msg.id}
                                    className={`active:bg-gray-200 transition-colors rounded-sm px-1 py-0.5 ${isCreator && !isMe ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                                    onClick={() => {
                                        if (isCreator && !isMe) {
                                            setReplyToAsker({ uid: msg.senderUid, name: msg.senderDisplayName });
                                        }
                                    }}
                                >
                                    {displayNameHTML}
                                    <span className="text-gray-800">{msg.body}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Input Area */}
            {(!isCreator || replyToAsker) && (
                <div className="p-2 border-t border-gray-200/50 bg-white flex items-end gap-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={isCreator ? `Reply to ${replyToAsker?.name}...` : "Ask a question..."}
                        className="flex-1 bg-gray-100 border-none rounded-xl px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                        rows={1}
                        autoFocus={autoFocus || !!replyToAsker}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        style={{ minHeight: '36px', maxHeight: '100px' }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || sending}
                        className="mb-0.5 p-2 bg-violet-600 text-white rounded-full hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5 ml-0.5 mb-0.5" />}
                    </button>
                    {isCreator && replyToAsker && (
                        <button
                            onClick={() => setReplyToAsker(null)}
                            className="text-[11px] text-gray-400 hover:text-gray-600 mb-2 mr-1"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
