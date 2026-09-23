import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
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

  const fetchUserDoc = async (uid: string) => {
    try {
      setPermissionError(false);
      const userRef = doc(db, 'users', uid);
      const snapshot = await getDoc(userRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        setUserDoc({
          id: snapshot.id,
          name: data.name || '',
          email: data.email || '',
          role: data.role || 'employee',
          client_ids: data.client_ids || [],
          created_at: data.created_at,
        });
        setNoUserDoc(false);
      } else {
        setUserDoc(null);
        setNoUserDoc(true);
      }
    } catch (err: any) {
      console.warn('Failed to fetch user doc:', err);
      // Check for permission errors
      const isPermissionErr =
        err?.code === 'permission-denied' ||
        (typeof err?.message === 'string' && err.message.toLowerCase().includes('permission'));
      
      if (isPermissionErr) {
        setPermissionError(true);
      }
      setUserDoc(null);
      setNoUserDoc(true);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchUserDoc(currentUser.uid);
      } else {
        setUserDoc(null);
        setNoUserDoc(false);
        setPermissionError(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await fbSignOut(auth);
    setUser(null);
    setUserDoc(null);
    setNoUserDoc(false);
    setPermissionError(false);
  };

  const refreshUserDoc = async () => {
    if (auth.currentUser) {
      await fetchUserDoc(auth.currentUser.uid);
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
