"use client";

import React, { useEffect, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";

interface SplashScreenProps {
    onComplete?: () => void;
    campusPack?: "generic" | "nyu";
}

export default function SplashScreen({ onComplete, campusPack = "nyu" }: SplashScreenProps) {
    const [isVisible, setIsVisible] = useState(true);
    const prefersReduced = useReducedMotion();

    // Colors based on pack
    const isNYU = campusPack === "nyu";
    const primaryColor = isNYU ? "#ffffff" : "#1e293b"; // white on NYU, slate-800 on generic
    const dotColor = isNYU ? "#ffffff" : "#475569"; // solid white on NYU, or generic slate
    const bgColor = isNYU
        ? "bg-gradient-to-b from-[#7314B3] to-[#460570] text-white"
        : "bg-slate-50 text-slate-800";
    const loaderBg = isNYU ? "bg-white" : "bg-slate-800";
    const loaderTrack = isNYU ? "bg-white/20" : "bg-black/10";

    useEffect(() => {
        // Total animation time before firing onComplete and fading out
        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(() => {
                if (onComplete) onComplete();
            }, 500); // Wait for fade out to complete
        }, 2800);

        return () => clearTimeout(timer);
    }, [onComplete]);

    // Reduced motion fallback
    if (prefersReduced) {
        return (
            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className={`fixed inset-0 z-[100] flex items-center justify-center ${bgColor}`}
                    >
                        <img src={`/brand/final/lockup-${campusPack}.svg`} alt="NYU Buddy" className="w-48 h-auto" />
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                    className={`fixed inset-0 z-[100] flex flex-col items-center justify-center ${bgColor}`}
                >
                    <div className="relative flex flex-col flex-1 items-center justify-center w-full max-w-sm px-6">

                        {/* The Animated Mark */}
                        <motion.div className="flex justify-center mb-6">
                            <svg viewBox="0 0 100 100" className="w-24 h-24" xmlns="http://www.w3.org/2000/svg">
                                <g strokeLinecap="round" strokeLinejoin="round">
                                    {/* Stem */}
                                    <motion.path
                                        d="M 30 20 L 30 80"
                                        fill="none"
                                        stroke={primaryColor}
                                        strokeWidth="12"
                                        initial={{ pathLength: 0, opacity: 0 }}
                                        animate={{ pathLength: 1, opacity: 1 }}
                                        transition={{ duration: 0.6, ease: "easeOut" }}
                                    />
                                    {/* Outer Loop */}
                                    <motion.path
                                        d="M 30 20 Q 70 20 70 40 Q 70 50 50 50 Q 80 50 80 65 Q 80 80 30 80"
                                        fill="none"
                                        stroke={primaryColor}
                                        strokeWidth="10"
                                        initial={{ pathLength: 0, opacity: 0 }}
                                        animate={{ pathLength: 1, opacity: 1 }}
                                        transition={{ duration: 0.8, ease: "easeInOut", delay: 0.3 }}
                                    />
                                    {/* Core Dot (Pops in) */}
                                    <motion.circle
                                        cx="50"
                                        cy="50"
                                        r="10"
                                        fill={dotColor}
                                        stroke="none"
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: isNYU ? 1 : 0.4 }}
                                        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 1.0 }}
                                    />
                                </g>
                            </svg>
                        </motion.div>

                        {/* The Text Lockup (Fades up) */}
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ duration: 0.5, ease: "easeOut", delay: 1.3 }}
                            className="text-center"
                        >
                            <h1 className="text-3xl font-bold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
                                {isNYU ? "NYU Buddy" : "Buddy"}
                            </h1>
                        </motion.div>

                        {/* Simulated Loading Progress Bar at the bottom */}
                        <motion.div
                            className={`absolute bottom-16 w-32 h-1 rounded-full overflow-hidden ${loaderTrack}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1.5 }}
                        >
                            <motion.div
                                className={`h-full rounded-full ${loaderBg}`}
                                initial={{ width: "0%" }}
                                animate={{ width: "100%" }}
                                transition={{ duration: 1.2, ease: "easeInOut", delay: 1.5 }}
                            />
                        </motion.div>

                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
