'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
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
    <div className="divide-y divide-gray-50">
      {requests.map((req) => (
        <div key={req.requestId} className="py-3 px-3">
          {/* Top row: avatar + name */}
          <div className="flex items-center gap-2.5 mb-1.5">
            <ProfileAvatar
              photoURL={req.requesterPhotoURL}
              displayName={req.requesterDisplayName}
              size="xs"
              className="w-8 h-8 flex-shrink-0"
            />
            <p className="text-sm font-semibold text-gray-900 truncate flex-1">
              {req.requesterDisplayName}
            </p>
          </div>

          {/* Message */}
          {req.message && (
            <p className="text-[13px] text-gray-500 leading-relaxed mb-2.5 pl-10 line-clamp-2">
              &ldquo;{req.message}&rdquo;
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pl-10">
            {respondingTo === req.requesterUid ? (
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            ) : (
              <>
                <button
                  onClick={() => handleRespond(req.requesterUid, 'decline')}
                  className="flex-1 py-1.5 text-[13px] font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors border border-red-100"
                >
                  Decline
                </button>
                <button
                  onClick={() => handleRespond(req.requesterUid, 'accept')}
                  className="flex-1 py-1.5 text-[13px] font-medium text-white bg-violet-600 rounded-xl hover:bg-violet-700 transition-colors shadow-sm"
                >
                  Accept
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
