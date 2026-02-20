"use client";

import React, { useState, useEffect } from "react";
import SplashScreen from "./SplashScreen";

export function SplashProvider({ children }: { children: React.ReactNode }) {
    const [showSplash, setShowSplash] = useState(false);

    useEffect(() => {
        // Only show splash screen once per session
        const hasSeenSplash = sessionStorage.getItem("hasSeenSplash");
        if (!hasSeenSplash) {
            setShowSplash(true);
        }
    }, []);

    const handleSplashComplete = () => {
        setShowSplash(false);
        sessionStorage.setItem("hasSeenSplash", "true");
    };

    return (
        <>
            {showSplash && <SplashScreen campusPack="nyu" onComplete={handleSplashComplete} />}
            {children}
        </>
    );
}
