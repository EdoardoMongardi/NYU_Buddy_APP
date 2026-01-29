'use client';

import { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { X, Check, ZoomIn, ZoomOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface ImageCropperModalProps {
    imageUrl: string;
    onCropComplete: (croppedFile: File) => void;
    onCancel: () => void;
}

// Creates a canvas and returns a cropped image as a File
async function getCroppedImg(
    imageSrc: string,
    pixelCrop: Area
): Promise<File> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('No 2d context');
    }

    // Set canvas size to the cropped area
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    // Draw the cropped image
    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
    );

    // Convert canvas to blob, then to File
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Canvas is empty'));
                return;
            }
            const file = new File([blob], 'profile-picture.png', { type: 'image/png' });
            resolve(file);
        }, 'image/png', 0.95);
    });
}

function createImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.src = url;
    });
}

export default function ImageCropperModal({
    imageUrl,
    onCropComplete,
    onCancel,
}: ImageCropperModalProps) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const onCropChange = useCallback((crop: { x: number; y: number }) => {
        setCrop(crop);
    }, []);

    const onZoomChange = useCallback((zoom: number) => {
        setZoom(zoom);
    }, []);

    const onCropAreaComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleConfirm = async () => {
        if (!croppedAreaPixels) return;

        setIsProcessing(true);
        try {
            const croppedFile = await getCroppedImg(imageUrl, croppedAreaPixels);
            onCropComplete(croppedFile);
        } catch (e) {
            console.error('Error cropping image:', e);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Adjust Photo</h3>
                    <button
                        onClick={onCancel}
                        className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Cropper Area */}
                <div className="relative w-full h-80 bg-gray-900">
                    <Cropper
                        image={imageUrl}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={onCropChange}
                        onZoomChange={onZoomChange}
                        onCropComplete={onCropAreaComplete}
                    />
                </div>

                {/* Zoom Controls */}
                <div className="px-6 py-4 border-t border-gray-200">
                    <div className="flex items-center gap-3">
                        <ZoomOut className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <Slider
                            value={[zoom]}
                            min={1}
                            max={3}
                            step={0.1}
                            onValueChange={(value: number[]) => setZoom(value[0])}
                            className="flex-1"
                        />
                        <ZoomIn className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 px-4 pb-4">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        className="flex-1"
                        disabled={isProcessing}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className="flex-1 bg-violet-600 hover:bg-violet-700"
                        disabled={isProcessing}
                    >
                        {isProcessing ? (
                            'Processing...'
                        ) : (
                            <>
                                <Check className="w-4 h-4 mr-2" />
                                Apply
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
