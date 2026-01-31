'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { Inbox, RefreshCw, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import OfferCard from '@/components/offers/OfferCard';
import { InboxOffer } from '@/lib/firebase/functions';

interface InvitesTabProps {
  offers: InboxOffer[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onAccept: (offerId: string) => Promise<{ matchCreated: boolean; matchId?: string }>;
  onDecline: (offerId: string) => Promise<void>;
  isAvailable: boolean;
  userPhotoURL?: string | null;
  userDisplayName?: string;
}

export default function InvitesTab({
  offers,
  loading,
  error,
  onRefresh,
  onAccept,
  onDecline,
  isAvailable,
  userPhotoURL,
  userDisplayName,
}: InvitesTabProps) {
  const router = useRouter();
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);

  const handleAccept = async (offerId: string) => {
    setRespondingOfferId(offerId);
    try {
      const result = await onAccept(offerId);
      if (result.matchCreated && result.matchId) {
        router.push(`/match/${result.matchId}`);
      }
    } finally {
      setRespondingOfferId(null);
    }
  };

  const handleDecline = async (offerId: string) => {
    setRespondingOfferId(offerId);
    try {
      await onDecline(offerId);
    } finally {
      setRespondingOfferId(null);
    }
  };

  // Not available state
  if (!isAvailable) {
    return (
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardContent className="pt-6 text-center py-12">
          <div className="mx-auto mb-4 flex justify-center">
            <ProfileAvatar
              photoURL={userPhotoURL}
              displayName={userDisplayName}
              size="lg"
            />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Set your availability
          </h3>
          <p className="text-gray-500">
            You need to be available to receive invites from others
          </p>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (loading && offers.length === 0) {
    return (
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardContent className="pt-6 text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-violet-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading invites...</p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardContent className="pt-6 text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <Button onClick={onRefresh} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (offers.length === 0) {
    return (
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardContent className="pt-6 text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-violet-100 flex items-center justify-center">
            <Inbox className="w-8 h-8 text-violet-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No invites yet
          </h3>
          <p className="text-gray-500 mb-4">
            When someone wants to meet you, their invite will appear here
          </p>
          <Button onClick={onRefresh} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Offers list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-600">
          {offers.length} invite{offers.length !== 1 ? 's' : ''} waiting
        </p>
        <Button
          onClick={onRefresh}
          variant="ghost"
          size="sm"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <AnimatePresence mode="popLayout">
        {offers.map((offer) => (
          <OfferCard
            key={offer.offerId}
            offer={offer}
            onAccept={handleAccept}
            onDecline={handleDecline}
            isResponding={respondingOfferId === offer.offerId}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
