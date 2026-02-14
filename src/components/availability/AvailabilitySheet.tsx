'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Clock, Coffee, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

import { usePresence } from '@/lib/hooks/usePresence';
import { checkAvailabilityForUser } from '@/lib/firebase/functions';
import { ACTIVITIES } from '@/lib/schemas/user';

const DURATIONS = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1.5 hours' },
  { value: '120', label: '2 hours' },
];

export default function AvailabilitySheet({ isPWA = false }: { isPWA?: boolean }) {
  const {
    presence,
    isAvailable,
    timeRemaining,
    startPresence,
    endPresence,
    error,
  } = usePresence();

  const [isOpen, setIsOpen] = useState(false);
  const [activity, setActivity] = useState<string>('');
  const [duration, setDuration] = useState<string>('60');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // No places dialog state
  const [showNoPlacesDialog, setShowNoPlacesDialog] = useState(false);
  const [noPlacesMessage, setNoPlacesMessage] = useState('');

  const handleSetAvailability = async () => {
    if (!activity) return;

    setIsSubmitting(true);
    setLocationError(null);

    if (!window.isSecureContext) {
      setLocationError(
        'Location access requires a secure connection (HTTPS). Please try using localhost or set up HTTPS.'
      );
      setIsSubmitting(false);
      return;
    }

    try {
      // Request geolocation
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        }
      );

      const { latitude, longitude } = position.coords;

      // PRD v2.4: Check availability before starting
      // This "gates" the search if no spots are nearby
      const availability = await checkAvailabilityForUser({
        activityType: activity,
        lat: latitude,
        lng: longitude
      });

      console.log('Availability check response:', availability);

      if (!availability?.data || !availability.data.ok || !availability.data.available) {
        setNoPlacesMessage(availability?.data?.message || `No meetup spots found for ${activity}.`);
        setShowNoPlacesDialog(true);
        setIsSubmitting(false);
        return;
      }

      await startPresence(activity, parseInt(duration), latitude, longitude);
      setIsOpen(false);
      setActivity('');
    } catch (err) {
      if (err instanceof GeolocationPositionError) {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setLocationError('Location access denied. Please enable location.');
            break;
          case err.POSITION_UNAVAILABLE:
            setLocationError('Location unavailable. Try again.');
            break;
          case err.TIMEOUT:
            setLocationError('Location request timed out. Try again.');
            break;
        }
      } else {
        // U21 Fix: Handle email verification error
        const errorMessage = err instanceof Error ? err.message : 'Failed to set availability';
        if (errorMessage === 'EMAIL_NOT_VERIFIED') {
          setLocationError('Please verify your email address to use this feature. Check your inbox for the verification link.');
        } else {
          setLocationError(errorMessage);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndAvailability = async () => {
    setIsSubmitting(true);
    try {
      await endPresence();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAvailable && presence) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={`bg-emerald-50/20 rounded-2xl px-4 border border-emerald-100/60 shadow-card border-l-[3px] border-l-emerald-400 ${isPWA ? 'py-3.5' : 'py-3'}`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="font-semibold text-gray-800 text-[14px]">You&apos;re Available</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEndAvailability}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 touch-scale h-9 w-9 p-0 rounded-full"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-3.5 text-[13px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <Coffee className="h-3.5 w-3.5 text-emerald-500" />
            <span>{presence.activity}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            <span>{timeRemaining}m left</span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          size="lg"
          className={`w-full bg-violet-600 hover:bg-violet-700 text-[15px] font-semibold rounded-2xl touch-scale shadow-[0_2px_12px_rgba(124,58,237,0.25)] ${isPWA ? 'h-[48px]' : 'h-[44px]'}`}
        >
          <MapPin className="mr-2 h-5 w-5" />
          Set Availability
        </Button>
      </SheetTrigger>

      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="text-left">
          <SheetTitle>Set Your Availability</SheetTitle>
          <SheetDescription>
            Let nearby NYU students know you&apos;re free to meet up
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Activity Selection */}
          <div className="space-y-3">
            <Label>What do you want to do?</Label>
            <div className="flex flex-wrap gap-2">
              {ACTIVITIES.map((act) => (
                <Badge
                  key={act}
                  variant={activity === act ? 'default' : 'outline'}
                  className={`cursor-pointer text-[15px] px-4 py-2 rounded-full transition-all touch-scale ${activity === act
                    ? 'bg-violet-600 hover:bg-violet-700 text-white'
                    : 'hover:bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  onClick={() => setActivity(act)}
                >
                  {act}
                </Badge>
              ))}
            </div>
          </div>

          {/* Duration Selection */}
          <div className="space-y-3">
            <Label>How long are you available?</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location Info */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500">
            <div className="flex items-start space-x-2">
              <MapPin className="h-4 w-4 mt-0.5" />
              <span>
                We&apos;ll use your current location to find nearby buddies.
                Your exact location is never shared.
              </span>
            </div>
          </div>

          {/* Errors */}
          {(error || locationError) && (
            <div className="text-sm text-red-500">{error || locationError}</div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleSetAvailability}
            disabled={!activity || isSubmitting}
            className="w-full bg-violet-600 hover:bg-violet-700 h-12 rounded-xl font-semibold touch-scale"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "I'm Available"
            )}
          </Button>
        </div>
      </SheetContent>

      {/* No Places Available Dialog */}
      <Dialog open={showNoPlacesDialog} onOpenChange={setShowNoPlacesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-orange-600 flex items-center gap-2">
              <Coffee className="w-5 h-5" />
              No Spots Nearby
            </DialogTitle>
            <DialogDescription>
              {noPlacesMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm text-gray-500">
            Calculated for your current location (5km radius).
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowNoPlacesDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowNoPlacesDialog(false)}>
              Change Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}