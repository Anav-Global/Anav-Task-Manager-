import React from 'react';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types';
import { ANAV_LOGO_DATA_URI } from '../assets/logoData';

const roleBadgeStyles: Record<UserRole, { bg: string; text: string; border: string; label: string }> = {
  manager: {
    bg: 'bg-purple-50',
    text: 'text-brand-purple',
    border: 'border-purple-200',
    label: 'Manager',
  },
  tl: {
    bg: 'bg-purple-50',
    text: 'text-brand-purple',
    border: 'border-purple-200',
    label: 'Team Lead',
  },
  employee: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    label: 'Employee',
  },
};

export const Navbar: React.FC = () => {
  const { userDoc, user, signOut } = useAuth();

  const role = userDoc?.role || 'employee';
  const roleStyle = roleBadgeStyles[role] || roleBadgeStyles.employee;
  const displayName = userDoc?.name || user?.email || 'User';

  return (
    <header className="h-16 bg-white border-b border-neutral-200 px-6 flex items-center justify-between z-10">
      <div className="flex items-center gap-3">
        <img
          src={ANAV_LOGO_DATA_URI}
          alt="Anav Global"
          className="h-8 w-8 rounded-md object-cover"
        />
        <span className="text-lg font-bold tracking-tight text-neutral-900">
          Anav Task Manager
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-600">
            <User className="w-4 h-4" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-sm font-medium text-neutral-800 leading-tight">
              {displayName}
            </span>
            <span className="text-xs text-neutral-400 leading-tight">
              {user?.email}
            </span>
          </div>
        </div>

        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}
        >
          {roleStyle.label}
        </span>

        <div className="h-5 w-px bg-neutral-200" />

        <button
          id="nav-sign-out-btn"
          onClick={() => signOut()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </header>
  );
};
