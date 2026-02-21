/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/lib/hooks/useAuth';
import { activityPostCreate } from '@/lib/firebase/functions';
import { useToast } from '@/hooks/use-toast';
import {
  ACTIVITY_CATEGORIES,
  CATEGORY_LABELS,
  ALLOWED_DURATIONS_HOURS,
  DURATION_LABELS,
  ActivityCategory,
} from '@/lib/schemas/activity';

export default function CreatePostPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [body, setBody] = useState('');
  const [category, setCategory] = useState<ActivityCategory | ''>('');
  const [maxParticipants, setMaxParticipants] = useState(2);
  const [duration, setDuration] = useState<number>(4);
  const [locationName, setLocationName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Media state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const charCount = body.length;
  const isValid = body.trim().length > 0 && body.length <= 140 && category !== '';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast({ title: 'Invalid file type', description: 'Please select an image or video.', variant: 'destructive' });
      return;
    }

    // Validate video duration
    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = function () {
        window.URL.revokeObjectURL(video.src);
        if (video.duration > 10) {
          toast({ title: 'Video too long', description: 'Video must be 10 seconds or less.', variant: 'destructive' });
          setMediaFile(null);
          setMediaPreview(null);
          setMediaType(null);
        } else {
          setMediaType('video');
          setMediaFile(file);
          setMediaPreview(URL.createObjectURL(file));
        }
      }
      video.src = URL.createObjectURL(file);
    } else {
      setMediaType('image');
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
    }
  };

  const removeMedia = () => {
    setMediaFile(null);
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaPreview(null);
    setMediaType(null);
  };

  const handleSubmit = async () => {
    if (!isValid || submitting || !user) return;

    setSubmitting(true);
    let imageUrl = null;

    try {
      // Upload media if present
      if (mediaFile) {
        setIsUploading(true);
        const storage = getStorage();
        const storageRef = ref(storage, `activity_media/${user.uid}/${Date.now()}_${mediaFile.name}`);
        await uploadBytes(storageRef, mediaFile);
        imageUrl = await getDownloadURL(storageRef);
        setIsUploading(false);
      }

      await activityPostCreate({
        body: body.trim(),
        category,
        maxParticipants,
        expiresInHours: duration,
        locationName: locationName.trim() || null,
        locationLat: null,
        locationLng: null,
        imageUrl: imageUrl, // Pass the URL (works for video too, stored in imageUrl field)
      });

      toast({
        title: 'Activity posted!',
        description: 'Your activity is now visible to others.',
      });

      router.push(`/`);
    } catch (err) {
      console.error('[CreatePost] Error:', err);
      setIsUploading(false);
      toast({
        title: 'Failed to create post',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto pb-8 px-5">
      {/* Header */}
      <div className="flex items-center gap-3 py-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">New Activity</h1>
      </div>

      <div className="space-y-5">
        {/* Body */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">
            What do you want to do?
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g., Looking for someone to grab coffee at Think Coffee..."
            rows={3}
            maxLength={140}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[15px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 resize-none transition-all"
          />
          <div className="flex justify-between items-center mt-2">
            {/* Media Upload Button */}
            <div className="flex items-center">
              <input
                type="file"
                id="media-upload"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <label
                htmlFor="media-upload"
                className="flex items-center gap-1.5 text-violet-600 text-sm font-medium cursor-pointer hover:text-violet-700 transition-colors"
              >
                <ImageIcon className="w-4 h-4" />
                Add Photo/Video
              </label>
            </div>
            <p className={`text-[12px] ${charCount > 130 ? 'text-amber-500' : 'text-gray-400'}`}>
              {charCount}/140
            </p>
          </div>

          {/* Media Preview */}
          {mediaPreview && (
            <div className="mt-3 relative rounded-xl overflow-hidden border border-gray-100 bg-black">
              <button
                onClick={removeMedia}
                className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70 transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>
              {mediaType === 'video' ? (
                <video src={mediaPreview} controls className="w-full max-h-[300px] object-contain" />
              ) : (
                <img src={mediaPreview} alt="Preview" className="w-full max-h-[300px] object-contain" />
              )}
            </div>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Category
          </label>
          <div className="grid grid-cols-4 gap-2">
            {ACTIVITY_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`py-2.5 rounded-xl text-[13px] font-medium transition-all ${category === cat
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Participants */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Max Participants (excluding you)
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setMaxParticipants(n)}
                className={`flex-1 py-2.5 rounded-xl text-[14px] font-medium transition-all ${maxParticipants === n
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Active for
          </label>
          <div className="grid grid-cols-3 gap-2">
            {ALLOWED_DURATIONS_HOURS.map((hrs) => (
              <button
                key={hrs}
                onClick={() => setDuration(hrs)}
                className={`py-2.5 rounded-xl text-[13px] font-medium transition-all ${duration === hrs
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {DURATION_LABELS[hrs]}
              </button>
            ))}
          </div>
        </div>

        {/* Location (optional) */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">
            Location <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g., Bobst Library, Think Coffee"
              maxLength={60}
              className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-[15px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className={`w-full py-3.5 rounded-xl text-[15px] font-semibold transition-all ${isValid && !submitting
            ? 'bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98] shadow-sm'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {isUploading ? 'Uploading Media...' : 'Posting...'}
            </span>
          ) : (
            'Post Activity'
          )}
        </button>
      </div>
    </div>
  );
}
