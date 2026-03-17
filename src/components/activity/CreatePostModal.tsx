/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Loader2, Image as ImageIcon, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import useGooglePlaces from 'react-google-autocomplete/lib/usePlacesAutocompleteService';
import { useAuth } from '@/lib/hooks/useAuth';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { activityPostCreate } from '@/lib/firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { useCreatePost } from '@/context/CreatePostContext';
import BottomSheet from '@/components/ui/BottomSheet';
import {
  ACTIVITY_CATEGORIES,
  CATEGORY_LABELS,
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

if (typeof window !== 'undefined' && typeof (window as unknown as Record<string, unknown>).google === 'undefined') {
  (window as unknown as Record<string, unknown>).google = undefined;
}

export default function CreatePostModal() {
  const { isCreateOpen, closeCreate } = useCreatePost();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalRoot(document.body); }, []);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ActivityCategory | ''>('');
  const [maxParticipants, setMaxParticipants] = useState(2);
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Media state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Panel / bottom sheet state
  const [showCategory, setShowCategory] = useState(false);
  const [activeSheet, setActiveSheet] = useState<'date' | 'time' | 'location' | 'participants' | null>(null);

  // Location search state
  const [locationQuery, setLocationQuery] = useState('');
  const [apiReady, setApiReady] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValid = title.trim().length > 0 && title.trim().length <= 20 && category !== '' && mediaFile !== null;

  // Google Places
  const { placesService, placePredictions, getPlacePredictions } = useGooglePlaces({
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    options: { types: ['establishment'], input: '' },
  });

  useEffect(() => {
    const check = () => {
      try {
        if (typeof google !== 'undefined' && google.maps?.places) setApiReady(true);
      } catch { /* google not defined yet */ }
    };
    check();
    const timer = setInterval(check, 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (locationQuery.length > 2 && apiReady) {
      getPlacePredictions({ input: locationQuery, types: ['establishment'] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationQuery, apiReady]);

  // Scroll lock
  useEffect(() => {
    if (isCreateOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isCreateOpen]);

  // Reset on open
  useEffect(() => {
    if (isCreateOpen) {
      setTitle('');
      setDescription('');
      setCategory('');
      setMaxParticipants(2);
      setEventDate('');
      setEventTime('');
      setLocationName('');
      setLocationLat(null);
      setLocationLng(null);
      setMediaFile(null);
      setMediaPreview(null);
      setMediaType(null);
      setShowCategory(false);
      setActiveSheet(null);
      setLocationQuery('');
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

  const handleSelectPlace = useCallback(async (placeId: string, description: string) => {
    if (!placesService) return;
    try {
      const details = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
        placesService.getDetails(
          { placeId, fields: ['name', 'formatted_address', 'geometry'] },
          (res, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && res) resolve(res);
            else reject(status);
          }
        );
      });
      const lat = details.geometry?.location?.lat();
      const lng = details.geometry?.location?.lng();
      setLocationName(details.name || description.split(',')[0]);
      setLocationLat(lat ?? null);
      setLocationLng(lng ?? null);
      setActiveSheet(null);
      setLocationQuery('');
    } catch (err) {
      console.error('[CreatePostModal] Place details error:', err);
      setLocationName(description.split(',')[0]);
      setActiveSheet(null);
      setLocationQuery('');
    }
  }, [placesService]);

  const computeExpiresInHours = (): number => {
    if (!eventDate) return 24;
    const dateStr = eventDate;
    const timeStr = eventTime || '23:59';
    const target = new Date(`${dateStr}T${timeStr}:00`);
    const now = new Date();
    const rawDiff = (target.getTime() - now.getTime()) / (1000 * 60 * 60);
    const diffHours = Math.max(1, Math.ceil(rawDiff) + 2);
    return Math.min(diffHours, 8760);
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

      const expiresInHours = computeExpiresInHours();
      const payload = {
        title: title.trim(),
        body: description.trim(),
        category,
        maxParticipants,
        expiresInHours,
        locationName: locationName.trim() || null,
        locationLat,
        locationLng,
        imageUrl,
        eventDate: eventDate || null,
        eventTime: eventTime || null,
      };
      await activityPostCreate(payload);

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

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTimeDisplay = (timeStr: string) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  if (!portalRoot || !isCreateOpen) return null;

  const predictions = placePredictions || [];

  return createPortal(
    <>
      <motion.div
        key="create-modal-main"
        className="fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Blurred backdrop */}
        <div className="fixed inset-0" onClick={() => closeCreate()}>
          <div className="absolute inset-0 bg-white/40 backdrop-blur-2xl" />
        </div>

        {/* Top bar: X and Post buttons */}
        <div className="relative z-[110] w-full flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top,12px),12px)] pb-2 flex-shrink-0">
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
          className="relative z-[105] w-[calc(100%-32px)] max-w-[420px] md:max-w-[520px] bg-white rounded-3xl shadow-2xl mt-2 overflow-hidden flex-shrink-0"
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* User info */}
          <div className="flex items-center gap-2.5 px-5 pt-5 pb-2">
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
          <div className="px-5 pt-2 pb-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Activity title"
              maxLength={20}
              className="w-full text-[18px] font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none"
            />
            <div className="flex justify-end mt-0.5">
              <span className={`text-[11px] ${title.length > 20 ? 'text-red-500' : 'text-gray-300'}`}>
                {title.length}/20
              </span>
            </div>
          </div>

          {/* Description textarea */}
          <div className="px-5 pb-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description (optional)"
              rows={3}
              maxLength={140}
              className="w-full text-[15px] text-gray-700 placeholder:text-gray-400 leading-relaxed resize-none focus:outline-none"
              style={{ minHeight: '70px' }}
            />
          </div>

          {/* Category pill */}
          <div className="px-5 pb-5">
            <button
              onClick={() => setShowCategory((prev) => !prev)}
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
              {showCategory && (
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
                        onClick={() => { setCategory(cat); setShowCategory(false); }}
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
          className="relative z-[105] w-[calc(100%-32px)] max-w-[420px] md:max-w-[520px] mt-3 flex-shrink-0"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveSheet('date')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-all border shadow-sm ${
                eventDate
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-white/90 text-gray-600 border-gray-200 hover:bg-white'
              }`}
            >
              📅 {eventDate ? formatDateDisplay(eventDate) : 'Date'}
            </button>

            <button
              onClick={() => setActiveSheet('time')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-all border shadow-sm ${
                eventTime
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-white/90 text-gray-600 border-gray-200 hover:bg-white'
              }`}
            >
              🕐 {eventTime ? formatTimeDisplay(eventTime) : 'Time'}
            </button>

            <button
              onClick={() => setActiveSheet('location')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-all border shadow-sm ${
                locationName.trim()
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-white/90 text-gray-600 border-gray-200 hover:bg-white'
              }`}
            >
              📍 {locationName.trim() || 'Location'}
            </button>

            <button
              onClick={() => setActiveSheet('participants')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-all border shadow-sm ${
                maxParticipants !== 2
                  ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-white/90 text-gray-600 border-gray-200 hover:bg-white'
              }`}
            >
              👥 {maxParticipants} {maxParticipants === 1 ? 'person' : 'people'}
            </button>
          </div>
        </motion.div>

        {/* Media section */}
        <motion.div
          className="relative z-[105] w-[calc(100%-32px)] max-w-[420px] md:max-w-[520px] mt-4 mb-8 flex-shrink-0"
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

      {/* ===== Bottom Sheets ===== */}

      {/* Date picker */}
      <BottomSheet open={activeSheet === 'date'} onClose={() => setActiveSheet(null)} title="Select Date">
        <div className="flex flex-col gap-4">
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[16px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
          />
          {eventDate && (
            <div className="flex gap-2">
              <button
                onClick={() => { setEventDate(''); setActiveSheet(null); }}
                className="flex-1 py-2.5 rounded-xl text-[14px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Clear
              </button>
              <button
                onClick={() => setActiveSheet(null)}
                className="flex-1 py-2.5 rounded-xl text-[14px] font-bold bg-violet-600 text-white hover:bg-violet-700"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Time picker */}
      <BottomSheet open={activeSheet === 'time'} onClose={() => setActiveSheet(null)} title="Select Time">
        <div className="flex flex-col gap-4">
          <input
            type="time"
            value={eventTime}
            onChange={(e) => setEventTime(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[16px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
          />
          {eventTime && (
            <div className="flex gap-2">
              <button
                onClick={() => { setEventTime(''); setActiveSheet(null); }}
                className="flex-1 py-2.5 rounded-xl text-[14px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Clear
              </button>
              <button
                onClick={() => setActiveSheet(null)}
                className="flex-1 py-2.5 rounded-xl text-[14px] font-bold bg-violet-600 text-white hover:bg-violet-700"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Location search */}
      <BottomSheet open={activeSheet === 'location'} onClose={() => { setActiveSheet(null); setLocationQuery(''); }} title="Search Location">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              placeholder="Search for a place..."
              autoFocus
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-[14px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
            />
          </div>

          {locationName && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-xl">
              <MapPin className="w-4 h-4 text-violet-600 flex-shrink-0" />
              <span className="text-[13px] text-violet-700 font-medium truncate flex-1">{locationName}</span>
              <button
                onClick={() => { setLocationName(''); setLocationLat(null); setLocationLng(null); }}
                className="text-violet-400 hover:text-violet-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="max-h-[300px] overflow-y-auto -mx-1 px-1">
            {predictions.length > 0 && predictions.map((p) => (
              <button
                key={p.place_id}
                className="w-full text-left py-3 px-2 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-start gap-3"
                onClick={() => handleSelectPlace(p.place_id, p.description)}
              >
                <div className="bg-gray-100 p-2 rounded-full flex-shrink-0 mt-0.5">
                  <MapPin className="h-3.5 w-3.5 text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-gray-900 truncate">
                    {p.structured_formatting?.main_text || p.description}
                  </p>
                  <p className="text-[12px] text-gray-500 truncate">
                    {p.structured_formatting?.secondary_text || ''}
                  </p>
                </div>
              </button>
            ))}

            {apiReady && locationQuery.length > 2 && predictions.length === 0 && (
              <p className="text-center text-[13px] text-gray-400 py-6">No places found</p>
            )}

            {locationQuery.length <= 2 && !locationName && (
              <p className="text-center text-[13px] text-gray-400 py-6">Type at least 3 characters to search</p>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* Participants */}
      <BottomSheet open={activeSheet === 'participants'} onClose={() => setActiveSheet(null)} title="Max Participants">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-gray-500">How many people can join (excluding you)?</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => { setMaxParticipants(n); setActiveSheet(null); }}
                className={`flex-1 py-3 rounded-xl text-[16px] font-semibold transition-all ${
                  maxParticipants === n
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>
    </>,
    portalRoot
  );
}
