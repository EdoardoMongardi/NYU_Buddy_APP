'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, PictureInPicture } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeedVideoPlayerProps {
    src: string;
    poster?: string;
    className?: string;
}

export default function FeedVideoPlayer({ src, poster, className }: FeedVideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);


    // Format time (MM:SS)
    const formatTime = (timeInSeconds: number) => {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // Handle intersection for auto-play
    useEffect(() => {
        const options = {
            root: null,
            rootMargin: '0px',
            threshold: 0.6, // Play when 60% visible
        };

        const handleIntersect = (entries: IntersectionObserverEntry[]) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    // Play if visible
                    videoRef.current?.play().catch(() => {
                        // Auto-play might be blocked or user interaction needed
                        setIsPlaying(false);
                    });
                } else {
                    // Pause if not visible
                    videoRef.current?.pause();
                }
            });
        };

        const observer = new IntersectionObserver(handleIntersect, options);
        const element = containerRef.current;
        if (element) {
            observer.observe(element);
        }

        return () => {
            if (element) {
                observer.unobserve(element);
            }
        };
    }, []);

    // Video event listeners
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onTimeUpdate = () => {
            setCurrentTime(video.currentTime);
            setProgress((video.currentTime / video.duration) * 100);
        };
        const onLoadedMetadata = () => {
            setDuration(video.duration);
        };
        const onEnded = () => {
            // Loop is handled by attribute, but good to know
        };

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('ended', onEnded);

        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('ended', onEnded);
        };
    }, []);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
        }
    };

    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const toggleFullscreen = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (videoRef.current) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                // Try container or video
                // For custom UI in fullscreen, we should maximize container?
                // But requested behavior "user clicks on video" -> "full screen video".
                // Native video fullscreen is best for mobile experience.
                if (videoRef.current.requestFullscreen) {
                    videoRef.current.requestFullscreen();
                } else {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    if (videoRef.current.webkitEnterFullscreen) {
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        videoRef.current.webkitEnterFullscreen();
                    }
                }
            }
        }
    };

    const togglePiP = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (videoRef.current && document.pictureInPictureEnabled) {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await videoRef.current.requestPictureInPicture();
            }
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        const time = (parseFloat(e.target.value) / 100) * duration;
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setProgress(parseFloat(e.target.value));
        }
    }

    // Mobile Click Handler -> Fullscreen
    // Desktop Click Handler -> Toggle Play (Wait, user said "only user clicks... fullscreen").
    // If user clicks, it goes full screen.
    // So standard behavior: Click container -> Fullscreen.
    const handleContainerClick = () => {
        if (videoRef.current) {
            if (videoRef.current.requestFullscreen) {
                videoRef.current.requestFullscreen();
            } else {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                if (videoRef.current.webkitEnterFullscreen) {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    videoRef.current.webkitEnterFullscreen();
                }
            }
        }
    };

    return (
        <div
            ref={containerRef}
            className={cn("relative group overflow-hidden cursor-pointer", className)}
            onClick={handleContainerClick}
        >
            <video
                ref={videoRef}
                src={src}
                poster={poster}
                className="w-auto h-auto max-w-full max-h-[450px] md:max-h-[600px] object-contain block"
                loop
                muted={isMuted}
                playsInline
            />

            {/* --- MOBILE / IDLE OVERLAY --- */}
            {/* Show when NOT hovering on desktop (md hidden group-hover) OR always on mobile (md:hidden) */}

            {/* Bottom Left: Countdown */}
            <div className={cn(
                "absolute bottom-3 left-3 bg-black/60 px-1.5 py-0.5 rounded text-[11px] font-medium text-white transition-opacity duration-200",
                "md:group-hover:opacity-0" // Hide on desktop hover (replaced by full controls)
            )}>
                {formatTime(duration - currentTime)}
            </div>

            {/* Bottom Right: Mute Button (Mobile Only) */}
            <div className="md:hidden absolute bottom-3 right-3">
                <button
                    onClick={toggleMute}
                    className="bg-black/60 p-1.5 rounded-full text-white hover:bg-black/80 transition-colors"
                >
                    {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
            </div>


            {/* --- DESKTOP HOVER CONTROLS --- */}
            <div
                className="hidden md:flex absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent pt-8 pb-3 px-4 items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                onClick={(e) => e.stopPropagation()} // Prevent fullscreen click on controls
            >
                {/* Play/Pause */}
                <button onClick={togglePlay} className="text-white hover:text-gray-200">
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>

                {/* Volume */}
                <div className="flex items-center gap-2 group/volume">
                    <button onClick={toggleMute} className="text-white hover:text-gray-200">
                        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                </div>

                {/* Time / Progress */}
                <div className="text-xs text-white font-medium min-w-[35px]">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </div>

                {/* Seek Bar */}
                <div className="flex-1 mx-2 relative h-1 bg-white/30 rounded cursor-pointer group/seek">
                    <div
                        className="absolute top-0 left-0 h-full bg-blue-500 rounded transition-all"
                        style={{ width: `${progress}%` }}
                    />
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={progress}
                        onChange={handleSeek}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                </div>

                {/* Right Controls: PiP, Fullscreen */}
                <div className="flex items-center gap-3">
                    {/* PiP */}
                    <button onClick={togglePiP} className="text-white hover:text-gray-200" title="Picture in Picture">
                        <PictureInPicture size={18} />
                    </button>

                    {/* Fullscreen */}
                    <button onClick={toggleFullscreen} className="text-white hover:text-gray-200" title="Fullscreen">
                        <Maximize size={18} />
                    </button>
                </div>

            </div>
        </div>
    );
}
