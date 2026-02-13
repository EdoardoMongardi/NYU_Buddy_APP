'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { Loader2, Check, X } from 'lucide-react';
import { matchConfirmMeeting } from '@/lib/firebase/functions';
import { useToast } from '@/hooks/use-toast';

interface DidYouMeetDialogProps {
  open: boolean;
  matchId: string;
  otherUserName: string;
  otherUserPhotoURL: string | null;
  activity: string;
  onComplete: () => void;
}

export function DidYouMeetDialog({
  open,
  matchId,
  otherUserName,
  otherUserPhotoURL,
  activity,
  onComplete,
}: DidYouMeetDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleResponse = async (response: 'met' | 'not_met' | 'dismissed') => {
    setIsSubmitting(true);
    try {
      await matchConfirmMeeting({ matchId, response });

      if (response !== 'dismissed') {
        toast({
          title: 'Thanks for confirming!',
          description: response === 'met'
            ? 'Glad you met up!'
            : 'Thanks for letting us know.',
        });
      }

      onComplete();
    } catch (err) {
      console.error('Failed to submit confirmation:', err);
      toast({
        title: 'Error',
        description: 'Failed to submit. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSubmitting) {
          handleResponse('dismissed');
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">Did you meet up?</DialogTitle>
          <DialogDescription className="text-center">
            Your match time has expired. Let us know if you met.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4 space-y-4">
          <ProfileAvatar
            photoURL={otherUserPhotoURL}
            displayName={otherUserName}
            size="lg"
          />
          <div className="text-center">
            <p className="font-medium text-gray-900">{otherUserName}</p>
            {activity && (
              <p className="text-sm text-gray-500">{activity}</p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Button
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
            onClick={() => handleResponse('met')}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Yes, we met!
              </>
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleResponse('not_met')}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <X className="mr-2 h-4 w-4" />
                No, we didn&apos;t meet
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
