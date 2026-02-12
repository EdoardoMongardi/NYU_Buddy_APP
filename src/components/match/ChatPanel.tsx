'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { StatusQuickActions } from './StatusQuickActions';
import { ChatMessage } from '@/lib/hooks/useChat';
import { Timestamp } from 'firebase/firestore';

// ─── Props ───────────────────────────────────────────────────────────

export interface ChatPanelProps {
    messages: ChatMessage[];
    currentUserUid: string;
    otherUserName: string;
    currentUserPhotoURL?: string | null;
    otherUserPhotoURL?: string | null;
    onSendMessage: (content: string) => Promise<void>;
    isSending: boolean;
    isAtLimit: boolean;
    totalCount: number;
    error: string | null;
    // Status quick-action props (only for Step 2)
    myStatus?: string;
    isUpdatingStatus?: boolean;
    onStatusUpdate?: (status: 'heading_there' | 'arrived' | 'completed') => void;
    // Confirmed place (only for Step 2)
    confirmedPlaceName?: string;
    confirmedPlaceAddress?: string;
    /** When true the keyboard is open — shrinks padding and hides
     *  secondary UI elements to maximise message area. */
    compact?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const FIRST_PERSON_STATUS: Record<string, string> = {
    'is on the way 🚶': 'are on the way 🚶',
    'has arrived 📍': 'have arrived 📍',
    'marked the meetup as complete ✅': 'marked the meetup as complete ✅',
    'cancelled the match ❌': 'cancelled the match ❌',
};

function formatTime(timestamp: Timestamp | null): string {
    if (!timestamp) return '';
    try {
        return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function shouldShowTimestamp(current: ChatMessage, previous: ChatMessage | null): boolean {
    if (!previous) return true;
    if (!current.createdAt || !previous.createdAt) return false;
    try {
        return current.createdAt.toMillis() - previous.createdAt.toMillis() > 5 * 60 * 1000;
    } catch {
        return false;
    }
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * Full chat interface that lives inside a flex container whose height
 * is driven by the visual-viewport CSS variable `--vvh`.
 *
 * The input bar is NOT position:fixed — it sits at the bottom of the
 * flex layout, which naturally follows the keyboard via the container
 * height.  This avoids all iOS-specific fixed-positioning quirks.
 */
export function ChatPanel({
    messages,
    currentUserUid,
    otherUserName,
    currentUserPhotoURL,
    otherUserPhotoURL,
    onSendMessage,
    isSending,
    isAtLimit,
    totalCount,
    error,
    myStatus,
    isUpdatingStatus,
    onStatusUpdate,
    confirmedPlaceName,
    confirmedPlaceAddress,
    compact = false,
}: ChatPanelProps) {
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const wasAtBottomRef = useRef(true);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    // Keep scroll pinned to bottom when container resizes (keyboard)
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        const checkAtBottom = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
        };

        container.addEventListener('scroll', checkAtBottom, { passive: true });

        const observer = new ResizeObserver(() => {
            if (wasAtBottomRef.current) {
                requestAnimationFrame(() => {
                    if (messagesContainerRef.current) {
                        messagesContainerRef.current.scrollTop =
                            messagesContainerRef.current.scrollHeight;
                    }
                });
            }
        });
        observer.observe(container);

        return () => {
            container.removeEventListener('scroll', checkAtBottom);
            observer.disconnect();
        };
    }, []);

    const handleInputFocus = () => {
        requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
    };

    const handleSend = async () => {
        if (!inputValue.trim() || isSending || isAtLimit) return;
        const content = inputValue;
        setInputValue('');
        await onSendMessage(content);
        // Only re-focus when the keyboard is already open so the
        // user can keep typing.  When the keyboard is closed (user
        // pressed "Done" then tapped Send), don't reopen it.
        if (compact) {
            inputRef.current?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const charCount = inputValue.trim().length;
    const showCharCount = charCount > 400;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ── Confirmed place bar (Step 2) ── */}
            {confirmedPlaceName && (
                <div
                    className="flex items-center gap-2 px-3 bg-green-50 border-b border-green-100 flex-shrink-0"
                    style={{
                        paddingTop: compact ? '4px' : '6px',
                        paddingBottom: compact ? '4px' : '6px',
                        transition: 'padding 0.28s ease-out',
                    }}
                >
                    <div className="w-5 h-5 rounded bg-green-100 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-3 h-3 text-green-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium text-green-800 truncate">{confirmedPlaceName}</p>
                        {confirmedPlaceAddress && (
                            <div
                                style={{
                                    maxHeight: compact ? '0px' : '20px',
                                    opacity: compact ? 0 : 1,
                                    overflow: 'hidden',
                                    transition: 'max-height 0.28s ease-out, opacity 0.28s ease-out',
                                }}
                            >
                                <p className="text-[10px] text-green-600 truncate">{confirmedPlaceAddress}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Messages area ── */}
            <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0"
                style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
            >
                {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-gray-400">Say hi to {otherUserName}! 👋</p>
                    </div>
                )}

                {messages.map((msg, index) => {
                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    const showTime = shouldShowTimestamp(msg, prevMsg);
                    const isMine = msg.senderUid === currentUserUid;

                    return (
                        <div key={msg.id}>
                            {showTime && msg.createdAt && (
                                <div className="flex justify-center my-1.5">
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                                        {formatTime(msg.createdAt)}
                                    </span>
                                </div>
                            )}

                            {msg.type === 'status' ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex justify-center my-1.5"
                                >
                                    <span className={`text-xs px-3 py-1 rounded-full ${isMine ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                        {isMine ? 'You' : otherUserName.split(' ')[0]}{' '}
                                        {isMine ? (FIRST_PERSON_STATUS[msg.content] || msg.content) : msg.content}
                                    </span>
                                </motion.div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex items-end gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}
                                >
                                    {!isMine && (
                                        <div className="flex-shrink-0 mb-0.5">
                                            <ProfileAvatar
                                                photoURL={otherUserPhotoURL || null}
                                                displayName={otherUserName}
                                                size="xs"
                                            />
                                        </div>
                                    )}
                                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${isMine
                                        ? 'bg-violet-600 text-white rounded-br-md'
                                        : 'bg-gray-100 text-gray-900 rounded-bl-md'
                                        }`}>
                                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                    </div>
                                    {isMine && (
                                        <div className="flex-shrink-0 mb-0.5">
                                            <ProfileAvatar
                                                photoURL={currentUserPhotoURL || null}
                                                displayName="You"
                                                size="xs"
                                            />
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* ── Error banner ── */}
            {error && (
                <div className="px-3 py-1 bg-red-50 border-t border-red-100 flex-shrink-0">
                    <p className="text-xs text-red-600">{error}</p>
                </div>
            )}

            {/* ── Status quick actions (Step 2) ── */}
            {myStatus && onStatusUpdate && (
                <div className="flex-shrink-0">
                    <StatusQuickActions
                        myStatus={myStatus}
                        isUpdating={isUpdatingStatus || false}
                        onStatusUpdate={onStatusUpdate}
                    />
                </div>
            )}

            {/* ── Input area ── */}
            <div
                className="flex-shrink-0 border-t border-gray-100 bg-white"
                style={{
                    paddingBottom: 'var(--safe-bottom, env(safe-area-inset-bottom, 0px))',
                    transition: 'padding-bottom 200ms ease-out',
                }}
            >
                <div
                    className="mx-auto max-w-md px-3"
                    style={{
                        paddingTop: compact ? '2px' : '6px',
                        paddingBottom: compact ? '2px' : '6px',
                        transition: 'padding 0.28s ease-out',
                    }}
                >
                    <div className="flex items-end gap-1.5">
                        <textarea
                            ref={inputRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={handleInputFocus}
                            onTouchEnd={(e) => {
                                // Prevent iOS auto-scroll on initial focus.
                                if (!compact) {
                                    e.preventDefault();
                                    inputRef.current?.focus({ preventScroll: true });
                                }
                            }}
                            placeholder={isAtLimit ? 'Message limit reached' : 'Type a message...'}
                            disabled={isAtLimit}
                            rows={1}
                            className="flex-1 resize-none border border-violet-200 rounded-2xl px-3 py-2 text-sm
                                focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent
                                disabled:bg-gray-50 disabled:text-gray-400
                                max-h-20 overflow-y-auto bg-white"
                            style={{ minHeight: '36px', fontSize: '16px' }}
                        />
                        <Button
                            size="icon"
                            className="rounded-full h-8 w-8 bg-violet-600 hover:bg-violet-700 flex-shrink-0"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleSend}
                            disabled={!inputValue.trim() || isSending || isAtLimit}
                        >
                            <Send className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    {!compact && (
                        <div className="flex justify-between px-1 mt-0.5">
                            {showCharCount && (
                                <span className={`text-[10px] ${charCount > 500 ? 'text-red-500' : 'text-gray-400'}`}>
                                    {charCount}/500
                                </span>
                            )}
                            <span className="text-[10px] text-gray-300 ml-auto">
                                {totalCount}/400
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
