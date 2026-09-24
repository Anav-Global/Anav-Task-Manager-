import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { LogIn, AlertCircle, Info, Lock, Mail, Sun, Moon } from 'lucide-react';
import { auth, isFirebaseConfigured } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ANAV_LOGO_DATA_URI } from '../assets/logoData';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!authLoading && user) {
    return <Navigate to="/dashboard/clients" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
      navigate('/dashboard/clients', { replace: true });
    } catch (err: any) {
      console.error('Sign in failed:', err);
      const code = err?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setErrorMessage('Invalid email or password. Please double-check your credentials.');
      } else if (code === 'auth/invalid-email') {
        setErrorMessage('The email address format is invalid.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMessage('Too many failed login attempts. Please try again later.');
      } else if (code === 'auth/user-disabled') {
        setErrorMessage('This user account has been disabled by an administrator.');
      } else if (code === 'auth/network-request-failed') {
        setErrorMessage('Network connection error. Please check your internet connection.');
      } else if (code === 'auth/api-key-not-valid' || code === 'auth/invalid-api-key') {
        setErrorMessage('Firebase API key is invalid or not yet configured in environment variables.');
      } else {
        setErrorMessage(err?.message || 'Failed to sign in. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 flex flex-col justify-center items-center p-4 sm:p-6 transition-colors relative">
      {/* Top right theme toggle for unauthenticated state */}
      <div className="absolute top-4 right-4">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 text-neutral-600" />
          )}
        </button>
      </div>

      <div className="max-w-md w-full">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <img
            src={ANAV_LOGO_DATA_URI}
            alt="Anav Global"
            className="w-12 h-12 rounded-xl object-cover mx-auto mb-3 shadow-xs"
          />
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Anav Task Manager
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Sign in to access your dashboard
          </p>
        </div>

        {/* Configuration Notice if placeholder keys detected */}
        {!isFirebaseConfigured && (
          <div className="mb-6 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block mb-0.5">Firebase Configuration Pending</span>
              <span>
                Environment variables (such as <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 py-0.5 rounded">VITE_FIREBASE_API_KEY</code>) are using placeholders. Set your real Firebase project credentials in environment settings to enable live database and authentication.
              </span>
            </div>
          </div>
        )}

        {/* Login Form Card */}
        <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm p-6 sm:p-8 transition-colors">
          {errorMessage && (
            <div
              id="login-error-alert"
              className="mb-5 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2.5 text-sm text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400 transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-brand-blue bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400 transition"
                />
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              disabled={submitting}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-white text-sm font-semibold shadow-xs transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>
        </div>

        <div className="text-center mt-6 text-xs text-neutral-500 dark:text-neutral-400">
          Email and password authentication only
        </div>
      </div>
    </div>
  );
};
