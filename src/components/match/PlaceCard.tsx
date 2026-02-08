'use client';

import { motion } from 'framer-motion';
import { MapPin, Check, Loader2, DollarSign, Wifi, Zap, Volume2 } from 'lucide-react';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlaceCandidate } from '@/lib/firebase/functions';

// Default placeholder image for locations
const DEFAULT_PLACE_IMAGE = 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=200&fit=crop&auto=format';

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
}

function getPriceIndicator(level: number): string {
    return '$'.repeat(Math.min(Math.max(level, 1), 4));
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
}: PlaceCardProps) {
    // U11: Prefer priceRange text over priceLevel number. If no priceRange, show just icon (no text)
    const priceDisplay = place.priceRange || '';
    const tags = place.tags || ['WiFi', 'Outlets'];
    const photoUrl = place.photoUrl || DEFAULT_PLACE_IMAGE;

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
                    <Badge className="bg-black/70 text-white border-0 text-xs">
                        #{place.rank}
                    </Badge>
                </div>
                {/* Distance badge */}
                <div className="absolute top-2 right-2">
                    <Badge className="bg-white/90 text-gray-700 border-0 text-xs">
                        <MapPin className="w-3 h-3 mr-1" />
                        {place.distance}m
                    </Badge>
                </div>
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
                        {/* Show icon only when no priceRange set; priceRange text includes $ already */}
                        {!place.priceRange && <DollarSign className="w-4 h-4 text-green-600" />}
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
