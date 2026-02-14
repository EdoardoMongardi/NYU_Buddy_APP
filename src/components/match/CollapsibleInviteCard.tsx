'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
            <motion.div
                layout
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 h-[40px] bg-red-50/60 border border-red-100/60 rounded-xl flex items-center justify-center px-2"
            >
                <span className="text-red-400 font-medium text-[11px] flex items-center gap-1">
                    <AlertCircle size={12} />
                    Expired
                </span>
            </motion.div>
        );
    }

    return (
        <motion.div
            layout
            style={{ borderRadius: 12 }}
            className={`flex-1 relative overflow-hidden cursor-pointer transition-colors touch-scale ${
                isExpanded
                    ? isExpiring ? 'bg-orange-50/60 border-orange-200/60' : 'bg-violet-50/30 border-violet-200/60'
                    : isExpiring ? 'bg-orange-50/60 border-orange-200/60' : 'bg-white border-gray-200/60'
            } border shadow-card`}
            onClick={() => isExpanded ? onCollapse() : onExpand()}
        >
            {/* Compact chip content */}
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
                            /* Waiting dots (collapsed) */
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
                            /* Timer text (expanded) */
                            <span className={`text-[10px] font-medium leading-tight ${isExpiring ? 'text-orange-600' : 'text-gray-400'}`}>
                                {formatTime(timeLeft)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Timer pill (collapsed only) */}
                {!isExpanded && (
                    <span className={`text-[10px] font-medium tabular-nums flex-shrink-0 ${isExpiring ? 'text-orange-600' : 'text-gray-400'}`}>
                        {formatTime(timeLeft)}
                    </span>
                )}
            </div>

            {/* Progress bar at bottom */}
            <div className="absolute bottom-0 left-0 h-[1.5px] bg-gray-100/60 w-full">
                <motion.div
                    className={`h-full rounded-full ${isExpiring ? 'bg-orange-400' : 'bg-violet-400'}`}
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: offer.expiresInSeconds, ease: "linear" }}
                />
            </div>
        </motion.div>
    );
}
