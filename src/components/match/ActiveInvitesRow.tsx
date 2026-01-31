'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
        <div className="flex flex-col gap-2 w-full mb-4">
            <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Active Invites ({offers.length}/3)
                </h4>
            </div>

            <div className="flex flex-col gap-2">
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
