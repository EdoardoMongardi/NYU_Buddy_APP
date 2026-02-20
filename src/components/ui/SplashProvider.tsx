"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import SplashScreen from "./SplashScreen";

export function SplashProvider({ children }: { children: React.ReactNode }) {
    const [showSplash, setShowSplash] = useState(false);
    const pathname = usePathname();

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

    // Dynamic Theme Color Manager for PWA Status Bar
    useEffect(() => {
        let color = "#ffffff"; // Default app background

        if (showSplash) {
            color = "#7314b3"; // NYU Violet splash top gradient
        } else if (pathname === "/login" || pathname === "/onboarding") {
            color = "#f5f3ff"; // Login and Onboarding light violet-50 background top
        }

        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (!metaThemeColor) {
            metaThemeColor = document.createElement("meta");
            metaThemeColor.setAttribute("name", "theme-color");
            document.head.appendChild(metaThemeColor);
        }
        metaThemeColor.setAttribute("content", color);
    }, [showSplash, pathname]);

    return (
        <>
            {showSplash && <SplashScreen campusPack="nyu" onComplete={handleSplashComplete} />}
            {children}
        </>
    );
}
