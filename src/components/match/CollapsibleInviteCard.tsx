'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { OutgoingOffer } from '@/lib/firebase/functions';
import Image from 'next/image';

interface CollapsibleInviteCardProps {
    offer: OutgoingOffer;
    isExpanded: boolean;
    onExpand: () => void;
    onCollapse: () => void;
    onCancel: () => void;
}

export function CollapsibleInviteCard({
    offer,
    isExpanded,
    onExpand,
    onCollapse,
    onCancel,
}: CollapsibleInviteCardProps) {
    const [timeLeft, setTimeLeft] = useState(offer.expiresInSeconds);
    const [isExpiring, setIsExpiring] = useState(false);
    const [hasExpired, setHasExpired] = useState(false);

    // Timer logic
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            const expiration = new Date(offer.expiresAt);
            const seconds = Math.max(0, Math.floor((expiration.getTime() - now.getTime()) / 1000));

            setTimeLeft(seconds);

            if (seconds <= 5 && seconds > 0) {
                setIsExpiring(true);
                if (!isExpanded) onExpand(); // Auto-expand when expiring
            } else if (seconds === 0) {
                setHasExpired(true);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [offer.expiresAt, isExpanded, onExpand, offer.expiresInSeconds]);

    // Initial auto-expand for fresh invites
    useEffect(() => {
        if (offer.expiresInSeconds > 590) { // Assuming 10m TTL
            onExpand();
            const timer = setTimeout(onCollapse, 3000);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    if (hasExpired) {
        return (
            <div className="flex-1 bg-red-50/60 border border-red-100/60 rounded-2xl flex items-center justify-center px-2 py-2.5">
                <span className="text-red-400 font-medium text-[11px] flex items-center gap-1">
                    <AlertCircle size={12} />
                    Expired
                </span>
            </div>
        );
    }

    return (
        <div
            className={`flex-1 relative overflow-hidden cursor-pointer rounded-2xl transition-colors ${
                isExpanded
                    ? isExpiring ? 'bg-orange-50/60 border-orange-200/60' : 'bg-violet-50/30 border-violet-200/60'
                    : isExpiring ? 'bg-orange-50/60 border-orange-200/60' : 'bg-white border-gray-200/60'
            } border shadow-card`}
            onClick={() => isExpanded ? onCollapse() : onExpand()}
        >
            {/* Header — always visible */}
            <div className="flex items-center px-2.5 py-2 gap-2 min-w-0">
                <div className="relative w-6 h-6 flex-shrink-0">
                    <Image
                        src={offer.toPhotoURL || '/placeholder-user.jpg'}
                        alt={offer.toDisplayName}
                        fill
                        className="rounded-full object-cover"
                    />
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="text-[11px] font-semibold truncate text-gray-800 leading-tight">
                        {offer.toDisplayName.split(' ')[0]}
                    </h3>
                    <div className="flex items-center gap-1">
                        {!isExpanded ? (
                            <div className="flex gap-[2px]">
                                {[0, 1, 2].map(i => (
                                    <motion.div
                                        key={i}
                                        className="w-[2.5px] h-[2.5px] bg-violet-400 rounded-full"
                                        animate={{ opacity: [0.2, 1, 0.2] }}
                                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                                    />
                                ))}
                            </div>
                        ) : (
                            <span className={`text-[10px] font-medium leading-tight ${isExpiring ? 'text-orange-600' : 'text-gray-400'}`}>
                                {formatTime(timeLeft)}
                            </span>
                        )}
                    </div>
                </div>

                {!isExpanded && (
                    <span className={`text-[10px] font-medium tabular-nums flex-shrink-0 ${isExpiring ? 'text-orange-600' : 'text-gray-400'}`}>
                        {formatTime(timeLeft)}
                    </span>
                )}
            </div>

            {/* Cancel button — individual per card, shown when expanded */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="px-2 pb-2 pt-0">
                            <button
                                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                                className="w-full py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 text-[11px] font-medium rounded-lg border border-gray-100 transition-colors touch-scale"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Progress bar at bottom — driven by timeLeft for accuracy across all cards */}
            <div className="absolute bottom-0 left-0 h-[1.5px] bg-gray-100/60 w-full">
                <div
                    className={`h-full rounded-full ${isExpiring ? 'bg-orange-400' : 'bg-violet-400'}`}
                    style={{
                        width: `${Math.max(0, (timeLeft / 600) * 100)}%`,
                        transition: 'width 1s linear',
                    }}
                />
            </div>
        </div>
    );
}
