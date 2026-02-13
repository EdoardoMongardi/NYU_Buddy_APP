'use client';

import { motion } from 'framer-motion';
import { Navigation, MapPin, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signalKeepKeyboard } from '@/lib/hooks/useVisualViewport';

interface MatchProgressBarProps {
    myStatus: string;
    isUpdating: boolean;
    onStatusUpdate: (status: 'heading_there' | 'arrived') => void;
    onCompleteClick: () => void;
    compact?: boolean;
}

const STATUS_CONFIG = {
    pending: {
        label: 'In Progress',
        dotColor: 'bg-violet-400',
        bgTint: 'bg-violet-50/40',
        next: {
            key: 'heading_there' as const,
            label: 'On my way',
            icon: Navigation,
            bg: 'bg-violet-600 hover:bg-violet-700',
        },
    },
    heading_there: {
        label: 'On the way',
        dotColor: 'bg-blue-400',
        bgTint: 'bg-blue-50/40',
        next: {
            key: 'arrived' as const,
            label: "I've arrived",
            icon: MapPin,
            bg: 'bg-blue-600 hover:bg-blue-700',
        },
    },
    arrived: {
        label: 'Arrived',
        dotColor: 'bg-green-500',
        bgTint: 'bg-green-50/40',
        next: null,
    },
} as const;

/**
 * Sticky match-progress bar that sits between messages and the input area.
 *
 * Left  → coloured dot + current-stage label
 * Right → "Complete" (always visible) + next-status pill button
 *
 * When the user reaches "arrived", Complete becomes the sole primary CTA.
 */
export function MatchProgressBar({
    myStatus,
    isUpdating,
    onStatusUpdate,
    onCompleteClick,
    compact = false,
}: MatchProgressBarProps) {
    if (myStatus === 'completed') return null;

    const config = STATUS_CONFIG[myStatus as keyof typeof STATUS_CONFIG];
    if (!config) return null;

    const isArrived = myStatus === 'arrived';

    return (
        <motion.div
            key={myStatus}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={`flex items-center justify-between gap-2 px-3 border-t border-gray-100 ${config.bgTint}`}
            style={{
                paddingTop: compact ? '5px' : '8px',
                paddingBottom: compact ? '5px' : '8px',
                transition: 'padding 0.28s ease-out',
            }}
        >
            {/* ── Left: status indicator ── */}
            <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full ${config.dotColor} flex-shrink-0 animate-pulse`} />
                <span className="text-[11px] font-semibold text-gray-500 tracking-wide uppercase truncate">
                    {config.label}
                </span>
            </div>

            {/* ── Right: action buttons ── */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
                {/* "Complete" always visible as subtle link when not yet arrived */}
                {!isArrived && (
                    <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={onCompleteClick}
                        disabled={isUpdating}
                        className="text-[11px] text-gray-400 hover:text-violet-500 font-medium
                                   transition-colors disabled:opacity-40"
                    >
                        Complete
                    </button>
                )}

                {/* Primary CTA: next status step, or Complete when arrived */}
                {isArrived ? (
                    <Button
                        size="sm"
                        className="rounded-full text-xs font-semibold bg-green-600 hover:bg-green-700
                                   text-white shadow-sm h-7 px-3.5"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={onCompleteClick}
                        disabled={isUpdating}
                    >
                        {isUpdating ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                        ) : (
                            <CheckCircle2 className="h-3 w-3 mr-1.5" />
                        )}
                        Complete
                    </Button>
                ) : config.next ? (
                    <Button
                        size="sm"
                        className={`rounded-full text-xs font-semibold text-white shadow-sm
                                    h-7 px-3.5 ${config.next.bg}`}
                        onPointerDown={() => signalKeepKeyboard()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onStatusUpdate(config.next!.key)}
                        disabled={isUpdating}
                    >
                        {isUpdating ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                        ) : (
                            <config.next.icon className="h-3 w-3 mr-1.5" />
                        )}
                        {config.next.label}
                    </Button>
                ) : null}
            </div>
        </motion.div>
    );
}