'use client';

import { useEffect, useCallback } from 'react';

/**
 * Hook that uses the VisualViewport API to track iOS keyboard height
 * and set a CSS custom property `--kb-shift` on the document root.
 *
 * On iOS Safari, `window.visualViewport.height` shrinks when the keyboard
 * opens, while `window.innerHeight` stays at the layout viewport height.
 * This difference is the keyboard height.
 *
 * Components can use `transform: translateY(var(--kb-shift, 0px))` to
 * "follow" the keyboard, eliminating the gap between input and keyboard.
 *
 * Also locks body scroll to prevent iOS from pushing the entire page up.
 */
export function useKeyboardFollow(enabled = true) {
    const setShift = useCallback(() => {
        const vv = window.visualViewport;
        if (!vv) return;

        // Amount the visual viewport is smaller than the layout viewport
        // = keyboard height + any toolbar/prediction bar
        const keyboardHeight = Math.max(
            0,
            window.innerHeight - vv.height - vv.offsetTop
        );

        document.documentElement.style.setProperty(
            '--kb-shift',
            `-${keyboardHeight}px`
        );

        // Also set the visual viewport height for containers that need it
        document.documentElement.style.setProperty(
            '--vv-height',
            `${vv.height}px`
        );
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const vv = window.visualViewport;
        if (!vv) return;

        // Lock body scroll to prevent iOS page push
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        setShift();
        vv.addEventListener('resize', setShift);
        vv.addEventListener('scroll', setShift);
        window.addEventListener('orientationchange', setShift);

        return () => {
            vv.removeEventListener('resize', setShift);
            vv.removeEventListener('scroll', setShift);
            window.removeEventListener('orientationchange', setShift);
            document.body.style.overflow = prevOverflow;

            // Reset CSS vars
            document.documentElement.style.removeProperty('--kb-shift');
            document.documentElement.style.removeProperty('--vv-height');
        };
    }, [enabled, setShift]);
}
