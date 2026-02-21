'use client';

import { useState } from 'react';
import { Loader2, Check, X, Clock } from 'lucide-react';
import { joinRequestSend, joinRequestWithdraw } from '@/lib/firebase/functions';
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

  const isOpen = postStatus === 'open';
  const isPending = myJoinRequest?.status === 'pending';
  const isAccepted = myJoinRequest?.status === 'accepted';
  const isDeclined = myJoinRequest?.status === 'declined';

  const handleSend = async () => {
    setSubmitting(true);
    try {
      await joinRequestSend({
        postId,
        message: message.trim() || null,
      });
      toast({ title: 'Request sent!', description: 'The creator will review your request.' });
      setShowInput(false);
      setMessage('');
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

  const handleWithdraw = async () => {
    setSubmitting(true);
    try {
      await joinRequestWithdraw({ postId });
      toast({ title: 'Request withdrawn' });
      await onRefresh();
    } catch (err) {
      toast({
        title: 'Failed to withdraw',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Already accepted
  if (isAccepted) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center mb-4">
        <Check className="w-5 h-5 text-green-600 mx-auto mb-1" />
        <p className="text-green-700 text-sm font-medium">You&apos;re in this activity!</p>
      </div>
    );
  }

  // Declined
  if (isDeclined) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center mb-4">
        <X className="w-5 h-5 text-gray-400 mx-auto mb-1" />
        <p className="text-gray-500 text-sm">Your request was not accepted</p>
      </div>
    );
  }

  // Pending — show status + withdraw option
  if (isPending) {
    return (
      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 justify-center mb-2">
          <Clock className="w-4 h-4 text-violet-500" />
          <p className="text-violet-700 text-sm font-medium">Request pending</p>
        </div>
        <button
          onClick={handleWithdraw}
          disabled={submitting}
          className="w-full py-2 text-sm text-violet-600 hover:text-violet-700 font-medium"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          ) : (
            'Withdraw Request'
          )}
        </button>
      </div>
    );
  }

  // Post not open
  if (!isOpen) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center mb-4">
        <p className="text-gray-500 text-sm">This activity is no longer accepting requests</p>
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
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
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

  // Default: show join button
  return (
    <div className="mb-4">
      <button
        onClick={() => setShowInput(true)}
        className="w-full py-3.5 rounded-xl text-[15px] font-semibold bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98] shadow-sm transition-all"
      >
        Request to Join
      </button>
    </div>
  );
}
