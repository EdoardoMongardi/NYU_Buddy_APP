'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/lib/firebase/client';
import { UserProfile } from '@/lib/schemas/user';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  needsVerification: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendVerificationCode: () => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);

  const fetchUserProfile = useCallback(async (uid: string, firebaseUser?: User | null) => {
    if (!db) return;
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const profile = userDoc.data() as UserProfile;

      // Sync Firebase Auth emailVerified status to Firestore
      const authUser = firebaseUser || user;
      if (authUser?.emailVerified && !profile.isVerified) {
        try {
          await updateDoc(userDocRef, {
            isVerified: true,
            updatedAt: serverTimestamp(),
          });
          profile.isVerified = true;
        } catch {
          // Non-critical: Firestore sync can be retried later
        }
      }

      setUserProfile(profile);
    } else {
      setUserProfile(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          try {
            await firebaseUser.reload();
          } catch {
            // reload() can fail on network issues — continue with cached state
          }
          // Use auth.currentUser after reload so emailVerified is fresh
          const freshUser = auth?.currentUser ?? firebaseUser;
          setUser(freshUser);
          await fetchUserProfile(freshUser.uid, freshUser);
          setNeedsVerification(!freshUser.emailVerified);
        } else {
          setUser(null);
          setUserProfile(null);
          setNeedsVerification(false);
        }
      } catch {
        // Ensure app doesn't get stuck on loading screen
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchUserProfile]);

  const signIn = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not configured');
    const { user: signedInUser } = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    await fetchUserProfile(signedInUser.uid, signedInUser);
    setNeedsVerification(!signedInUser.emailVerified);
  };

  const signUp = async (email: string, password: string) => {
    if (!auth || !db) throw new Error('Firebase not configured');
    const { user: newUser } = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await setDoc(doc(db, 'users', newUser.uid), {
      uid: newUser.uid,
      email: newUser.email,
      displayName: '',
      interests: [],
      preferredActivities: [],
      profileCompleted: false,
      isVerified: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await fetchUserProfile(newUser.uid, newUser);
    setNeedsVerification(true);
  };

  const signOut = async () => {
    if (!auth) throw new Error('Firebase not configured');
    await firebaseSignOut(auth);
    setUserProfile(null);
    setNeedsVerification(false);
  };

  const sendVerificationCode = async () => {
    if (!functions || !user) throw new Error('Not authenticated');
    const fn = httpsCallable(functions, 'sendVerificationCode');
    await fn();
  };

  const verifyCode = async (code: string) => {
    if (!functions || !user || !auth) throw new Error('Not authenticated');
    const fn = httpsCallable<{ code: string }, { success: boolean }>(functions, 'verifyCode');
    const result = await fn({ code });
    if (result.data.success) {
      // Reload user from Firebase Auth servers to get updated emailVerified = true.
      // Do NOT call getIdToken(true) here — it can trigger onAuthStateChanged with
      // a stale cached token that still has emailVerified: false, causing a redirect loop.
      await user.reload();

      // Use auth.currentUser after reload — this is the live object with updated properties
      const freshUser = auth.currentUser;
      if (freshUser) {
        setUser(freshUser);
      }
      setNeedsVerification(false);

      // Sync to Firestore
      if (db) {
        try {
          await updateDoc(doc(db, 'users', user.uid), {
            isVerified: true,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Non-critical
        }
      }
      await fetchUserProfile(user.uid, freshUser ?? user);
    }
  };

  const refreshUserProfile = async () => {
    if (user) {
      try {
        await user.reload();
      } catch {
        // Continue with cached state
      }
      await fetchUserProfile(user.uid, user);
      setNeedsVerification(!user.emailVerified);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        needsVerification,
        signIn,
        signUp,
        signOut,
        sendVerificationCode,
        verifyCode,
        refreshUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}