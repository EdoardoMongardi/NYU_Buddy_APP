'use client';

import { useEffect } from 'react';

/**
 * Sets the `theme-color` meta tag to white so that Safari's
 * bottom browser chrome blends with the chat UI.
 * Restores the original value on unmount.
 */
export function useWhiteThemeColor() {
    useEffect(() => {
        const existing = document.querySelector('meta[name="theme-color"]');
        const prev = existing?.getAttribute('content') ?? null;

        if (existing) {
            existing.setAttribute('content', '#ffffff');
        } else {
            const meta = document.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            meta.setAttribute('content', '#ffffff');
            document.head.appendChild(meta);
        }

        return () => {
            const tag = document.querySelector('meta[name="theme-color"]');
            if (prev && tag) tag.setAttribute('content', prev);
            else tag?.remove();
        };
    }, []);
}
