'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { activityPostGetById, joinRequestSend, FeedPost } from '@/lib/firebase/functions';
import { ChevronLeft, Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';

export default function JoinRequestPage() {
    const router = useRouter();
    const params = useParams();
    const postId = params.postId as string;
    const { toast } = useToast();

    const [post, setPost] = useState<FeedPost | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        async function fetchPost() {
            try {
                const res = await activityPostGetById({ postId });
                setPost(res.data.post);
            } catch (err) {
                console.error('Failed to fetch post:', err);
                toast({ title: 'Post not found', variant: 'destructive' });
                router.back();
            } finally {
                setLoading(false);
            }
        }
        if (postId) {
            fetchPost();
        }
    }, [postId, router, toast]);

    const handleSubmit = async () => {
        if (message.length > 200) return;
        setSubmitting(true);
        try {
            await joinRequestSend({
                postId,
                message: message.trim() || undefined,
            });
            toast({
                title: 'Request Sent!',
                description: 'The creator has been notified of your request to join.',
            });
            router.push('/');
        } catch (err: unknown) {
            console.error('Failed to send join request:', err);
            toast({
                title: 'Error sending request',
                description: err instanceof Error ? err.message : 'Please try again later.',
                variant: 'destructive',
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
            </div>
        );
    }

    if (!post) return null;

    return (
        <div className="min-h-screen bg-white">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-4 py-3">
                <button
                    onClick={() => router.back()}
                    className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                    <ChevronLeft className="w-6 h-6 text-gray-900" />
                </button>
                <h1 className="text-[17px] font-semibold text-gray-900 absolute left-1/2 -translate-x-1/2">
                    Request to Join
                </h1>
                <div className="w-10"></div> {/* Spacer for centering */}
            </div>

            <div className="max-w-[600px] mx-auto p-4 flex flex-col gap-6 mt-2">
                {/* Context: The Post summary */}
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                        <ProfileAvatar photoURL={post.creatorPhotoURL} displayName={post.creatorDisplayName} size="md" />
                        <div>
                            <p className="font-semibold text-gray-900 text-[15px]">{post.creatorDisplayName}</p>
                            <p className="text-gray-500 text-[13px]">is hosting an activity</p>
                        </div>
                    </div>
                    <p className="text-gray-900 text-[15px] leading-relaxed line-clamp-3">
                        {post.body}
                    </p>
                </div>

                {/* Message Input */}
                <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Introduce yourself (Optional)
                    </label>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={200}
                        placeholder="Hi! I'd love to join because..."
                        rows={5}
                        className="w-full bg-white border border-gray-200 rounded-xl p-4 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 resize-none"
                    />
                    <div className="mt-2 text-right text-[12px] text-gray-400">
                        {message.length} / 200
                    </div>
                </div>

                {/* Submit Button */}
                <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full bg-violet-600 text-white rounded-xl py-3.5 text-[16px] font-semibold hover:bg-violet-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                    {submitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            <Send className="w-5 h-5" />
                            Send Request
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
