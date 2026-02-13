'use client';

import { useEffect } from 'react';

/**
 * Locks body scrolling by setting position:fixed on body and html.
 * Prevents iOS Safari from scrolling the layout viewport when the
 * keyboard opens, keeping visualViewport.offsetTop ≈ 0.
 *
 * Restores all modified styles on unmount.
 */
export function useLockBodyScroll() {
    useEffect(() => {
        const html = document.documentElement.style;
        const body = document.body.style;

        const prev = {
            htmlOverflow: html.overflow,
            htmlOverscroll: html.overscrollBehavior,
            bodyOverflow: body.overflow,
            bodyPosition: body.position,
            bodyWidth: body.width,
            bodyHeight: body.height,
            bodyTop: body.top,
            bodyLeft: body.left,
            bodyOverscroll: body.overscrollBehavior,
        };

        html.overflow = 'hidden';
        html.overscrollBehavior = 'none';
        body.overflow = 'hidden';
        body.position = 'fixed';
        body.width = '100%';
        body.height = '100%';
        body.top = '0';
        body.left = '0';
        body.overscrollBehavior = 'none';

        return () => {
            html.overflow = prev.htmlOverflow;
            html.overscrollBehavior = prev.htmlOverscroll;
            body.overflow = prev.bodyOverflow;
            body.position = prev.bodyPosition;
            body.width = prev.bodyWidth;
            body.height = prev.bodyHeight;
            body.top = prev.bodyTop;
            body.left = prev.bodyLeft;
            body.overscrollBehavior = prev.bodyOverscroll;
        };
    }, []);
}
