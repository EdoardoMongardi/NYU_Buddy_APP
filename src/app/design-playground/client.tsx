/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { campusPacks } from "@/lib/campusPacks";
import SplashScreen from "@/components/ui/SplashScreen";

const CONCEPTS = ["FINAL", "C1", "C2", "C3", "F1", "F2", "F3"];
const PRESETS = [
    { id: "P1", name: "Fade + Scale", desc: "0.92 -> 1.0, 300-450ms" },
    { id: "P2", name: "Pulse Ring", desc: "Expanding ring behind mark, ~900ms" },
    { id: "P3", name: "Stroke Draw", desc: "For inline SVGs with strokes, ~800ms" },
];
const BACKGROUNDS = [
    { id: "light", name: "Light", classes: "bg-white text-black" },
    { id: "dark", name: "Dark", classes: "bg-slate-950 text-white" },
    { id: "pack", name: "Pack Default", classes: "" }, // Will use pack styles dynamically
];

export default function DesignPlaygroundClient() {
    const [concept, setConcept] = useState("FINAL");
    const [preset, setPreset] = useState("P1");
    const [bg, setBg] = useState("light");
    const [campusPack, setCampusPack] = useState<"generic" | "nyu">("generic");
    const [motionSimulated, setMotionSimulated] = useState(false);
    const [showSplash, setShowSplash] = useState(false);
    const [key, setKey] = useState(0); // Trigger re-render for animation replay

    const systemReducedMotion = useReducedMotion();
    const prefersReduced = motionSimulated || systemReducedMotion;
    const currentPack = campusPacks[campusPack];

    // Compute actual background classes
    const currentBg = BACKGROUNDS.find((b) => b.id === bg)!;
    const bgClasses = bg === "pack" ? currentPack.bgStyles : currentBg.classes;

    // Re-trigger animation when settings change
    useEffect(() => {
        setKey((prev) => prev + 1);
    }, [concept, preset, prefersReduced, campusPack]);

    const copyFeedback = () => {
        navigator.clipboard.writeText(`Feedback: Logo Concept [${concept}] with Animation [${preset}]`);
        alert("Feedback copied to clipboard!");
    };

    // Render SVG wrapper with animation based on preset
    const AnimatedSVG = ({ baseSrc, type }: { baseSrc: string; type: "mark" | "lockup" | "icon" }) => {
        // Resolve src path based on type and packed campus
        let src = type === "lockup" ? `${baseSrc}-${campusPack}.svg` : `${baseSrc}.svg`;

        // Rewrite path for FINAL option
        if (concept === "FINAL") {
            const finalBase = "/brand/final";
            src = type === "lockup" ? `${finalBase}/lockup-${campusPack}.svg` : `${finalBase}/${type}.svg`;
        }
        // If reduced motion, just fade in
        if (prefersReduced) {
            return (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} key={key}>
                    <img src={src} className={`${type === 'lockup' ? 'w-48' : 'w-24'} h-auto`} alt={`${concept} ${type}`} />
                </motion.div>
            );
        }

        if (preset === "P1") {
            return (
                <motion.div
                    key={key}
                    initial={{ scale: 0.92, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                >
                    <img src={src} className={`${type === 'lockup' ? 'w-48' : 'w-24'} h-auto`} alt={`${concept} ${type}`} />
                </motion.div>
            );
        }

        if (preset === "P2") {
            return (
                <div className="relative flex items-center justify-center p-4">
                    <motion.div
                        key={`ring-${key}`}
                        className="absolute rounded-full border border-current opacity-0 w-24 h-24"
                        initial={{ scale: 0.8, opacity: 0.5 }}
                        animate={{ scale: 1.5, opacity: 0 }}
                        transition={{ duration: 0.9, ease: "easeOut" }}
                    />
                    <img src={src} className={`relative z-10 ${type === 'lockup' ? 'w-48' : 'w-24'} h-auto`} alt={`${concept} ${type}`} />
                </div>
            );
        }

        if (preset === "P3") {
            // P3 is technically a stroke draw. For external <img />, we can simulate it with a clip-path wipe 
            // since we cannot animate internal strokes without inlining the SVG.
            return (
                <motion.div
                    key={key}
                    initial={{ clipPath: "inset(0 100% 0 0)" }}
                    animate={{ clipPath: "inset(0 0% 0 0)" }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                >
                    <img src={src} className={`${type === 'lockup' ? 'w-48' : 'w-24'} h-auto`} alt={`${concept} ${type}`} />
                </motion.div>
            );
        }

        return <img src={src} className={`${type === 'lockup' ? 'w-48' : 'w-24'} h-auto`} alt={`${concept} ${type}`} />;
    };

    return (
        <div className={`min-h-screen p-4 md:p-8 transition-colors duration-300 ${bgClasses}`}>
            <div className="max-w-4xl mx-auto space-y-8">

                <header className="flex items-center justify-between border-b pb-4 border-current/20">
                    <div>
                        <h1 className="text-2xl font-bold">Design Playground</h1>
                        <p className="text-sm opacity-70">Review logo concepts and animations live.</p>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={() => setShowSplash(true)}
                            className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 transition"
                        >
                            Play Splash Screen
                        </button>
                        <button
                            onClick={copyFeedback}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition"
                        >
                            Copy Feedback
                        </button>
                    </div>
                </header>

                <AnimatePresence>
                    {showSplash && (
                        <SplashScreen
                            campusPack={campusPack}
                            onComplete={() => setShowSplash(false)}
                        />
                    )}
                </AnimatePresence>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Controls Column */}
                    <div className="space-y-6 bg-current/5 p-6 rounded-xl border border-current/10">

                        {/* Section A.0: Campus Pack selector */}
                        <section>
                            <h2 className="text-sm font-bold uppercase tracking-wider mb-3 opacity-60">Campus Pack</h2>
                            <div className="flex gap-2 p-1 rounded-lg border border-current/10 bg-current/5">
                                {(["generic", "nyu"] as const).map((pack) => (
                                    <button
                                        key={pack}
                                        onClick={() => setCampusPack(pack)}
                                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition capitalize
                                            ${campusPack === pack ? "bg-blue-500 text-white shadow-sm" : "hover:bg-current/10"}`}
                                    >
                                        {pack === "generic" ? "Generic" : "NYU Edition"}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Section A: Logo selector */}
                        <section>
                            <h2 className="text-sm font-bold uppercase tracking-wider mb-3 opacity-60">A. Logo Concept</h2>
                            <div className="flex flex-wrap gap-2">
                                {CONCEPTS.map((c) => (
                                    <button
                                        key={c}
                                        onClick={() => setConcept(c)}
                                        className={`h-10 px-4 rounded-full font-bold transition flex items-center justify-center border-2 
                                            ${concept === c ? "border-blue-500 bg-blue-500/10 text-blue-600" : "border-transparent bg-current/10 hover:bg-current/20"}
                                            ${c === "FINAL" ? "ring-2 ring-purple-500 shadow-sm" : ""}`}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Section B: Animation preset selector */}
                        <section>
                            <h2 className="text-sm font-bold uppercase tracking-wider mb-3 opacity-60">B. Animation Preset</h2>
                            <div className="space-y-2">
                                {PRESETS.map((p) => (
                                    <label key={p.id} className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition
                    ${preset === p.id ? "border-blue-500 bg-blue-500/5" : "border-transparent bg-current/5 hover:bg-current/10"}`}>
                                        <input
                                            type="radio"
                                            name="preset"
                                            value={p.id}
                                            checked={preset === p.id}
                                            onChange={() => setPreset(p.id)}
                                            className="mt-1"
                                        />
                                        <div>
                                            <div className="font-semibold">{p.id} - {p.name}</div>
                                            <div className="text-xs opacity-70">{p.desc}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </section>

                        {/* Section D: Background toggle */}
                        <section>
                            <h2 className="text-sm font-bold uppercase tracking-wider mb-3 opacity-60">D. Background</h2>
                            <div className="flex gap-2 bg-current/10 p-1 rounded-lg">
                                {BACKGROUNDS.map((b) => (
                                    <button
                                        key={b.id}
                                        onClick={() => setBg(b.id)}
                                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition
                      ${bg === b.id ? "bg-white text-black shadow-sm" : "hover:bg-white/5"}`}
                                    >
                                        {b.name}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Section E: Reduced motion toggle */}
                        <section>
                            <h2 className="text-sm font-bold uppercase tracking-wider mb-3 opacity-60">E. Accessibility</h2>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={motionSimulated}
                                    onChange={(e) => setMotionSimulated(e.target.checked)}
                                    className="w-4 h-4"
                                />
                                <span className="text-sm font-medium">Simulate Reduced Motion</span>
                            </label>
                            {systemReducedMotion && (
                                <p className="text-xs text-orange-500 mt-2">
                                    System Settings: &quot;Prefers Reduced Motion&quot; is ON globally.
                                </p>
                            )}
                        </section>
                    </div>

                    {/* Section C: Live preview area */}
                    <div className="space-y-6">
                        <h2 className="text-sm font-bold uppercase tracking-wider opacity-60">C. Live Preview</h2>
                        <div className="flex justify-end mb-[-1rem]">
                            <button
                                onClick={() => setKey(k => k + 1)}
                                className="text-xs px-2 py-1 bg-current/10 rounded hover:bg-current/20"
                            >
                                Replay Animation
                            </button>
                        </div>

                        <div className={`p-8 rounded-xl flex flex-col items-center justify-center gap-12 min-h-[400px] border border-current/10 shadow-inner ${bgClasses.includes('bg-white') || bgClasses.includes('bg-slate-50') ? 'bg-gray-50' : 'bg-black/20'}`}>

                            <div className="text-center w-full">
                                <p className="text-xs uppercase opacity-50 mb-4 tracking-widest">Mark Only (24px - 48px - 100px+)</p>
                                <div className="flex justify-center items-end gap-8 pb-4">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-6 h-6 flex items-center justify-center"><AnimatedSVG baseSrc={`/brand/concepts/${concept}/mark`} type="mark" /></div>
                                        <span className="text-[10px] opacity-40">24px</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-8 h-8 flex items-center justify-center"><AnimatedSVG baseSrc={`/brand/concepts/${concept}/mark`} type="mark" /></div>
                                        <span className="text-[10px] opacity-40">32px</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 flex items-center justify-center"><AnimatedSVG baseSrc={`/brand/concepts/${concept}/mark`} type="mark" /></div>
                                        <span className="text-[10px] opacity-40">48px</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-2">
                                        <AnimatedSVG baseSrc={`/brand/concepts/${concept}/mark`} type="mark" />
                                        <span className="text-[10px] opacity-40">Native</span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-center w-full border-t border-current/10 pt-8">
                                <p className="text-xs uppercase opacity-50 mb-4 tracking-widest">Mark + Wordmark Lockup</p>
                                <div className="flex justify-center">
                                    <AnimatedSVG baseSrc={`/brand/concepts/${concept}/lockup`} type="lockup" />
                                </div>
                            </div>

                            <div className="text-center w-full border-t border-current/10 pt-8">
                                <p className="text-xs uppercase opacity-50 mb-4 tracking-widest">App Icon (Square)</p>
                                <div className="flex justify-center">
                                    <AnimatedSVG baseSrc={`/brand/concepts/${concept}/icon`} type="icon" />
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
