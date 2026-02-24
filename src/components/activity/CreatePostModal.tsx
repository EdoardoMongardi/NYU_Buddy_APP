/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Loader2, Image as ImageIcon, Ellipsis } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/lib/hooks/useAuth';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { activityPostCreate } from '@/lib/firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { useCreatePost } from '@/context/CreatePostContext';
import {
  ACTIVITY_CATEGORIES,
  CATEGORY_LABELS,
  ALLOWED_DURATIONS_HOURS,
  DURATION_LABELS,
  ActivityCategory,
} from '@/lib/schemas/activity';

const CATEGORY_EMOJIS: Record<string, string> = {
  coffee: '☕',
  study: '📚',
  food: '🍕',
  event: '🎉',
  explore: '🗺️',
  sports: '⚽',
  other: '✨',
};

export default function CreatePostModal() {
  const { isCreateOpen, closeCreate } = useCreatePost();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalRoot(document.body); }, []);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ActivityCategory | ''>('');
  const [maxParticipants, setMaxParticipants] = useState(2);
  const [duration, setDuration] = useState<number>(4);
  const [locationName, setLocationName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [activePanel, setActivePanel] = useState<'category' | 'duration' | 'location' | 'participants' | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValid = title.trim().length > 0 && title.length <= 140 && category !== '' && mediaFile !== null;

  useEffect(() => {
    if (isCreateOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isCreateOpen]);

  useEffect(() => {
    if (isCreateOpen) {
      setTitle('');
      setCategory('');
      setMaxParticipants(2);
      setDuration(4);
      setLocationName('');
      setMediaFile(null);
      setMediaPreview(null);
      setMediaType(null);
      setActivePanel(null);
      setSubmitting(false);
    }
  }, [isCreateOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast({ title: 'Invalid file type', description: 'Please select an image or video.', variant: 'destructive' });
      return;
    }

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = function () {
        window.URL.revokeObjectURL(video.src);
        if (video.duration > 10) {
          toast({ title: 'Video too long', description: 'Video must be 10 seconds or less.', variant: 'destructive' });
        } else {
          setMediaType('video');
          setMediaFile(file);
          setMediaPreview(URL.createObjectURL(file));
        }
      };
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

  const togglePanel = (panel: typeof activePanel) => {
    setActivePanel(prev => prev === panel ? null : panel);
  };

  const handleSubmit = async () => {
    if (!isValid || submitting || !user) return;

    setSubmitting(true);
    let imageUrl: string | null = null;

    try {
      if (mediaFile) {
        setIsUploading(true);
        const storage = getStorage();
        const storageRef = ref(storage, `activity_media/${user.uid}/${Date.now()}_${mediaFile.name}`);
        await uploadBytes(storageRef, mediaFile);
        imageUrl = await getDownloadURL(storageRef);
        setIsUploading(false);
      }

      await activityPostCreate({
        body: title.trim(),
        category,
        maxParticipants,
        expiresInHours: duration,
        locationName: locationName.trim() || null,
        locationLat: null,
        locationLng: null,
        imageUrl,
      });

      toast({ title: 'Activity posted!', description: 'Your activity is now visible to others.' });
      window.dispatchEvent(new Event('activityPostCreated'));
      closeCreate();
    } catch (err) {
      console.error('[CreatePostModal] Error:', err);
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

  if (!portalRoot || !isCreateOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex flex-col items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Blurred backdrop */}
        <div className="absolute inset-0" onClick={closeCreate}>
          <div className="absolute inset-0 bg-white/40 backdrop-blur-2xl" />
        </div>

        {/* Top bar: X and Post buttons */}
        <div className="relative z-[110] w-full flex items-center justify-between px-4 mt-[max(env(safe-area-inset-top,12px),12px)]">
          <button
            onClick={closeCreate}
            className="w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <X className="w-[18px] h-[18px] text-gray-800" />
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className={`px-5 py-2 rounded-full text-[14px] font-bold transition-all ${
              isValid && !submitting
                ? 'bg-violet-600 text-white hover:bg-violet-700 active:scale-95 shadow-lg'
                : 'bg-gray-200/80 text-gray-400 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {isUploading ? 'Uploading...' : 'Posting...'}
              </span>
            ) : (
              'Post'
            )}
          </button>
        </div>

        {/* Main white card */}
        <motion.div
          className="relative z-[105] w-[calc(100%-32px)] max-w-[420px] md:max-w-[520px] bg-white rounded-3xl shadow-2xl mt-4 overflow-hidden"
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* User info */}
          <div className="flex items-center gap-2.5 px-5 pt-5 pb-1">
            <ProfileAvatar
              photoURL={userProfile?.photoURL}
              displayName={userProfile?.displayName || ''}
              size="sm"
              className="w-10 h-10 flex-shrink-0"
            />
            <span className="text-[15px] font-semibold text-gray-900">
              {userProfile?.displayName?.split(' ')[0] || 'You'}
            </span>
          </div>

          {/* Activity Title input */}
          <div className="px-5 pt-3 pb-1">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's next for you?"
              rows={6}
              maxLength={140}
              className="w-full text-[17px] text-gray-800 placeholder:text-gray-400 leading-relaxed resize-none focus:outline-none"
              style={{ minHeight: '160px' }}
              autoFocus
            />
          </div>

          {/* Category pill inside the card */}
          <div className="px-5 pb-5">
            <button
              onClick={() => togglePanel('category')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold transition-all border ${
                category
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <span>{category ? CATEGORY_EMOJIS[category] || '🤔' : '🤔'}</span>
              <span>{category ? CATEGORY_LABELS[category] : 'What to do'}</span>
            </button>

            <AnimatePresence>
              {activePanel === 'category' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-4 gap-2 pt-3">
                    {ACTIVITY_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => { setCategory(cat); setActivePanel(null); }}
                        className={`py-2 rounded-xl text-[11px] font-medium transition-all ${
                          category === cat
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {CATEGORY_EMOJIS[cat]} {CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Action pills below card */}
        <motion.div
          className="relative z-[105] w-[calc(100%-32px)] max-w-[420px] md:max-w-[520px] mt-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => togglePanel('duration')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-all border shadow-sm ${
                activePanel === 'duration'
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-white/90 text-gray-600 border-gray-200 hover:bg-white'
              }`}
            >
              📅 {DURATION_LABELS[duration] || 'Date'}
            </button>

            <button
              onClick={() => togglePanel('location')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-all border shadow-sm ${
                locationName.trim()
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : activePanel === 'location'
                    ? 'bg-violet-50 text-violet-700 border-violet-200'
                    : 'bg-white/90 text-gray-600 border-gray-200 hover:bg-white'
              }`}
            >
              📍 {locationName.trim() || 'Location'}
            </button>

            <button
              onClick={() => togglePanel('participants')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-all border shadow-sm ${
                activePanel === 'participants'
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-white/90 text-gray-600 border-gray-200 hover:bg-white'
              }`}
            >
              <Ellipsis className="w-4 h-4" />
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activePanel === 'duration' && (
              <motion.div
                key="duration"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-3 gap-2 pt-3">
                  {ALLOWED_DURATIONS_HOURS.map((hrs) => (
                    <button
                      key={hrs}
                      onClick={() => { setDuration(hrs); setActivePanel(null); }}
                      className={`py-2.5 rounded-xl text-[12px] font-medium transition-all ${
                        duration === hrs
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'bg-white/90 text-gray-600 hover:bg-white border border-gray-200'
                      }`}
                    >
                      {DURATION_LABELS[hrs]}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {activePanel === 'location' && (
              <motion.div
                key="location"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="pt-3">
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="e.g., Bobst Library, Think Coffee"
                      maxLength={60}
                      autoFocus
                      className="w-full bg-white/90 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-[14px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {activePanel === 'participants' && (
              <motion.div
                key="participants"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="pt-3">
                  <p className="text-[12px] text-white/70 font-medium mb-2">Max participants (excluding you)</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => { setMaxParticipants(n); setActivePanel(null); }}
                        className={`flex-1 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
                          maxParticipants === n
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'bg-white/90 text-gray-600 hover:bg-white border border-gray-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Media section */}
        <motion.div
          className="relative z-[105] w-[calc(100%-32px)] max-w-[420px] md:max-w-[520px] mt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {mediaPreview ? (
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 shadow-md">
              <button
                onClick={removeMedia}
                className="absolute top-1 right-1 bg-black/50 text-white p-0.5 rounded-full z-10"
              >
                <X className="w-3 h-3" />
              </button>
              {mediaType === 'video' ? (
                <video src={mediaPreview} className="w-full h-full object-cover" />
              ) : (
                <img src={mediaPreview} alt="" className="w-full h-full object-cover" />
              )}
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-2xl bg-gray-100/80 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 hover:bg-gray-200/80 transition-colors shadow-sm"
            >
              <ImageIcon className="w-5 h-5 text-gray-400" />
              <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">Photo *</span>
            </button>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    portalRoot
  );
}
