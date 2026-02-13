'use client';

import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { OutgoingOffer } from '@/lib/firebase/functions';
import { CollapsibleInviteCard } from './CollapsibleInviteCard';

interface ActiveInvitesRowProps {
    offers: OutgoingOffer[];
    onCancel: (offerId: string) => void;
}

export function ActiveInvitesRow({ offers, onCancel }: ActiveInvitesRowProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    if (!offers || offers.length === 0) return null;

    return (
        <div className="flex flex-col gap-1.5 w-full mb-3">
            <div className="flex items-center justify-between px-0.5 mb-0.5">
                <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Active Invites
                </h4>
                <span className="text-[10px] font-medium text-gray-300">
                    {offers.length}/3
                </span>
            </div>

            <div className="flex flex-col gap-1.5">
                <AnimatePresence initial={false}>
                    {offers.map((offer) => (
                        <CollapsibleInviteCard
                            key={offer.offerId}
                            offer={offer}
                            isExpanded={expandedId === offer.offerId}
                            onExpand={() => setExpandedId(offer.offerId)}
                            onCollapse={() => setExpandedId(null)}
                            onCancel={() => onCancel(offer.offerId)}
                        />
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
