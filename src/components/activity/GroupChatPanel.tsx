'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useGroupChat } from '@/lib/hooks/useGroupChat';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface GroupChatPanelProps {
  groupId: string;
}

export default function GroupChatPanel({ groupId }: GroupChatPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { messages, loading, error, sendMessage, sending } = useGroupChat(groupId);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const body = input.trim();
    setInput('');
    try {
      await sendMessage(body);
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
    <div className="bg-white border border-gray-100 rounded-2xl mt-4 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Group Chat</h3>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="h-[300px] overflow-y-auto px-4 py-3 space-y-2"
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
                  <span className="text-[11px] text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                    {msg.body}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[75%] ${isOwn ? 'order-last' : ''}`}>
                  {!isOwn && (
                    <p className="text-[11px] text-gray-400 mb-0.5 ml-1">
                      {msg.senderDisplayName}
                    </p>
                  )}
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                      isOwn
                        ? 'bg-violet-600 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}
                  >
                    {msg.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-100 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          maxLength={500}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            input.trim() && !sending
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
    </div>
  );
}
