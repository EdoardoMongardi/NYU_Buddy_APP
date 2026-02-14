'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import ImageCropperModal from './ImageCropperModal';

interface ProfileAvatarProps {
    photoURL?: string | null;
    displayName?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    editable?: boolean;
    onImageSelect?: (file: File) => void;
    className?: string;
}

const sizeClasses = {
    xs: 'w-8 h-8',
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-24 h-24',
    xl: 'w-32 h-32',
};

const iconSizes = {
    xs: 'w-4 h-4',
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
};

const cameraIconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-7 h-7',
};

// NYU Buddy Default Avatar - A friendly mascot icon
function NYUBuddyIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Background circle with gradient */}
            <defs>
                <linearGradient id="buddyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#8B5CF6" />
                    <stop offset="100%" stopColor="#7C3AED" />
                </linearGradient>
            </defs>

            {/* Main head/body shape - friendly rounded */}
            <circle cx="50" cy="52" r="32" fill="white" />

            {/* Eyes - friendly and welcoming */}
            <ellipse cx="38" cy="48" rx="5" ry="6" fill="#7C3AED" />
            <ellipse cx="62" cy="48" rx="5" ry="6" fill="#7C3AED" />

            {/* Eye highlights */}
            <circle cx="36" cy="46" r="2" fill="white" />
            <circle cx="60" cy="46" r="2" fill="white" />

            {/* Friendly smile */}
            <path
                d="M35 60 Q50 72 65 60"
                stroke="#7C3AED"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
            />

            {/* Subtle cheeks for friendliness */}
            <circle cx="30" cy="56" r="4" fill="#DDD6FE" opacity="0.7" />
            <circle cx="70" cy="56" r="4" fill="#DDD6FE" opacity="0.7" />

            {/* NYU torch/flame accent on top */}
            <ellipse cx="50" cy="22" rx="8" ry="10" fill="#8B5CF6" />
            <ellipse cx="50" cy="20" rx="5" ry="7" fill="#A78BFA" />
            <ellipse cx="50" cy="18" rx="3" ry="4" fill="#C4B5FD" />
        </svg>
    );
}

export function ProfileAvatar({
    photoURL,
    displayName,
    size = 'md',
    editable = false,
    onImageSelect,
    className,
}: ProfileAvatarProps) {
    const [isHovering, setIsHovering] = useState(false);
    const [showCropper, setShowCropper] = useState(false);
    const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            // Create a URL for the raw image and show cropper
            const url = URL.createObjectURL(file);
            setRawImageUrl(url);
            setShowCropper(true);
        }
        // Reset input value so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleCropComplete = (croppedFile: File) => {
        // Clean up the raw image URL
        if (rawImageUrl) {
            URL.revokeObjectURL(rawImageUrl);
        }
        setRawImageUrl(null);
        setShowCropper(false);

        // Pass the cropped file to parent
        onImageSelect?.(croppedFile);
    };

    const handleCropCancel = () => {
        // Clean up the raw image URL
        if (rawImageUrl) {
            URL.revokeObjectURL(rawImageUrl);
        }
        setRawImageUrl(null);
        setShowCropper(false);
    };

    const handleClick = () => {
        if (editable && fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    return (
        <>
            <div
                className={cn(
                    'relative rounded-full overflow-hidden bg-gray-200',
                    sizeClasses[size],
                    editable && 'cursor-pointer',
                    className
                )}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                onClick={handleClick}
            >
                {photoURL ? (
                    <Image
                        src={photoURL}
                        alt={displayName || 'Profile picture'}
                        fill
                        className="object-cover"
                        sizes={`(max-width: 768px) ${size === 'xl' ? '128px' : size === 'lg' ? '96px' : size === 'md' ? '80px' : size === 'sm' ? '48px' : '32px'}`}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <NYUBuddyIcon className={iconSizes[size]} />
                    </div>
                )}

                {/* Editable overlay */}
                {editable && (
                    <>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <div
                            className={cn(
                                'absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity duration-200',
                                isHovering ? 'opacity-100' : 'opacity-0'
                            )}
                        >
                            <Camera className={cn('text-white', cameraIconSizes[size])} />
                        </div>
                    </>
                )}
            </div>

            {/* Image Cropper Modal */}
            {showCropper && rawImageUrl && (
                <ImageCropperModal
                    imageUrl={rawImageUrl}
                    onCropComplete={handleCropComplete}
                    onCancel={handleCropCancel}
                />
            )}
        </>
    );
}

// Export the default icon for use elsewhere
export { NYUBuddyIcon };
