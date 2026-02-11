'use client';

import { motion } from 'framer-motion';
import { Navigation, MapPin, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StatusQuickActionsProps {
    myStatus: string;
    isUpdating: boolean;
    onStatusUpdate: (status: 'heading_there' | 'arrived' | 'completed') => void;
}

/**
 * Horizontal row of status pill buttons above the chat input.
 * Shows only the next valid status action at a time.
 */
export function StatusQuickActions({
    myStatus,
    isUpdating,
    onStatusUpdate,
}: StatusQuickActionsProps) {
    // Only show the next valid status
    if (myStatus === 'completed') return null;

    const nextStatus = (() => {
        switch (myStatus) {
            case 'pending':
                return {
                    key: 'heading_there' as const,
                    label: 'On my way',
                    icon: Navigation,
                    className: 'bg-violet-100 text-violet-700 hover:bg-violet-200 border-violet-200',
                };
            case 'heading_there':
                return {
                    key: 'arrived' as const,
                    label: "I've arrived",
                    icon: MapPin,
                    className: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200',
                };
            case 'arrived':
                return {
                    key: 'completed' as const,
                    label: 'Complete Meetup',
                    icon: Check,
                    className: 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200',
                };
            default:
                return null;
        }
    })();

    if (!nextStatus) return null;

    const Icon = nextStatus.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-3 py-2"
        >
            <Button
                size="sm"
                variant="outline"
                className={`rounded-full text-xs font-medium ${nextStatus.className}`}
                onClick={() => onStatusUpdate(nextStatus.key)}
                disabled={isUpdating}
            >
                {isUpdating ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                    <Icon className="h-3 w-3 mr-1" />
                )}
                {nextStatus.label}
            </Button>
        </motion.div>
    );
}
