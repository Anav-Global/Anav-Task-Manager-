import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { UserDoc } from '../types';

interface AuthContextType {
  user: User | null;
  userDoc: UserDoc | null;
  loading: boolean;
  noUserDoc: boolean;
  permissionError: boolean;
  signOut: () => Promise<void>;
  refreshUserDoc: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [noUserDoc, setNoUserDoc] = useState<boolean>(false);
  const [permissionError, setPermissionError] = useState<boolean>(false);

  const unsubUserDocRef = useRef<(() => void) | null>(null);

  const stopUserDocListener = useCallback(() => {
    if (unsubUserDocRef.current) {
      unsubUserDocRef.current();
      unsubUserDocRef.current = null;
    }
  }, []);

  // The signed-in user's profile is listened to LIVE, so a change a manager makes
  // (client access, role, removal) applies immediately without a page reload.
  const startUserDocListener = useCallback(
    (uid: string) => {
      stopUserDocListener();
      setPermissionError(false);

      unsubUserDocRef.current = onSnapshot(
        doc(db, 'users', uid),
        (snapshot) => {
          setPermissionError(false);
          if (snapshot.exists()) {
            const data = snapshot.data();
            setUserDoc({
              id: snapshot.id,
              name: data.name || '',
              email: data.email || '',
              role: data.role || 'employee',
              client_ids: data.client_ids || [],
              all_clients: typeof data.all_clients === 'boolean' ? data.all_clients : undefined,
              created_at: data.created_at,
            });
            setNoUserDoc(false);
          } else {
            setUserDoc(null);
            setNoUserDoc(true);
          }
          setLoading(false);
        },
        (err: any) => {
          console.warn('Failed to listen to user doc:', err);
          const isPermissionErr =
            err?.code === 'permission-denied' ||
            (typeof err?.message === 'string' && err.message.toLowerCase().includes('permission'));

          if (isPermissionErr) {
            setPermissionError(true);
          }
          setUserDoc(null);
          setNoUserDoc(true);
          setLoading(false);
        }
      );
    },
    [stopUserDocListener]
  );

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setLoading(true);
        startUserDocListener(currentUser.uid);
      } else {
        stopUserDocListener();
        setUserDoc(null);
        setNoUserDoc(false);
        setPermissionError(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      stopUserDocListener();
    };
  }, [startUserDocListener, stopUserDocListener]);

  const handleSignOut = async () => {
    // Stop listening first, so signing out can't trigger a stray permission error.
    stopUserDocListener();
    await fbSignOut(auth);
    setUser(null);
    setUserDoc(null);
    setNoUserDoc(false);
    setPermissionError(false);
  };

  // "Check Again" on the Account-not-set-up screen: re-attach the listener.
  const refreshUserDoc = async () => {
    if (auth.currentUser) {
      startUserDocListener(auth.currentUser.uid);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userDoc,
        loading,
        noUserDoc,
        permissionError,
        signOut: handleSignOut,
        refreshUserDoc,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
