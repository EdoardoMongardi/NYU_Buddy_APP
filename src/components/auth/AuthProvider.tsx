'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
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

  // Prevents onAuthStateChanged from overriding needsVerification after
  // a successful verifyCode call (the client token may still be stale).
  const verifiedLockRef = useRef(false);

  const fetchUserProfile = useCallback(async (uid: string, firebaseUser?: User | null) => {
    if (!db) return;
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const profile = userDoc.data() as UserProfile;

      const authUser = firebaseUser;
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
          const freshUser = auth?.currentUser ?? firebaseUser;

          // Set both user AND needsVerification together before any further
          // awaits so React batches them into a single render. Without this,
          // setUser alone would flush a render where needsVerification is still
          // false, causing the login page to prematurely redirect to /.
          if (!verifiedLockRef.current) {
            setNeedsVerification(!freshUser.emailVerified);
          }
          setUser(freshUser);

          await fetchUserProfile(freshUser.uid, freshUser);
        } else {
          setUser(null);
          setUserProfile(null);
          setNeedsVerification(false);
          verifiedLockRef.current = false;
        }
      } catch {
        // Ensure app doesn't get stuck on loading screen
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchUserProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not configured');
    verifiedLockRef.current = false;
    const { user: signedInUser } = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    setNeedsVerification(!signedInUser.emailVerified);
    await fetchUserProfile(signedInUser.uid, signedInUser);
  }, [fetchUserProfile]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!auth || !db) throw new Error('Firebase not configured');
    verifiedLockRef.current = false;
    const { user: newUser } = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    // Set immediately so the login page sees needsVerification=true
    // in the same render cycle as the new user, preventing a redirect to /.
    setNeedsVerification(true);

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
  }, [fetchUserProfile]);

  const signOut = useCallback(async () => {
    if (!auth) throw new Error('Firebase not configured');
    verifiedLockRef.current = false;
    await firebaseSignOut(auth);
    setUserProfile(null);
    setNeedsVerification(false);
  }, []);

  const sendVerificationCode = useCallback(async () => {
    if (!functions) throw new Error('Firebase not configured');
    const fn = httpsCallable(functions, 'sendVerificationCode');
    await fn();
  }, []);

  const verifyCode = useCallback(async (code: string) => {
    if (!functions || !auth) throw new Error('Not configured');
    const fn = httpsCallable<{ code: string }, { success: boolean }>(functions, 'verifyCode');
    const result = await fn({ code });
    if (result.data.success) {
      // Lock so onAuthStateChanged won't flip needsVerification back
      verifiedLockRef.current = true;
      setNeedsVerification(false);

      // Reload the user to pick up emailVerified: true
      const currentUser = auth.currentUser;
      if (currentUser) {
        try { await currentUser.reload(); } catch { /* ok */ }
        setUser(auth.currentUser ?? currentUser);
      }

      // Sync to Firestore
      if (db && currentUser) {
        try {
          await updateDoc(doc(db, 'users', currentUser.uid), {
            isVerified: true,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Non-critical
        }
        await fetchUserProfile(currentUser.uid, auth.currentUser ?? currentUser);
      }
    }
  }, [fetchUserProfile]);

  const refreshUserProfile = useCallback(async () => {
    if (!user) return;
    try { await user.reload(); } catch { /* ok */ }
    await fetchUserProfile(user.uid, user);
    if (!verifiedLockRef.current) {
      setNeedsVerification(!user.emailVerified);
    }
  }, [user, fetchUserProfile]);

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
