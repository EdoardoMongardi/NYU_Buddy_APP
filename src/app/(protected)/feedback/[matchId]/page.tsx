'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Star, Loader2, CheckCircle } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from '@/lib/hooks/useAuth';

export default function FeedbackPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const matchId = params.matchId as string;

  const [didMeet, setDidMeet] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [wouldMeetAgain, setWouldMeetAgain] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!user || didMeet === null) return;

    setIsSubmitting(true);
    try {
      await setDoc(doc(getFirebaseDb(), 'feedback', `${matchId}_${user.uid}`), {
        matchId,
        uid: user.uid,
        didMeet,
        rating: didMeet ? rating : null,
        wouldMeetAgain: didMeet ? wouldMeetAgain : null,
        comment: comment.trim() || null,
        createdAt: serverTimestamp(),
      });

      setSubmitted(true);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-md mx-auto">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center py-12"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center"
          >
            <CheckCircle className="w-10 h-10 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Thanks for your feedback!
          </h2>
          <p className="text-gray-600 mb-6">
            Your feedback helps us improve NYU Buddy
          </p>
          <Button onClick={() => router.push('/')}>Find Another Buddy</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          How was your meetup?
        </h1>
        <p className="text-gray-600">
          Your feedback helps us improve the experience
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Did you meet? */}
            <div className="space-y-3">
              <Label>Did you meet up?</Label>
              <RadioGroup
                value={didMeet?.toString()}
                onValueChange={(v) => setDidMeet(v === 'true')}
                className="flex space-x-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="true" id="met-yes" />
                  <Label htmlFor="met-yes" className="font-normal">
                    Yes
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="false" id="met-no" />
                  <Label htmlFor="met-no" className="font-normal">
                    No
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Only show these if they did meet */}
            {didMeet === true && (
              <>
                {/* Rating */}
                <div className="space-y-3">
                  <Label>How was the experience?</Label>
                  <div className="flex space-x-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="focus:outline-none transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-8 h-8 ${
                            star <= rating
                              ? 'text-yellow-400 fill-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Would meet again */}
                <div className="space-y-3">
                  <Label>Would you meet them again?</Label>
                  <RadioGroup
                    value={wouldMeetAgain?.toString()}
                    onValueChange={(v) => setWouldMeetAgain(v === 'true')}
                    className="flex space-x-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="true" id="again-yes" />
                      <Label htmlFor="again-yes" className="font-normal">
                        Yes
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="false" id="again-no" />
                      <Label htmlFor="again-no" className="font-normal">
                        No
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </>
            )}

            {/* Comment */}
            <div className="space-y-3">
              <Label>
                Any comments? <span className="text-gray-400">(optional)</span>
              </Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your thoughts..."
                rows={3}
              />
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={didMeet === null || isSubmitting}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Submit Feedback'
              )}
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => router.push('/')}
            >
              Skip for now
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}