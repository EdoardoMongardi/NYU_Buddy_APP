'use client';

import { useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { joinRequestSend } from '@/lib/firebase/functions';
import { useToast } from '@/hooks/use-toast';

interface JoinRequestButtonProps {
  postId: string;
  postStatus: string;
  myJoinRequest: {
    requestId: string;
    status: string;
    message: string | null;
    createdAt: string | null;
  } | null;
  onRefresh: () => Promise<void>;
}

export default function JoinRequestButton({
  postId,
  postStatus,
  myJoinRequest,
  onRefresh,
}: JoinRequestButtonProps) {
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [optimisticSent, setOptimisticSent] = useState(false);

  const isOpen = postStatus === 'open';
  const isPending = myJoinRequest?.status === 'pending' || optimisticSent;
  const isAccepted = myJoinRequest?.status === 'accepted';
  const isDeclined = myJoinRequest?.status === 'declined';
  const isKicked = myJoinRequest?.status === 'kicked';
  const isLeft = myJoinRequest?.status === 'left';

  const handleSend = async () => {
    setSubmitting(true);
    try {
      await joinRequestSend({
        postId,
        message: message.trim() || null,
      });
      setOptimisticSent(true);
      setShowInput(false);
      setMessage('');
      toast({ title: 'Request sent!', description: 'The creator will review your request.' });
      await onRefresh();
    } catch (err) {
      toast({
        title: 'Failed to send request',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Already accepted — active member
  if (isAccepted) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center mb-4">
        <Check className="w-5 h-5 text-green-600 mx-auto mb-1" />
        <p className="text-green-700 text-sm font-medium">You&apos;re in this activity!</p>
      </div>
    );
  }

  // Declined — denied by owner
  if (isDeclined) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center mb-4">
        <X className="w-5 h-5 text-gray-400 mx-auto mb-1" />
        <p className="text-gray-500 text-sm">You have been denied to join this activity</p>
      </div>
    );
  }

  // Pending (from server OR optimistic) — green "Request sent", no further interaction
  if (isPending) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center mb-4">
        <Check className="w-5 h-5 text-green-600 mx-auto mb-1" />
        <p className="text-green-700 text-sm font-medium">Request sent</p>
      </div>
    );
  }

  // Post not open — show before kicked/left/withdrawn to avoid showing form for closed posts
  if (!isOpen && !isKicked && !isLeft) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center mb-4">
        <p className="text-gray-500 text-sm">This activity is no longer accepting requests</p>
      </div>
    );
  }

  // Kicked / Left / Withdrawn — show "Request to Join" if post is open, or disabled message
  if ((isKicked || isLeft || myJoinRequest?.status === 'withdrawn') && !showInput) {
    if (!isOpen) {
      return (
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center mb-4">
          <p className="text-gray-500 text-sm">This activity is no longer accepting requests</p>
        </div>
      );
    }
    return (
      <div className="mb-4">
        <button
          onClick={() => setShowInput(true)}
          disabled={submitting}
          className="w-full py-3.5 rounded-xl text-[15px] font-semibold bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98] shadow-sm transition-all disabled:opacity-50"
        >
          Request to Join
        </button>
      </div>
    );
  }

  // Show request form
  if (showInput) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 space-y-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a message (optional, max 80 chars)..."
          rows={2}
          maxLength={80}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setShowInput(false)}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              'Send Request'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Default: show join button (no prior request, post is open)
  return (
    <div className="mb-4">
      <button
        onClick={() => setShowInput(true)}
        disabled={submitting}
        className="w-full py-3.5 rounded-xl text-[15px] font-semibold bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98] shadow-sm transition-all disabled:opacity-50"
      >
        Request to Join
      </button>
    </div>
  );
}
