'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Clock, Send, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { OutgoingOffer } from '@/lib/firebase/functions';

interface OutgoingOfferCardProps {
  offer: OutgoingOffer;
  onCancel: (offerId: string) => Promise<void>;
  isCancelling: boolean;
}

export default function OutgoingOfferCard({
  offer,
  onCancel,
  isCancelling,
}: OutgoingOfferCardProps) {
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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <Send className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Offer Sent</h3>
                <p className="text-sm text-gray-600">
                  Waiting for <span className="font-medium">{offer.toDisplayName}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-gray-600">
              <Clock className="w-4 h-4" />
              <span className={`text-sm font-medium ${timeRemaining <= 60 ? 'text-red-500' : ''}`}>
                {isExpired ? 'Expired' : formatTime(timeRemaining)}
              </span>
            </div>
          </div>

          {/* Pulsing indicator */}
          {!isExpired && (
            <div className="flex items-center gap-3 bg-white/60 rounded-lg p-3 mb-4">
              <div className="relative">
                <div className="w-3 h-3 bg-amber-400 rounded-full" />
                <div className="absolute inset-0 w-3 h-3 bg-amber-400 rounded-full animate-ping opacity-75" />
              </div>
              <p className="text-sm text-gray-600">
                Waiting for response...
              </p>
            </div>
          )}

          {isExpired && (
            <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">
              This offer has expired. You can send a new one.
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Activity: <span className="font-medium text-gray-700">{offer.activity}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCancel(offer.offerId)}
              disabled={isCancelling || isExpired}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
