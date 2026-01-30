'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Check, MapPin, Clock, Coffee, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { InboxOffer } from '@/lib/firebase/functions';

interface OfferCardProps {
  offer: InboxOffer;
  onAccept: (offerId: string) => Promise<void>;
  onDecline: (offerId: string) => Promise<void>;
  isResponding: boolean;
}

export default function OfferCard({
  offer,
  onAccept,
  onDecline,
  isResponding,
}: OfferCardProps) {
  const [timeRemaining, setTimeRemaining] = useState(offer.expiresInSeconds);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isExpired = timeRemaining <= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
    >
      <Card className={`border-0 shadow-lg bg-white overflow-hidden ${isExpired ? 'opacity-50' : ''}`}>
        <CardContent className="p-0">
          {/* Header */}
          <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-4 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <ProfileAvatar
                  photoURL={offer.fromPhotoURL}
                  displayName={offer.fromDisplayName}
                  size="sm"
                />
                <div>
                  <h3 className="font-bold text-lg">{offer.fromDisplayName}</h3>
                  <div className="flex items-center gap-1 text-white/80 text-sm">
                    <MapPin className="w-3 h-3" />
                    <span>{offer.distanceMeters}m away</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-white/80 text-sm">
                  <Clock className="w-3 h-3" />
                  <span className={timeRemaining <= 60 ? 'text-red-200 font-bold' : ''}>
                    {isExpired ? 'Expired' : formatTime(timeRemaining)}
                  </span>
                </div>
                {offer.matchScore > 0 && (
                  <div className="text-sm mt-1">
                    <span className="text-white/60">Match:</span>{' '}
                    <span className="font-bold">{offer.matchScore}%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2">
              <Coffee className="w-4 h-4" />
              <span>{offer.activity}</span>
            </div>

            {offer.explanation && (
              <p className="mt-2 text-sm text-white/80 italic">
                {offer.explanation}
              </p>
            )}
          </div>

          {/* Body */}
          <div className="p-4">
            {/* Interests */}
            {offer.fromInterests.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-500 mb-2">Interests:</p>
                <div className="flex flex-wrap gap-2">
                  {offer.fromInterests.slice(0, 4).map((interest) => (
                    <Badge key={interest} variant="outline" className="text-xs">
                      {interest}
                    </Badge>
                  ))}
                  {offer.fromInterests.length > 4 && (
                    <Badge variant="outline" className="text-xs">
                      +{offer.fromInterests.length - 4}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1 h-12 border-2 border-gray-200 hover:border-red-300 hover:bg-red-50"
                onClick={() => onDecline(offer.offerId)}
                disabled={isResponding || isExpired}
              >
                {isResponding ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <X className="h-5 w-5 text-gray-400" />
                )}
              </Button>
              <Button
                size="lg"
                className="flex-1 h-12 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                onClick={() => onAccept(offer.offerId)}
                disabled={isResponding || isExpired}
              >
                {isResponding ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Accept
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
