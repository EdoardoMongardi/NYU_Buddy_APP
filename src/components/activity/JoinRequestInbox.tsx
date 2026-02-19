'use client';

import { useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { joinRequestRespond, JoinRequestInfo } from '@/lib/firebase/functions';
import { useToast } from '@/hooks/use-toast';

interface JoinRequestInboxProps {
  postId: string;
  requests: JoinRequestInfo[];
  onRefresh: () => Promise<void>;
}

export default function JoinRequestInbox({
  postId,
  requests,
  onRefresh,
}: JoinRequestInboxProps) {
  const { toast } = useToast();
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const handleRespond = async (requesterUid: string, action: 'accept' | 'decline') => {
    setRespondingTo(requesterUid);
    try {
      await joinRequestRespond({ postId, requesterUid, action });
      toast({
        title: action === 'accept' ? 'Request accepted!' : 'Request declined',
        description: action === 'accept'
          ? 'They have been added to your group.'
          : 'The requester has been notified.',
      });
      await onRefresh();
    } catch (err) {
      toast({
        title: `Failed to ${action}`,
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRespondingTo(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Join Requests ({requests.length})
      </h3>
      <div className="space-y-3">
        {requests.map((req) => (
          <div key={req.requestId} className="flex items-start gap-3">
            <ProfileAvatar
              photoURL={req.requesterPhotoURL}
              displayName={req.requesterDisplayName}
              size="xs"
              className="w-9 h-9 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {req.requesterDisplayName}
              </p>
              {req.message && (
                <p className="text-[13px] text-gray-500 mt-0.5 line-clamp-2">
                  &ldquo;{req.message}&rdquo;
                </p>
              )}
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              {respondingTo === req.requesterUid ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              ) : (
                <>
                  <button
                    onClick={() => handleRespond(req.requesterUid, 'accept')}
                    className="w-8 h-8 rounded-full bg-green-100 hover:bg-green-200 flex items-center justify-center transition-colors"
                  >
                    <Check className="w-4 h-4 text-green-600" />
                  </button>
                  <button
                    onClick={() => handleRespond(req.requesterUid, 'decline')}
                    className="w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4 text-red-600" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
