'use client';

import { motion } from 'framer-motion';
import { MapPin, Check, Loader2, DollarSign, Wifi, Zap, Volume2, Search, Clock } from 'lucide-react';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlaceCandidate } from '@/lib/firebase/functions';

const DEFAULT_PLACE_IMAGE = 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=200&fit=crop&auto=format';
const isCustomPlace = (rank: number) => rank < 0;

function isOpenNow(openingHours: PlaceCandidate['openingHours']): boolean {
    if (!openingHours || !openingHours.periods || openingHours.periods.length === 0) return true;
    const now = new Date();
    const dayStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
    const timeStr = now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit',
    });
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentDay = dayMap[dayStr] ?? 0;
    const [rawH, rawM] = timeStr.split(':').map(Number);
    const currentTime = (rawH >= 24 ? 0 : rawH) * 100 + rawM;
    for (const period of openingHours.periods) {
        const { open, close } = period;
        if (open && open.day === 0 && open.time === '0000' && !close) return true;
        if (!open || !close) continue;
        const openDay = open.day, closeDay = close.day;
        const openTime = parseInt(open.time, 10), closeTime = parseInt(close.time, 10);
        if (openDay === closeDay) {
            if (currentDay === openDay && currentTime >= openTime && currentTime < closeTime) return true;
        } else {
            if (currentDay === openDay  && currentTime >= openTime)  return true;
            if (currentDay === closeDay && currentTime <  closeTime) return true;
        }
    }
    return false;
}

interface PlaceCardProps {
    place: PlaceCandidate & {
        photoUrl?: string;
        priceLevel?: number; // 1-4 ($, $$, $$$, $$$$) - legacy
        priceRange?: string; // U11: e.g., "$20-$50" - preferred
        tags?: string[];
    };
    isSelected: boolean;
    isOtherChoice: boolean;
    isLoading: boolean;
    onSelect: () => void;
    compact?: boolean;
}

function getTagIcon(tag: string) {
    const lowerTag = tag.toLowerCase();
    if (lowerTag.includes('wifi')) return <Wifi className="w-3 h-3" />;
    if (lowerTag.includes('outlet') || lowerTag.includes('power')) return <Zap className="w-3 h-3" />;
    if (lowerTag.includes('quiet')) return <Volume2 className="w-3 h-3" />;
    return null;
}

