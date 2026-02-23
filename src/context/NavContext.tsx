'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface NavContextType {
    isNavVisible: boolean;
    setNavVisible: (visible: boolean) => void;
    navRef: React.RefObject<HTMLElement | null>;
}

const NavContext = createContext<NavContextType | undefined>(undefined);

export function NavProvider({ children }: { children: ReactNode }) {
    const [isNavVisible, setNavVisible] = useState(true);
    const navRef = React.useRef<HTMLElement | null>(null);

    return (
        <NavContext.Provider value={{ isNavVisible, setNavVisible, navRef }}>
            {children}
        </NavContext.Provider>
    );
}

export function useNav() {
    const context = useContext(NavContext);
    if (context === undefined) {
        throw new Error('useNav must be used within a NavProvider');
    }
    return context;
}
