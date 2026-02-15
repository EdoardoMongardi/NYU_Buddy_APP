'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { activityPostCreate } from '@/lib/firebase/functions';
import {
  ACTIVITY_CATEGORIES,
  CATEGORY_LABELS,
  ALLOWED_DURATIONS_HOURS,
  DURATION_LABELS,
  ActivityCategory,
} from '@/lib/schemas/activity';
import { useToast } from '@/hooks/use-toast';

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

  const charCount = body.length;
  const isValid = body.trim().length > 0 && body.length <= 140 && category !== '';

  const handleSubmit = async () => {
    if (!isValid || submitting || !user) return;

    setSubmitting(true);
    try {
      const result = await activityPostCreate({
        body: body.trim(),
        category,
        maxParticipants,
        expiresInHours: duration,
        locationName: locationName.trim() || null,
        locationLat: null,
        locationLng: null,
      });

      toast({
        title: 'Activity posted!',
        description: 'Your activity is now visible to others.',
      });

      router.push(`/post/${result.data.postId}`);
    } catch (err) {
      console.error('[CreatePost] Error:', err);
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
    <div className="max-w-md mx-auto pb-8">
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
          <p className={`text-right text-[12px] mt-1 ${charCount > 130 ? 'text-amber-500' : 'text-gray-400'}`}>
            {charCount}/140
          </p>
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
                className={`py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                  category === cat
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
                className={`flex-1 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
                  maxParticipants === n
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
                className={`py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                  duration === hrs
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
          className={`w-full py-3.5 rounded-xl text-[15px] font-semibold transition-all ${
            isValid && !submitting
              ? 'bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98] shadow-sm'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Posting...
            </span>
          ) : (
            'Post Activity'
          )}
        </button>
      </div>
    </div>
  );
}