export function PlaceCard({
    place,
    isSelected,
    isOtherChoice,
    isLoading,
    onSelect,
    compact = false,
}: PlaceCardProps) {
    // Prefer admin-set priceRange text (e.g. "$20-$50"), then fall back to $ symbols from priceLevel
    const priceLevelSymbols: Record<number, string> = { 0: 'Free', 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };
    const priceDisplay = place.priceRange ||
        (place.priceLevel != null ? priceLevelSymbols[place.priceLevel] ?? '' : '');
    const tags = place.tags || ['WiFi', 'Outlets'];
    const photoUrl = place.photoUrl || DEFAULT_PLACE_IMAGE;

    const custom = isCustomPlace(place.rank);
    // Only show "Closed now" when we have opening hours data and the place is currently closed.
    // Places without hours data default to open — no false warnings.
    const isClosed = place.openingHours != null && !isOpenNow(place.openingHours);

    // Compact mode for side-by-side grid
    if (compact) {
        return (
            <div
                className={`rounded-xl border-2 p-3 transition-all ${isSelected
                    ? 'border-green-500 bg-green-50'
                    : isOtherChoice
                        ? 'border-orange-300 bg-orange-50'
                        : 'border-gray-200 bg-white'
                    }`}
            >
                <div className="flex items-start gap-2">
                    <Badge className={`border-0 text-[10px] shrink-0 ${custom ? 'bg-violet-600 text-white' : 'bg-black/70 text-white'}`}>
                        {custom ? <><Search className="w-2.5 h-2.5 mr-0.5 inline" />Custom</> : `#${place.rank}`}
                    </Badge>
                    <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 text-xs leading-tight truncate">
                            {place.name}
                        </h3>
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">
                            <MapPin className="w-2.5 h-2.5 inline mr-0.5" />
                            {place.distance}m
                        </p>
                        {isClosed && (
                            <p className="text-[10px] text-red-500 font-medium mt-0.5 flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5 inline" /> Closed now
                            </p>
                        )}
                    </div>
                </div>
                {isSelected && (
                    <div className="mt-2 flex items-center gap-1 text-green-600">
                        <Check className="w-3 h-3" />
                        <span className="text-[10px] font-medium">Selected</span>
                    </div>
                )}
                {isOtherChoice && !isSelected && (
                    <Button
                        onClick={onSelect}
                        disabled={isLoading}
                        size="sm"
                        className="w-full mt-1.5 h-6 text-[9px] bg-orange-500 hover:bg-orange-600 py-0"
                    >
                        {isLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : 'Go with this'}
                    </Button>
                )}
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`rounded-xl overflow-hidden shadow-lg border-2 transition-all ${isSelected
                ? 'border-green-500 bg-green-50'
                : isOtherChoice
                    ? 'border-orange-300 bg-orange-50'
                    : 'border-gray-200 bg-white'
                }`}
        >
            {/* Photo Section */}
            <div className="relative h-36 w-full bg-gray-100">
                <Image
                    src={photoUrl}
                    alt={place.name}
                    fill
                    className="object-cover"
                    unoptimized
                />
                {/* Rank badge */}
                <div className="absolute top-2 left-2">
                    <Badge className={`border-0 text-xs ${custom ? 'bg-violet-600 text-white' : 'bg-black/70 text-white'}`}>
                        {custom ? 'Custom' : `#${place.rank}`}
                    </Badge>
                </div>
                {/* Distance badge */}
                <div className="absolute top-2 right-2">
                    <Badge className="bg-white/90 text-gray-700 border-0 text-xs">
                        <MapPin className="w-3 h-3 mr-1" />
                        {place.distance}m
                    </Badge>
                </div>
                {/* Closed now badge */}
                {isClosed && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2">
                        <Badge className="bg-red-500/90 text-white border-0 text-xs flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Closed now
                        </Badge>
                    </div>
                )}
                {/* Selected/Other choice indicator */}
                {isSelected && (
                    <div className="absolute bottom-2 right-2">
                        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                            <Check className="w-5 h-5 text-white" />
                        </div>
                    </div>
                )}
                {isOtherChoice && !isSelected && (
                    <div className="absolute bottom-2 left-2">
                        <Badge className="bg-orange-500 text-white border-0 text-xs">
                            Their pick
                        </Badge>
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="p-4 space-y-3">
                {/* Name and Price */}
                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 text-lg truncate">
                            {place.name}
                        </h3>
                        <p className="text-sm text-gray-500 truncate">{place.address}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                        {/* Show bare icon only when no price data at all */}
                        {!priceDisplay && <DollarSign className="w-4 h-4 text-green-600" />}
                        {priceDisplay && (
                            <span className="text-sm font-medium text-green-700">
                                {priceDisplay}
                            </span>
                        )}
                    </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                    {tags.slice(0, 4).map((tag) => (
                        <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs bg-gray-100 text-gray-600 border-0 flex items-center gap-1"
                        >
                            {getTagIcon(tag)}
                            {tag}
                        </Badge>
                    ))}
                </div>

                {/* Select Button */}
                <Button
                    onClick={onSelect}
                    disabled={isLoading}
                    className={`w-full ${isSelected
                        ? 'bg-violet-600 hover:bg-violet-700'
                        : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700'
                        }`}
                >
                    {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isSelected ? (
                        <>
                            <Check className="w-4 h-4 mr-1" />
                            Selected
                        </>
                    ) : (
                        'Select This Spot'
                    )}
                </Button>
            </div>
        </motion.div>
    );
}
