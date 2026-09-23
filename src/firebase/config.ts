import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
const appId = import.meta.env.VITE_FIREBASE_APP_ID;

export const isFirebaseConfigured = Boolean(
  apiKey && 
  apiKey.trim().length > 0 &&
  projectId &&
  projectId.trim().length > 0 &&
  apiKey !== 'MY_FIREBASE_API_KEY'
);

export const firebaseConfig = {
  apiKey: apiKey || 'demo-placeholder-api-key',
  authDomain: authDomain || 'placeholder-project.firebaseapp.com',
  projectId: projectId || 'placeholder-project',
  storageBucket: storageBucket || 'placeholder-project.appspot.com',
  messagingSenderId: messagingSenderId || '1234567890',
  appId: appId || '1:1234567890:web:abcdef123456',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
