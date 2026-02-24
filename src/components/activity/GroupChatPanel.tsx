'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useGroupChat } from '@/lib/hooks/useGroupChat';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';

// Deterministic pastel color per sender UID for avatar fallback
const AVATAR_COLORS = [
  'bg-violet-200 text-violet-700',
  'bg-amber-200 text-amber-700',
  'bg-cyan-200 text-cyan-700',
  'bg-green-200 text-green-700',
  'bg-rose-200 text-rose-700',
  'bg-blue-200 text-blue-700',
  'bg-orange-200 text-orange-700',
];

function getAvatarColor(uid: string) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (hash * 31 + uid.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// Botanical wallpaper SVG pattern for the chat background
const CHAT_BG_STYLE: React.CSSProperties = {
  backgroundColor: '#F7F5FF',
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <path d="M20 40 Q35 20 50 35 Q35 50 20 40Z" stroke="#7C3AED" stroke-width="0.8" fill="none" opacity="0.13"/>
      <path d="M35 35 Q37 45 35 55" stroke="#7C3AED" stroke-width="0.6" fill="none" opacity="0.1"/>
      <path d="M28 38 Q35 35 38 30" stroke="#7C3AED" stroke-width="0.6" fill="none" opacity="0.1"/>
      <circle cx="120" cy="28" r="4" stroke="#7C3AED" stroke-width="0.8" fill="none" opacity="0.12"/>
      <circle cx="120" cy="28" r="2" stroke="#7C3AED" stroke-width="0.6" fill="none" opacity="0.1"/>
      <path d="M116 24 Q120 18 124 24" stroke="#7C3AED" stroke-width="0.6" fill="none" opacity="0.1"/>
      <path d="M116 32 Q120 38 124 32" stroke="#7C3AED" stroke-width="0.6" fill="none" opacity="0.1"/>
      <circle cx="162" cy="58" r="1.5" fill="#7C3AED" opacity="0.1"/>
      <circle cx="167" cy="52" r="1" fill="#7C3AED" opacity="0.08"/>
      <circle cx="157" cy="55" r="1.2" fill="#7C3AED" opacity="0.09"/>
      <circle cx="164" cy="64" r="1" fill="#7C3AED" opacity="0.07"/>
      <path d="M90 115 Q90 75 90 75" stroke="#7C3AED" stroke-width="0.7" fill="none" opacity="0.1"/>
      <path d="M90 95 Q75 85 78 72" stroke="#7C3AED" stroke-width="0.7" fill="none" opacity="0.1"/>
      <path d="M90 105 Q105 95 102 82" stroke="#7C3AED" stroke-width="0.7" fill="none" opacity="0.1"/>
      <path d="M78 72 Q82 64 90 75" stroke="#7C3AED" stroke-width="0.7" fill="none" opacity="0.1"/>
      <path d="M102 82 Q106 74 90 75" stroke="#7C3AED" stroke-width="0.7" fill="none" opacity="0.1"/>
      <circle cx="160" cy="148" r="6" stroke="#7C3AED" stroke-width="0.7" fill="none" opacity="0.1"/>
      <circle cx="160" cy="148" r="3.5" stroke="#7C3AED" stroke-width="0.6" fill="none" opacity="0.09"/>
      <circle cx="160" cy="148" r="1.5" fill="#7C3AED" opacity="0.08"/>
      <path d="M30 162 Q45 142 60 162 Q45 178 30 162Z" stroke="#7C3AED" stroke-width="0.8" fill="none" opacity="0.11"/>
      <path d="M45 162 Q47 172 45 182" stroke="#7C3AED" stroke-width="0.6" fill="none" opacity="0.09"/>
      <circle cx="130" cy="170" r="1.5" fill="#7C3AED" opacity="0.08"/>
      <circle cx="124" cy="176" r="1" fill="#7C3AED" opacity="0.07"/>
      <circle cx="136" cy="177" r="1.2" fill="#7C3AED" opacity="0.08"/>
      <path d="M170 120 Q178 110 186 120 Q178 130 170 120Z" stroke="#7C3AED" stroke-width="0.7" fill="none" opacity="0.1"/>
      <path d="M14 110 Q14 100 14 90" stroke="#7C3AED" stroke-width="0.6" fill="none" opacity="0.08"/>
      <path d="M14 100 Q8 94 10 87" stroke="#7C3AED" stroke-width="0.6" fill="none" opacity="0.08"/>
    </svg>`
  )}")`,
  backgroundRepeat: 'repeat',
};

interface GroupChatPanelProps {
  groupId: string;
  fullScreen?: boolean;
  onRemoved?: () => void;
  readOnly?: boolean;
  readOnlyStatus?: 'kicked' | 'left' | null;
}

export default function GroupChatPanel({ groupId, fullScreen = false, onRemoved, readOnly = false, readOnlyStatus }: GroupChatPanelProps) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const { messages, loading, error, removed, sendMessage, sending } = useGroupChat(groupId, readOnly);
  const removedNotifiedRef = useRef(false);
  const [input, setInput] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasAtBottomRef = useRef(true);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Keep scroll pinned to bottom when container resizes (keyboard)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkAtBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    };

    container.addEventListener('scroll', checkAtBottom, { passive: true });

    const observer = new ResizeObserver(() => {
      if (wasAtBottomRef.current) {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
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

  useEffect(() => {
    if (removed && !removedNotifiedRef.current) {
      removedNotifiedRef.current = true;
      onRemoved?.();
    }
  }, [removed, onRemoved]);

  const handleInputFocus = () => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const body = input.trim();
    setInput('');

    try {
      await sendMessage(body);
      // Re-focus input to keep keyboard open if desired
      if (fullScreen) {
        inputRef.current?.focus();
      }
    } catch (err) {
      setInput(body); // Restore input on failure
      toast({
        title: 'Failed to send message',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={
        fullScreen
          ? 'flex flex-col h-full'
          : 'bg-white border border-gray-100 rounded-2xl mt-4 overflow-hidden'
      }
    >
      {!fullScreen && (
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Group Chat</h3>
        </div>
      )}

      {/* Messages */}
      <div
        ref={containerRef}
        className={
          fullScreen
            ? 'flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0'
            : 'h-[300px] overflow-y-auto px-3 py-3 space-y-2'
        }
        style={{ ...CHAT_BG_STYLE, overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <p className="text-red-500 text-sm text-center py-4">{error}</p>
        ) : messages.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            No messages yet. Say hello!
          </p>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.senderUid === user?.uid;
            const isSystem = msg.type === 'system';

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center py-1">
                  <span className="text-[11px] text-gray-500 bg-white/70 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">
                    {msg.body}
                  </span>
                </div>
              );
            }

            if (isOwn) {
              // Own message: [spacer] [bubble+time] [avatar]
              return (
                <div key={msg.id} className="flex items-end gap-1.5">
                  <div className="flex-1" />
                  <div className="flex flex-col items-end max-w-[72%]">
                    <div className="px-3 py-2 bg-violet-600 text-white text-sm leading-relaxed rounded-2xl rounded-br-md shadow-sm">
                      {msg.body}
                    </div>
                    {msg.createdAt && (
                      <span className="text-[10px] text-gray-400 mt-0.5 mr-0.5">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  {/* Current user avatar — prefer Firestore profile photo over Auth photo */}
                  <ProfileAvatar
                    photoURL={userProfile?.photoURL || user?.photoURL || null}
                    displayName={userProfile?.displayName || user?.displayName || 'Me'}
                    size="xs"
                    className="w-7 h-7 flex-shrink-0 mb-4"
                  />
                </div>
              );
            }

            // Other user's message: [avatar] [name+bubble+time]
            const avatarColor = getAvatarColor(msg.senderUid);
            const initials = getInitials(msg.senderDisplayName);
            return (
              <div key={msg.id} className="flex items-end gap-1.5">
                {msg.senderPhotoURL ? (
                  <ProfileAvatar
                    photoURL={msg.senderPhotoURL}
                    displayName={msg.senderDisplayName}
                    size="xs"
                    className="w-7 h-7 flex-shrink-0 mb-4"
                  />
                ) : (
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mb-4 ${avatarColor}`}>
                    <span className="text-[10px] font-semibold">{initials}</span>
                  </div>
                )}
                <div className="flex flex-col items-start max-w-[72%]">
                  <p className="text-[11px] text-gray-500 mb-0.5 ml-1">{msg.senderDisplayName}</p>
                  <div className="px-3 py-2 bg-white text-gray-800 text-sm leading-relaxed rounded-2xl rounded-bl-md shadow-sm">
                    {msg.body}
                  </div>
                  {msg.createdAt && (
                    <span className="text-[10px] text-gray-400 mt-0.5 ml-1">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
        {(removed || readOnlyStatus === 'kicked') && (
          <div className="flex justify-center py-4">
            <span className="text-[12px] text-red-500 bg-red-50 border border-red-100 px-4 py-2 rounded-full shadow-sm">
              You have been removed from this activity
            </span>
          </div>
        )}
        {readOnlyStatus === 'left' && !removed && (
          <div className="flex justify-center py-4">
            <span className="text-[12px] text-gray-500 bg-gray-50 border border-gray-200 px-4 py-2 rounded-full shadow-sm">
              You left this activity
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {removed || readOnly ? (
        <div className="px-3 py-3 border-t border-gray-100 flex-shrink-0 bg-gray-50">
          <p className="text-center text-sm text-gray-400">You can no longer send messages</p>
        </div>
      ) : (
        <div
          className="px-3 py-3 border-t border-gray-100 flex gap-2 flex-shrink-0 bg-white"
          style={{
            paddingBottom: fullScreen ? 'var(--safe-bottom, env(safe-area-inset-bottom, 0px))' : '12px',
            transition: 'padding-bottom 200ms ease-out',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 max-h-20 overflow-y-auto bg-white"
            style={{ minHeight: '40px' }}
          />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 ${input.trim() && !sending
              ? 'bg-violet-600 text-white hover:bg-violet-700'
              : 'bg-gray-100 text-gray-400'
              }`}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
