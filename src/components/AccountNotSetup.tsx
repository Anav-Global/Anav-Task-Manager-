import React from 'react';
import { ShieldAlert, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AccountNotSetup: React.FC = () => {
  const { user, signOut, refreshUserDoc, permissionError } = useAuth();

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-neutral-200 shadow-sm p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>

        <h1 className="text-xl font-bold text-neutral-900 mb-2">
          Account not set up — contact your manager
        </h1>

        <p className="text-sm text-neutral-600 mb-6">
          Your authenticated login is <span className="font-medium text-neutral-800">{user?.email}</span>, but your user profile record has not been provisioned in the system database yet.
        </p>

        {permissionError && (
          <div className="mb-6 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 text-left">
            <span className="font-semibold block mb-1">Firestore Permission Notice:</span>
            <span>
              The database reported insufficient permissions while fetching your user record. Ensure your Firestore security rules allow <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">request.auth.uid == userId</code> for reading <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">users/{'{userId}'}</code> and that a document exists for your Auth UID.
            </span>
          </div>
        )}

        <div className="bg-neutral-50 rounded-lg p-3 text-left text-xs text-neutral-500 mb-6 border border-neutral-200 font-mono break-all">
          <div><strong className="text-neutral-700">Auth UID:</strong> {user?.uid}</div>
          <div><strong className="text-neutral-700">Expected path:</strong> users/{user?.uid}</div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            id="account-retry-btn"
            onClick={() => refreshUserDoc()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Check Again</span>
          </button>
          <button
            id="account-signout-btn"
            onClick={() => signOut()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
