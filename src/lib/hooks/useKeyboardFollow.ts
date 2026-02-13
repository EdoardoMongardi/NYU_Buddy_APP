'use client';

import { useEffect, useCallback } from 'react';

/**
 * Detects whether we're running on iOS Safari / WebView.
 * We gate the keyboard-follow logic to iOS only because:
 * - Android Chrome handles keyboard resize correctly via native viewport adjustment
 * - Desktop browsers don't have virtual keyboards
 * - Only iOS Safari has the layout-viewport vs visual-viewport mismatch that causes the gap
 */
function isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Hook that uses the VisualViewport API to track iOS keyboard height
 * and set a CSS custom property `--kb-height` on the document root.
 *
 * Consumers should use:
 *   bottom: calc(var(--kb-height, 0px) + env(safe-area-inset-bottom, 0px))
 * on a `position: fixed` element to follow the keyboard.
 *
 * On non-iOS platforms, --kb-height stays at 0px so nothing changes.
 * We do NOT lock body overflow here — scroll containment is handled
 * via CSS on the chat containers themselves (overflow-hidden on parents,
 * overflow-y-auto on message list).
 */
export function useIOSKeyboard(enabled = true) {
    const setHeight = useCallback(() => {
        const vv = window.visualViewport;
        if (!vv) return;

        // On iOS, visualViewport.height shrinks when keyboard opens.
        // innerHeight stays at layout viewport height.
        // The difference = keyboard height (including prediction bar / Done toolbar).
        const kbHeight = Math.max(
            0,
            window.innerHeight - vv.height - vv.offsetTop
        );

        document.documentElement.style.setProperty(
            '--kb-height',
            `${kbHeight}px`
        );
    }, []);

    useEffect(() => {
        if (!enabled) return;
        if (!isIOS()) return; // No-op on non-iOS

        const vv = window.visualViewport;
        if (!vv) return;

        setHeight();
        vv.addEventListener('resize', setHeight);
        vv.addEventListener('scroll', setHeight);

        return () => {
            vv.removeEventListener('resize', setHeight);
            vv.removeEventListener('scroll', setHeight);
            document.documentElement.style.removeProperty('--kb-height');
        };
    }, [enabled, setHeight]);
}
