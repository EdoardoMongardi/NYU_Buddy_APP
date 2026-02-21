'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { askGetThread, askSendMessage, AskMessage } from '@/lib/firebase/functions';
import { Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InlineAskChatProps {
    postId: string;
    creatorUid: string;
    targetAskerUid?: string; // Required if viewing from creator's side (My Posts) to pinpoint the thread
    onClose?: () => void;
    autoFocus?: boolean;
}

export default function InlineAskChat({ postId, creatorUid, targetAskerUid, onClose, autoFocus }: InlineAskChatProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [messages, setMessages] = useState<AskMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);

    const isCreator = user?.uid === creatorUid;
    // If the user is the creator, they MUST correspond with a specific asker.
    const askerUid = isCreator ? targetAskerUid : user?.uid;

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!user || !askerUid) return;

        let mounted = true;

        async function fetchThread() {
            try {
                setLoading(true);
                const res = await askGetThread({
                    postId,
                    targetAskerUid: isCreator ? askerUid : undefined,
                    limit: 50,
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
    }, [postId, isCreator, askerUid, user]);

    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || sending) return;

        const trimmed = input.trim();
        setSending(true);

        // Optimistic UI update
        const tempId = `temp-${Date.now()}`;
        const newMsg: AskMessage = {
            id: tempId,
            senderUid: user!.uid,
            senderDisplayName: user!.displayName || 'Me',
            body: trimmed,
            createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, newMsg]);
        setInput('');

        try {
            const res = await askSendMessage({
                postId,
                body: trimmed,
                targetAskerUid: isCreator ? askerUid : undefined,
            });
            // Replace temp ID with real one
            setMessages((prev) => prev.map(m => m.id === tempId ? { ...m, id: res.data.messageId } : m));
        } catch (err) {
            console.error('[InlineAskChat] Failed to send message:', err);
            toast({ title: 'Message failed to send', variant: 'destructive' });
            // Remove optimistic message on failure
            setMessages((prev) => prev.filter(m => m.id !== tempId));
            setInput(trimmed); // Restore input
        } finally {
            setSending(false);
        }
    };

    if (!user) return null;

    return (
        <div className="bg-gray-50/50 rounded-xl border border-gray-100 overflow-hidden flex flex-col max-h-[400px]">
            {/* Header (optional, usually inline UI doesn't need a heavy header, maybe just a close button if triggered manually) */}
            {onClose && (
                <div className="flex justify-end p-2 border-b border-gray-100">
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-[12px] font-medium px-2 py-1">
                        Close
                    </button>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[100px]">
                {loading ? (
                    <div className="flex justify-center items-center h-full">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-gray-400 text-[13px] italic py-4">
                        {isCreator ? "No messages yet." : "Ask the creator a question. They will be the only one to see it."}
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.senderUid === user.uid;
                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] ${isMe ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm shadow-sm'}`}>
                                    {msg.body}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-2 bg-white border-t border-gray-100 flex items-end gap-2">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isCreator ? "Reply..." : "Ask a question..."}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                    rows={1}
                    autoFocus={autoFocus}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    style={{ minHeight: '40px', maxHeight: '120px' }}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className="mb-0.5 p-2 bg-violet-600 text-white rounded-full hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}
