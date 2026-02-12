'use client';

import { useState, useEffect } from 'react';

/**
 * Tracks the iOS visual viewport and manages keyboard open/close
 * animations for a full-screen fixed chat layout.
 *
 * Sets CSS custom properties on <html>:
 *   --vvh           current visual viewport height (px or 100dvh)
 *   --vv-offset-top visual viewport offset (px)
 *   --safe-bottom   safe area inset or '0px' when keyboard is open
 *   --vvh-duration  CSS transition duration for height changes
 *
 * The consuming component should apply:
 *   position: fixed; inset-x: 0;
 *   top:    var(--vv-offset-top, 0px);
 *   height: var(--vvh, 100dvh);
 *   transition-property: height;
 *   transition-duration: var(--vvh-duration, 0ms);
 *
 * Keyboard OPEN  → CSS transition (280ms) for smooth shrink.
 * Keyboard CLOSE → JS-driven ease-out animation (280ms) started
 *                  from focusout, with instant snap when the real
 *                  viewport settles.
 *
 * Returns `isKeyboardOpen` (boolean).
 */
export function useVisualViewport(): boolean {
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;

        const root = document.documentElement;

        let rafId: number | null = null;
        let animStartTime = 0;
        let maxHeight = vv.height;
        // baseHeight: the most recent viewport height when the keyboard
        // was NOT open.  Used as the close-animation target instead of
        // maxHeight, because Safari's URL bar can make the settled
        // height smaller than the all-time maximum.
        let baseHeight = vv.height;

        // ── Open transition (CSS-based, suppresses rAF writes) ──
        let suppressVvhUntil = 0;

        const startOpenTransition = (targetH: number, safeBtm: string) => {
            closePhase = 'off';
            closeGuard = false;
            root.style.setProperty('--vvh-duration', '280ms');
            root.style.setProperty('--vvh', `${targetH}px`);
            root.style.setProperty('--safe-bottom', safeBtm);
            suppressVvhUntil = Date.now() + 320;
        };

        const endOpenTransition = () => {
            root.style.setProperty('--vvh-duration', '0ms');
            suppressVvhUntil = 0;
        };

        // ── Close animation (JS-driven, NO CSS transition) ──────
        const CLOSE_MAIN_MS = 280;
        const CLOSE_HOLD_MAX = 500;

        let closePhase: 'off' | 'main' | 'hold' = 'off';
        let closeStart = 0;
        let closeFromH = 0;
        let closeToH = 0;
        let closeKbOpenH = 0;
        let closeGuard = false;

        const easeOutCubic = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

        // ── per-frame update ──
        const update = () => {
            window.scrollTo(0, 0);

            const height = vv.height;
            const offsetTop = vv.offsetTop;

            if (height > maxHeight) maxHeight = height;
            const kbOpen = maxHeight - height > 100;

            root.style.setProperty('--vv-offset-top', `${offsetTop}px`);

            // --- Open-transition suppression ---
            if (Date.now() < suppressVvhUntil) {
                const target = parseFloat(root.style.getPropertyValue('--vvh'));
                if (!isNaN(target) && Math.abs(height - target) < 10) {
                    endOpenTransition();
                    root.style.setProperty('--vvh', `${height}px`);
                    root.style.setProperty(
                        '--safe-bottom',
                        kbOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)',
                    );
                    setIsKeyboardOpen(kbOpen);
                }
                return;
            }
            if (suppressVvhUntil > 0) endOpenTransition();

            // --- Close animation (JS-driven) ---
            if (closePhase !== 'off') {
                const now = Date.now();
                const elapsed = now - closeStart;
                const viewportMoved = Math.abs(height - closeKbOpenH) > 50;

                if (closePhase === 'main') {
                    if (viewportMoved) {
                        closePhase = 'off';
                        closeGuard = false;
                    } else if (elapsed < CLOSE_MAIN_MS) {
                        const t = elapsed / CLOSE_MAIN_MS;
                        const h = closeFromH + (closeToH - closeFromH) * easeOutCubic(t);
                        root.style.setProperty('--vvh', `${h}px`);
                        return;
                    } else {
                        closePhase = 'hold';
                        closeStart = now;
                        root.style.setProperty('--vvh', `${closeToH}px`);
                        return;
                    }
                }

                if (closePhase === 'hold') {
                    if (viewportMoved) {
                        closePhase = 'off';
                        closeGuard = false;
                    } else if (elapsed > CLOSE_HOLD_MAX) {
                        closePhase = 'off';
                        closeGuard = false;
                    } else {
                        root.style.setProperty('--vvh', `${closeToH}px`);
                        return;
                    }
                }
            }

            // --- Normal frame-by-frame tracking ---
            // Keep baseHeight fresh whenever the keyboard is closed.
            if (!kbOpen && closePhase === 'off') {
                baseHeight = height;
            }

            root.style.setProperty('--vvh', `${height}px`);
            root.style.setProperty(
                '--safe-bottom',
                kbOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)',
            );

            if (closeGuard) {
                if (!kbOpen) {
                    closeGuard = false;
                    setIsKeyboardOpen(false);
                }
            } else {
                setIsKeyboardOpen(kbOpen);
            }
        };

        const smoothTrack = () => {
            update();
            const dur = closePhase !== 'off' ? 1000 : 500;
            if (Date.now() - animStartTime < dur) {
                rafId = requestAnimationFrame(smoothTrack);
            }
        };

        // ── event handlers ──
        const onResize = () => {
            const height = vv.height;
            if (height > maxHeight) maxHeight = height;

            if (closePhase !== 'off' && height < closeKbOpenH - 20) {
                closePhase = 'off';
                closeGuard = false;
            }

            if (Date.now() >= suppressVvhUntil && closePhase === 'off') {
                const cur = parseFloat(root.style.getPropertyValue('--vvh') || `${maxHeight}`);
                const delta = cur - height;
                if (delta > 80) {
                    const kbOpen = maxHeight - height > 100;
                    startOpenTransition(
                        height,
                        kbOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)',
                    );
                    setIsKeyboardOpen(kbOpen);
                }
            }

            animStartTime = Date.now();
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(smoothTrack);
        };

        const onFocusOut = (e: FocusEvent) => {
            const target = e.target;
            const related = e.relatedTarget;
            if (
                (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) &&
                !(related instanceof HTMLTextAreaElement || related instanceof HTMLInputElement)
            ) {
                if (maxHeight - vv.height > 100) {
                    closePhase = 'main';
                    closeStart = Date.now();
                    closeFromH = vv.height;
                    closeToH = baseHeight;   // use baseHeight, not maxHeight
                    closeKbOpenH = vv.height;
                    closeGuard = true;
                    setIsKeyboardOpen(false);
                    root.style.setProperty(
                        '--safe-bottom', 'env(safe-area-inset-bottom, 0px)',
                    );
                    animStartTime = Date.now();
                    if (rafId) cancelAnimationFrame(rafId);
                    rafId = requestAnimationFrame(smoothTrack);
                }
            }
        };

        update();
        vv.addEventListener('resize', onResize);
        vv.addEventListener('scroll', update);
        document.addEventListener('focusout', onFocusOut);

        return () => {
            vv.removeEventListener('resize', onResize);
            vv.removeEventListener('scroll', update);
            document.removeEventListener('focusout', onFocusOut);
            if (rafId) cancelAnimationFrame(rafId);
            root.style.removeProperty('--vvh');
            root.style.removeProperty('--vv-offset-top');
            root.style.removeProperty('--safe-bottom');
            root.style.removeProperty('--vvh-duration');
        };
    }, []);

    return isKeyboardOpen;
}
