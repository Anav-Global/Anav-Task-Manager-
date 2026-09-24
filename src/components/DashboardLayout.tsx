import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { AccountNotSetup } from './AccountNotSetup';

export const DashboardLayout: React.FC = () => {
  const { user, userDoc, loading, noUserDoc } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-neutral-300 dark:border-neutral-700 border-t-neutral-900 dark:border-t-neutral-100 rounded-full animate-spin" />
          <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Verifying session...</span>
        </div>
      </div>
    );
  }

  // Not signed in -> redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Signed in, but no user document found in 'users' collection
  if (noUserDoc || !userDoc) {
    return <AccountNotSetup />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-100 dark:bg-neutral-900 transition-colors">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-neutral-100 dark:bg-neutral-900">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
