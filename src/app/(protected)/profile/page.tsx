'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, User, Heart, Coffee, ArrowLeft, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import {
    onboardingSchema,
    OnboardingFormData,
    ACTIVITIES,
    INTERESTS,
} from '@/lib/schemas/user';
import { useToast } from '@/hooks/use-toast';

export default function ProfilePage() {
    const { user, userProfile, refreshUserProfile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors, isDirty },
    } = useForm<OnboardingFormData>({
        resolver: zodResolver(onboardingSchema),
        defaultValues: {
            displayName: '',
            interests: [],
            preferredActivities: [],
        },
    });

    // Load existing profile data
    useEffect(() => {
        if (userProfile) {
            reset({
                displayName: userProfile.displayName || '',
                interests: userProfile.interests || [],
                preferredActivities: userProfile.preferredActivities || [],
            });
        }
    }, [userProfile, reset]);

    const selectedInterests = watch('interests');
    const selectedActivities = watch('preferredActivities');

    const toggleInterest = (interest: string) => {
        const current = selectedInterests || [];
        if (current.includes(interest)) {
            setValue(
                'interests',
                current.filter((i) => i !== interest),
                { shouldDirty: true }
            );
        } else if (current.length < 10) {
            setValue('interests', [...current, interest], { shouldDirty: true });
        }
    };

    const toggleActivity = (activity: string) => {
        const current = selectedActivities || [];
        if (current.includes(activity)) {
            setValue(
                'preferredActivities',
                current.filter((a) => a !== activity),
                { shouldDirty: true }
            );
        } else if (current.length < 5) {
            setValue('preferredActivities', [...current, activity], { shouldDirty: true });
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
                updatedAt: serverTimestamp(),
            });

            await refreshUserProfile();

            toast({
                title: "Profile updated",
                description: "Your changes have been saved successfully.",
            });

            router.push('/');
        } catch (error) {
            console.error('Failed to save profile:', error);
            toast({
                title: "Error",
                description: "Failed to save profile. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!userProfile) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.back()}
                    className="rounded-full"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
                    Edit Profile
                </h1>
            </div>

            <form onSubmit={handleSubmit(onSubmit)}>
                <Tabs defaultValue="basics" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-6">
                        <TabsTrigger value="basics">Basics</TabsTrigger>
                        <TabsTrigger value="interests">Interests</TabsTrigger>
                        <TabsTrigger value="activities">Activities</TabsTrigger>
                    </TabsList>

                    <TabsContent value="basics">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <User className="w-5 h-5 text-violet-600" />
                                    Basic Info
                                </CardTitle>
                                <CardDescription>
                                    How you appear to other students
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-center mb-6">
                                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold">
                                        {watch('displayName')?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase()}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="displayName">Display Name</Label>
                                    <Input
                                        id="displayName"
                                        placeholder="Your name"
                                        {...register('displayName')}
                                    />
                                    {errors.displayName && (
                                        <p className="text-sm text-red-500">
                                            {errors.displayName.message}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input
                                        disabled
                                        value={user?.email || ''}
                                        className="bg-gray-50"
                                    />
                                    <p className="text-xs text-gray-500">
                                        Email cannot be changed
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="interests">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Heart className="w-5 h-5 text-violet-600" />
                                    Your Interests
                                </CardTitle>
                                <CardDescription>
                                    Select up to 10 topics you enjoy
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-2 justify-center mb-4">
                                    {INTERESTS.map((interest) => (
                                        <Badge
                                            key={interest}
                                            variant={
                                                selectedInterests?.includes(interest)
                                                    ? 'default'
                                                    : 'outline'
                                            }
                                            className={`cursor-pointer transition-all ${selectedInterests?.includes(interest)
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
                                    <p className="text-sm text-red-500 text-center mb-2">
                                        {errors.interests.message}
                                    </p>
                                )}
                                <p className="text-sm text-center text-gray-500">
                                    Selected: {selectedInterests?.length || 0}/10
                                </p>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="activities">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Coffee className="w-5 h-5 text-violet-600" />
                                    Preferred Activities
                                </CardTitle>
                                <CardDescription>
                                    What you like to do with buddies
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-2 justify-center mb-4">
                                    {ACTIVITIES.map((activity) => (
                                        <Badge
                                            key={activity}
                                            variant={
                                                selectedActivities?.includes(activity)
                                                    ? 'default'
                                                    : 'outline'
                                            }
                                            className={`cursor-pointer transition-all px-4 py-2 text-base ${selectedActivities?.includes(activity)
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
                                    <p className="text-sm text-red-500 text-center mb-2">
                                        {errors.preferredActivities.message}
                                    </p>
                                )}
                                <p className="text-sm text-center text-gray-500">
                                    Selected: {selectedActivities?.length || 0}/5
                                </p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* Footer Actions */}
                <motion.div
                    className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-200"
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                >
                    <div className="max-w-md mx-auto flex gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1"
                            onClick={() => router.back()}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="flex-[2] bg-gradient-to-r from-violet-600 to-purple-600"
                            disabled={isLoading || !isDirty}
                        >
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Save className="h-4 w-4 mr-2" />
                            )}
                            Save Changes
                        </Button>
                    </div>
                </motion.div>

                {/* Spacer for fixed footer */}
                <div className="h-24" />
            </form>
        </div>
    );
}
