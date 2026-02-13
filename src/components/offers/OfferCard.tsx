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
      <Card className={`border border-gray-200/60 shadow-card bg-white overflow-hidden rounded-2xl ${isExpired ? 'opacity-50' : ''}`}>
        <CardContent className="p-0">
          {/* Header */}
          <div className="bg-gray-50/80 p-5 border-b border-gray-100/80">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <ProfileAvatar
                  photoURL={offer.fromPhotoURL}
                  displayName={offer.fromDisplayName}
                  size="sm"
                  className="ring-2 ring-violet-100/60 border-2 border-white"
                />
                <div>
                  <h3 className="font-bold text-[17px] text-gray-800">{offer.fromDisplayName}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex items-center text-[12px] text-gray-500 bg-white/80 rounded-full px-2 py-0.5 border border-gray-100/60">
                      <MapPin className="w-3 h-3 mr-1 text-violet-400" />
                      <span>{offer.distanceMeters}m</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-gray-500 text-[13px]">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span className={timeRemaining <= 60 ? 'text-red-500 font-bold' : ''}>
                    {isExpired ? 'Expired' : formatTime(timeRemaining)}
                  </span>
                </div>
                {offer.matchScore > 0 && (
                  <div className="text-[12px] mt-1 text-gray-400">
                    <span>Match:</span>{' '}
                    <span className="font-semibold text-violet-500">{offer.matchScore}%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 text-[13px] font-medium text-gray-600 shadow-sm">
              <Coffee className="w-4 h-4 text-violet-500" />
              <span>{offer.activity}</span>
            </div>

            {offer.explanation && (
              <p className="mt-2.5 text-[13px] text-gray-500 italic leading-relaxed">
                &ldquo;{offer.explanation}&rdquo;
              </p>
            )}
          </div>

          {/* Body */}
          <div className="p-5">
            {/* Interests */}
            {offer.fromInterests.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Interests</p>
                <div className="flex flex-wrap gap-2">
                  {offer.fromInterests.slice(0, 4).map((interest) => (
                    <Badge key={interest} variant="outline" className="text-[13px] text-gray-600 border-gray-200/80">
                      {interest}
                    </Badge>
                  ))}
                  {offer.fromInterests.length > 4 && (
                    <Badge variant="outline" className="text-[13px] text-gray-400 border-dashed">
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
                className="flex-1 h-[52px] border border-gray-200 hover:bg-gray-50 rounded-2xl touch-scale"
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
                className="flex-[2] h-[52px] bg-emerald-500 hover:bg-emerald-600 rounded-2xl shadow-[0_2px_12px_rgba(16,185,129,0.25)] text-[15px] font-semibold touch-scale"
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
