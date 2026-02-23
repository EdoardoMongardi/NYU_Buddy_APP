'use client';

import { useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: ReactNode;
}

const PULL_THRESHOLD = 80; // Distance needed to trigger refresh
const MAX_PULL = 120;      // Maximum visual pull distance
const REFRESHING_Y = 50;   // Height where the spinner sits while refreshing

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
    const [pullY, setPullY] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isPulling, setIsPulling] = useState(false);

    const startY = useRef(0);
    const currentY = useRef(0);
    const isDragging = useRef(false);

    const handleTouchStart = useCallback((e: React.TouchEvent | TouchEvent) => {
        // Only allow pull-to-refresh if we are at the very top of the page
        if (window.scrollY > 0 || isRefreshing) return;

        isDragging.current = true;
        setIsPulling(true);
        startY.current = 'touches' in e ? e.touches[0].clientY : (e as unknown as MouseEvent).clientY;
    }, [isRefreshing]);

    const handleTouchMove = useCallback((e: React.TouchEvent | TouchEvent) => {
        if (!isDragging.current || isRefreshing) return;

        currentY.current = 'touches' in e ? e.touches[0].clientY : (e as unknown as MouseEvent).clientY;

        const deltaY = currentY.current - startY.current;

        // Only respond to pulling down
        if (deltaY > 0) {
            if (e.cancelable) {
                e.preventDefault(); // Prevent native overscroll browser behavior
            }

            // Add friction as it gets pulled further
            const friction = 0.5;
            const newPullY = Math.min(MAX_PULL, deltaY * friction);
            setPullY(newPullY);
        } else {
            setPullY(0);
        }
    }, [isRefreshing]);

    const handleTouchEnd = useCallback(async () => {
        if (!isDragging.current) return;
        isDragging.current = false;
        setIsPulling(false);

        if (pullY >= PULL_THRESHOLD && !isRefreshing) {
            setIsRefreshing(true);
            setPullY(REFRESHING_Y);

            try {
                await onRefresh();
            } finally {
                setIsRefreshing(false);
                setPullY(0);
            }
        } else {
            // Didn't pull far enough, snap back
            setPullY(0);
        }
    }, [pullY, isRefreshing, onRefresh]);

    // Use passive false for touchmove to allow preventDefault
    useEffect(() => {
        const element = document.getElementById('pull-to-refresh-container');
        if (!element) return;

        element.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true });
        element.addEventListener('touchmove', handleTouchMove as EventListener, { passive: false });
        element.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true });
        element.addEventListener('touchcancel', handleTouchEnd as EventListener, { passive: true });

        return () => {
            element.removeEventListener('touchstart', handleTouchStart as EventListener);
            element.removeEventListener('touchmove', handleTouchMove as EventListener);
            element.removeEventListener('touchend', handleTouchEnd as EventListener);
            element.removeEventListener('touchcancel', handleTouchEnd as EventListener);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

    // Calculate spinner opacity/rotation based on pull distance
    const progress = Math.min(1, pullY / PULL_THRESHOLD);
    const spinnerRotation = progress * 360;

    return (
        <div id="pull-to-refresh-container" className="relative w-full h-full overflow-hidden">

            {/* Loading indicator that stays fixed behind/above the content */}
            <div
                className="absolute top-0 left-0 right-0 flex justify-center items-end"
                style={{
                    height: `${MAX_PULL}px`,
                    zIndex: 0,
                }}
            >
                <div
                    className="mb-4 text-violet-600 transition-opacity duration-200"
                    style={{
                        opacity: isRefreshing ? 1 : (progress > 0.2 ? progress : 0),
                        transform: `translateY(${Math.max(0, 50 - pullY)}px)`, // Move down as pull increases
                    }}
                >
                    <Loader2
                        className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`}
                        style={{
                            transform: isRefreshing ? 'none' : `rotate(${spinnerRotation}deg)`
                        }}
                    />
                </div>
            </div>

            {/* Main content that gets pulled down */}
            <div
                className="relative z-10 bg-white min-h-full"
                style={{
                    transform: `translateY(${pullY}px)`,
                    transition: isPulling ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
            >
                {children}
            </div>

        </div>
    );
}
