'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { StatusQuickActions } from './StatusQuickActions';
import { ChatMessage } from '@/lib/hooks/useChat';
import { Timestamp } from 'firebase/firestore';

interface ChatPanelProps {
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
}

// Map third-person status content to first-person for 'You' prefix
const FIRST_PERSON_STATUS: Record<string, string> = {
    'is on the way 🚶': 'are on the way 🚶',
    'has arrived 📍': 'have arrived 📍',
    'marked the meetup as complete ✅': 'marked the meetup as complete ✅',
    'cancelled the match ❌': 'cancelled the match ❌',
};

function formatTime(timestamp: Timestamp | null): string {
    if (!timestamp) return '';
    try {
        const date = timestamp.toDate();
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function shouldShowTimestamp(
    current: ChatMessage,
    previous: ChatMessage | null
): boolean {
    if (!previous) return true; // Always show for first message
    if (!current.createdAt || !previous.createdAt) return false;
    try {
        const diff =
            current.createdAt.toMillis() - previous.createdAt.toMillis();
        return diff > 5 * 60 * 1000; // 5 minutes
    } catch {
        return false;
    }
}

/**
 * Full chat interface with message bubbles, status announcements,
 * time separators, and input area with optional status pills.
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
}: ChatPanelProps) {
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    const handleSend = async () => {
        if (!inputValue.trim() || isSending || isAtLimit) return;
        const content = inputValue;
        setInputValue('');
        await onSendMessage(content);
        inputRef.current?.focus();
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
        <div className="flex flex-col h-full">
            {/* Compact confirmed place bar */}
            {confirmedPlaceName && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border-b border-green-100 flex-shrink-0">
                    <div className="w-6 h-6 rounded bg-green-100 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-3.5 h-3.5 text-green-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-green-800 truncate">
                            {confirmedPlaceName}
                        </p>
                        {confirmedPlaceAddress && (
                            <p className="text-[10px] text-green-600 truncate">
                                {confirmedPlaceAddress}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 min-h-0">
                {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-gray-400">
                            Say hi to {otherUserName}! 👋
                        </p>
                    </div>
                )}

                {messages.map((msg, index) => {
                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    const showTime = shouldShowTimestamp(msg, prevMsg);
                    const isMine = msg.senderUid === currentUserUid;

                    return (
                        <div key={msg.id}>
                            {/* Time separator */}
                            {showTime && msg.createdAt && (
                                <div className="flex justify-center my-2">
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                                        {formatTime(msg.createdAt)}
                                    </span>
                                </div>
                            )}

                            {/* Status announcement */}
                            {msg.type === 'status' ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex justify-center my-2"
                                >
                                    <span
                                        className={`text-xs px-3 py-1 rounded-full ${isMine
                                            ? 'bg-violet-50 text-violet-600'
                                            : 'bg-emerald-50 text-emerald-600'
                                            }`}
                                    >
                                        {isMine ? 'You' : otherUserName.split(' ')[0]}{' '}
                                        {isMine ? (FIRST_PERSON_STATUS[msg.content] || msg.content) : msg.content}
                                    </span>
                                </motion.div>
                            ) : (
                                /* Text message bubble with avatar */
                                <motion.div
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex items-end gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}
                                >
                                    {/* Other user's avatar (left side) */}
                                    {!isMine && (
                                        <div className="flex-shrink-0 mb-0.5">
                                            <ProfileAvatar
                                                photoURL={otherUserPhotoURL || null}
                                                displayName={otherUserName}
                                                size="xs"
                                            />
                                        </div>
                                    )}
                                    <div
                                        className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${isMine
                                            ? 'bg-violet-600 text-white rounded-br-md'
                                            : 'bg-gray-100 text-gray-900 rounded-bl-md'
                                            }`}
                                    >
                                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                    </div>
                                    {/* Current user's avatar (right side) */}
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

            {/* Error banner */}
            {error && (
                <div className="px-3 py-1.5 bg-red-50 border-t border-red-100">
                    <p className="text-xs text-red-600">{error}</p>
                </div>
            )}

            {/* Status quick actions (Step 2 only) */}
            {myStatus && onStatusUpdate && (
                <div className="border-t border-gray-100 flex-shrink-0">
                    <StatusQuickActions
                        myStatus={myStatus}
                        isUpdating={isUpdatingStatus || false}
                        onStatusUpdate={onStatusUpdate}
                    />
                </div>
            )}

            {/* Input area */}
            <div className="border-t border-gray-200 p-1 flex-shrink-0">
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isAtLimit ? 'Message limit reached' : 'Type a message...'}
                        disabled={isAtLimit}
                        rows={1}
                        className="flex-1 resize-none border border-gray-200 rounded-2xl px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent
              disabled:bg-gray-50 disabled:text-gray-400
              max-h-20 overflow-y-auto"
                        style={{ minHeight: '36px', fontSize: '16px' }}
                    />
                    <Button
                        size="icon"
                        className="rounded-full h-9 w-9 bg-violet-600 hover:bg-violet-700 flex-shrink-0"
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isSending || isAtLimit}
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>

                {/* Character count + message count */}
                <div className="flex justify-between px-1">
                    {showCharCount && (
                        <span
                            className={`text-[10px] ${charCount > 500 ? 'text-red-500' : 'text-gray-400'
                                }`}
                        >
                            {charCount}/500
                        </span>
                    )}
                    <span className="text-[10px] text-gray-300 ml-auto">
                        {totalCount}/400
                    </span>
                </div>
            </div>
        </div>
    );
}
