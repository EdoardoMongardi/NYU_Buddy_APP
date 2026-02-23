import { useState, useEffect } from 'react';
import { collection, query, limit, onSnapshot, orderBy, where, or } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { useAuth } from '@/lib/hooks/useAuth';

export function useUnreadBadges(activeTab: string) {
    const { user } = useAuth();
    const [badges, setBadges] = useState({
        home: false,
        manage: false,
        search: false,
    });

    // Update last seen timestamp whenever the user visits a tab
    useEffect(() => {
        if (typeof window !== 'undefined' && user) {
            if (activeTab === 'home' || activeTab === 'manage' || activeTab === 'search') {
                // Instantly clear the badge for the tab we just switched to
                setBadges(prev => ({
                    ...prev,
                    [activeTab]: false
                }));
            }
        }
    }, [activeTab, user]);

    // Listeners for updates
    useEffect(() => {
        if (!user) return;

        try {
            const db = getFirebaseDb();

            let isFirstFeedSnapshot = true;
            let isFirstManageSnapshot = true;
            let isFirstMatchSnapshot = true;
            let isFirstOfferSnapshot = true;

            // 1. Home Badge (New global Feed Posts)
            const feedQuery = query(collection(db, 'activityPosts'), orderBy('createdAt', 'desc'), limit(1));
            const unsubFeed = onSnapshot(feedQuery, (snapshot) => {
                if (isFirstFeedSnapshot) {
                    isFirstFeedSnapshot = false;
                    return;
                }
                const changes = snapshot.docChanges();
                for (const change of changes) {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.creatorUid !== user.uid && activeTab !== 'home') {
                            setBadges(prev => ({ ...prev, home: true }));
                        }
                    }
                }
            });

            // 2. Manage Badge (Updates to My Posts, or Asks/Comments)
            // Query asks where I am creator or asker
            const manageQuery = query(
                collection(db, 'asks'),
                or(where('creatorUid', '==', user.uid), where('askerUid', '==', user.uid))
            );
            const unsubManage = onSnapshot(manageQuery, (snapshot) => {
                if (isFirstManageSnapshot) {
                    isFirstManageSnapshot = false;
                    return;
                }
                const changes = snapshot.docChanges();
                for (const change of changes) {
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if ((change.type === 'added' || data.lastSenderUid !== user.uid) && activeTab !== 'manage') {
                            setBadges(prev => ({ ...prev, manage: true }));
                        }
                    }
                }
            });

            // 3. Search Badge (Instant Match Updates/Messages)
            const matchQuery = query(
                collection(db, 'matches'),
                or(where('user1Uid', '==', user.uid), where('user2Uid', '==', user.uid))
            );
            const unsubMatch = onSnapshot(matchQuery, (snapshot) => {
                if (isFirstMatchSnapshot) {
                    isFirstMatchSnapshot = false;
                    return;
                }
                const changes = snapshot.docChanges();
                for (const change of changes) {
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = change.doc.data();
                        if ((change.type === 'added' || data.lastSenderUid !== user.uid) && activeTab !== 'search') {
                            setBadges(prev => ({ ...prev, search: true }));
                        }
                    }
                }
            });

            // 4. Search Badge Extension (Actionable Offers)
            const offersQuery = query(
                collection(db, 'offers'),
                where('toUid', '==', user.uid),
                where('status', '==', 'pending')
            );
            const unsubOffers = onSnapshot(offersQuery, (snapshot) => {
                if (isFirstOfferSnapshot) {
                    isFirstOfferSnapshot = false;
                    return;
                }
                const changes = snapshot.docChanges();
                for (const change of changes) {
                    if (change.type === 'added') {
                        if (activeTab !== 'search') {
                            setBadges(prev => ({ ...prev, search: true }));
                        }
                    }
                }
            });

            return () => {
                unsubFeed();
                unsubManage();
                unsubMatch();
                unsubOffers();
            };
        } catch (e) {
            console.error('Failed to setup badge listeners', e);
        }
    }, [user, activeTab]);

    return badges;
}
