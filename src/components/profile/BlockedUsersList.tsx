'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, getDoc, doc, deleteDoc, Timestamp } from 'firebase/firestore';
import { Loader2, ShieldOff } from 'lucide-react';
import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface BlockedUser {
    uid: string;
    blockedAt: Timestamp;
    displayName?: string;
    photoURL?: string;
}

export function BlockedUsersList() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [unblockingId, setUnblockingId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const db = getFirebaseDb();
        const blocksRef = collection(db, 'blocks', user.uid, 'blocked');

        const unsubscribe = onSnapshot(blocksRef, async (snapshot) => {
            // Create promises to fetch user details
            const userPromises = snapshot.docs.map(async (blockDoc) => {
                const uid = blockDoc.id;
                const data = blockDoc.data();

                try {
                    const userDoc = await getDoc(doc(db, 'users', uid));
                    const userData = userDoc.data();

                    return {
                        uid,
                        blockedAt: data.blockedAt,
                        displayName: userData?.displayName || 'Unknown User',
                        photoURL: userData?.photoURL,
                    };
                } catch (err) {
                    console.error(`Failed to fetch user details for ${uid}`, err);
                    return {
                        uid,
                        blockedAt: data.blockedAt,
                        displayName: 'Unknown User',
                    };
                }
            });

            const resolvedUsers = await Promise.all(userPromises);
            setBlockedUsers(resolvedUsers);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleUnblock = async (targetUid: string, targetName: string) => {
        if (!user) return;

        if (!confirm(`Are you sure you want to unblock ${targetName}?`)) return;

        setUnblockingId(targetUid);
        try {
            await deleteDoc(doc(getFirebaseDb(), 'blocks', user.uid, 'blocked', targetUid));
            toast({
                title: "User unblocked",
                description: `${targetName} can now match with you again.`,
            });
        } catch (err) {
            console.error('Failed to unblock:', err);
            toast({
                title: "Error",
                description: "Failed to unblock user. Please try again.",
                variant: "destructive",
            });
        } finally {
            setUnblockingId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (blockedUsers.length === 0) {
        return (
            <div className="text-center py-12">
                <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ShieldOff className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">No blocked users</h3>
                <p className="text-gray-500 max-w-sm mx-auto mt-2">
                    You haven&apos;t blocked anyone yet. Blocked users will appear here.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {blockedUsers.map((blockedUser) => (
                <Card key={blockedUser.uid}>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <ProfileAvatar
                                displayName={blockedUser.displayName}
                                photoURL={blockedUser.photoURL}
                            />
                            <div>
                                <p className="font-medium text-gray-900">{blockedUser.displayName}</p>
                                <p className="text-xs text-gray-500">
                                    Blocked {blockedUser.blockedAt?.toDate().toLocaleDateString()}
                                </p>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnblock(blockedUser.uid, blockedUser.displayName || 'this user')}
                            disabled={unblockingId === blockedUser.uid}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        >
                            {unblockingId === blockedUser.uid ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                'Unblock'
                            )}
                        </Button>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
