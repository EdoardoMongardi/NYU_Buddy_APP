'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendEmailVerification,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';
import { UserProfile } from '@/lib/schemas/user';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (uid: string, firebaseUser?: User | null) => {
    if (!db) return;
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const profile = userDoc.data() as UserProfile;

      // Sync Firebase Auth emailVerified status to Firestore
      const authUser = firebaseUser || user;
      if (authUser?.emailVerified && !profile.isVerified) {
        await updateDoc(userDocRef, {
          isVerified: true,
          updatedAt: serverTimestamp(),
        });
        profile.isVerified = true;
      }

      setUserProfile(profile);
    } else {
      setUserProfile(null);
    }
  };

  useEffect(() => {
    // If auth is not configured, stop loading
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Reload user to get latest emailVerified status
        await firebaseUser.reload();
        await fetchUserProfile(firebaseUser.uid, firebaseUser);
      } else {
        setUserProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase not configured');
    const { user: signedInUser } = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    await fetchUserProfile(signedInUser.uid);
  };

  const signUp = async (email: string, password: string) => {
    if (!auth || !db) throw new Error('Firebase not configured');
    const { user: newUser } = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    // Create initial user document
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

    // Send verification email
    await sendEmailVerification(newUser);

    await fetchUserProfile(newUser.uid);
  };

  const signOut = async () => {
    if (!auth) throw new Error('Firebase not configured');
    await firebaseSignOut(auth);
    setUserProfile(null);
  };

  const sendVerificationEmail = async () => {
    if (user && !user.emailVerified) {
      await sendEmailVerification(user);
    }
  };

  const refreshUserProfile = async () => {
    if (user) {
      // Reload user to get latest emailVerified status from Firebase Auth
      await user.reload();
      await fetchUserProfile(user.uid, user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        signIn,
        signUp,
        signOut,
        sendVerificationEmail,
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