import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig, db } from './config';
import type { UserRole } from '../types';

const SECONDARY_APP_NAME = 'SecondaryUserCreation';

export function getSecondaryAuth() {
  const existingApp = getApps().find((app) => app.name === SECONDARY_APP_NAME);
  const secondaryApp = existingApp || initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  return getAuth(secondaryApp);
}

export interface CreateUserParams {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface CreateUserResult {
  uid: string;
  email: string;
  password: string;
}

export async function createManagedUser({
  name,
  email,
  password,
  role,
}: CreateUserParams): Promise<CreateUserResult> {
  const secondaryAuth = getSecondaryAuth();

  // 1. Create user on secondary Auth instance (manager's main session remains untouched)
  const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const createdUid = userCredential.user.uid;

  // 2. Immediately sign out of the secondary auth session
  try {
    await signOut(secondaryAuth);
  } catch (signOutErr) {
    console.warn('Secondary auth signOut warning:', signOutErr);
  }

  // 3. Write new user profile document at users/{uid} on primary Firestore instance
  try {
    const userDocRef = doc(db, 'users', createdUid);
    await setDoc(userDocRef, {
      name,
      email,
      role,
      client_ids: [],
      created_at: serverTimestamp(),
    });
  } catch (firestoreErr) {
    console.error('Firestore user document creation error:', firestoreErr);
    // Explicit exact error message per requirement
    throw new Error(
      `Auth account was created but the user profile failed to save — user UID: ${createdUid}. Contact support to complete setup manually.`
    );
  }

  return {
    uid: createdUid,
    email,
    password,
  };
}
