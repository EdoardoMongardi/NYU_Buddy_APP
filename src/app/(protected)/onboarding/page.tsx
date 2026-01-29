'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, User, Heart, Coffee } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  onboardingSchema,
  OnboardingFormData,
  ACTIVITIES,
  INTERESTS,
} from '@/lib/schemas/user';

export default function OnboardingPage() {
  const { user, refreshUserProfile } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      displayName: '',
      interests: [],
      preferredActivities: [],
    },
  });

  const selectedInterests = watch('interests');
  const selectedActivities = watch('preferredActivities');

  const toggleInterest = (interest: string) => {
    const current = selectedInterests || [];
    if (current.includes(interest)) {
      setValue(
        'interests',
        current.filter((i) => i !== interest)
      );
    } else if (current.length < 10) {
      setValue('interests', [...current, interest]);
    }
  };

  const toggleActivity = (activity: string) => {
    const current = selectedActivities || [];
    if (current.includes(activity)) {
      setValue(
        'preferredActivities',
        current.filter((a) => a !== activity)
      );
    } else if (current.length < 5) {
      setValue('preferredActivities', [...current, activity]);
    }
  };

  const onSubmit = async (data: OnboardingFormData) => {
    if (!user) return;

    setIsLoading(true);
    try {
      await updateDoc(doc(getFirebaseDb(), 'users', user.uid), {
        displayName: data.displayName,
        interests: data.interests,
        preferredActivities: data.preferredActivities,
        profileCompleted: true,
        updatedAt: serverTimestamp(),
      });

      await refreshUserProfile();
      router.push('/');
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const nextStep = () => {
    if (step < 3) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Card className="shadow-xl border-0">
          <CardHeader className="text-center">
            <div className="flex justify-center space-x-2 mb-4">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    s <= step ? 'bg-violet-600' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <CardTitle className="text-2xl">
              {step === 1 && 'Welcome to NYU Buddy!'}
              {step === 2 && 'What are you interested in?'}
              {step === 3 && 'What do you like to do?'}
            </CardTitle>
            <CardDescription>
              {step === 1 && "Let's set up your profile"}
              {step === 2 && 'Select your interests to find like-minded buddies'}
              {step === 3 && 'Choose activities you enjoy with others'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)}>
              {/* Step 1: Display Name */}
              {step === 1 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                      <User className="w-10 h-10 text-white" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      placeholder="How should we call you?"
                      {...register('displayName')}
                    />
                    {errors.displayName && (
                      <p className="text-sm text-red-500">
                        {errors.displayName.message}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    onClick={nextStep}
                    className="w-full bg-gradient-to-r from-violet-600 to-purple-600"
                    disabled={!watch('displayName')}
                  >
                    Continue
                  </Button>
                </motion.div>
              )}

              {/* Step 2: Interests */}
              {step === 2 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div className="flex justify-center mb-4">
                    <Heart className="w-12 h-12 text-violet-600" />
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {INTERESTS.map((interest) => (
                      <Badge
                        key={interest}
                        variant={
                          selectedInterests?.includes(interest)
                            ? 'default'
                            : 'outline'
                        }
                        className={`cursor-pointer transition-all ${
                          selectedInterests?.includes(interest)
                            ? 'bg-violet-600 hover:bg-violet-700'
                            : 'hover:bg-violet-100'
                        }`}
                        onClick={() => toggleInterest(interest)}
                      >
                        {interest}
                      </Badge>
                    ))}
                  </div>
                  {errors.interests && (
                    <p className="text-sm text-red-500 text-center">
                      {errors.interests.message}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 text-center">
                    Selected: {selectedInterests?.length || 0}/10
                  </p>
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={prevStep}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={nextStep}
                      className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600"
                      disabled={!selectedInterests?.length}
                    >
                      Continue
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Activities */}
              {step === 3 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <div className="flex justify-center mb-4">
                    <Coffee className="w-12 h-12 text-violet-600" />
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {ACTIVITIES.map((activity) => (
                      <Badge
                        key={activity}
                        variant={
                          selectedActivities?.includes(activity)
                            ? 'default'
                            : 'outline'
                        }
                        className={`cursor-pointer transition-all px-4 py-2 text-base ${
                          selectedActivities?.includes(activity)
                            ? 'bg-violet-600 hover:bg-violet-700'
                            : 'hover:bg-violet-100'
                        }`}
                        onClick={() => toggleActivity(activity)}
                      >
                        {activity}
                      </Badge>
                    ))}
                  </div>
                  {errors.preferredActivities && (
                    <p className="text-sm text-red-500 text-center">
                      {errors.preferredActivities.message}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 text-center">
                    Selected: {selectedActivities?.length || 0}/5
                  </p>
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={prevStep}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600"
                      disabled={isLoading || !selectedActivities?.length}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Complete Setup'
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}