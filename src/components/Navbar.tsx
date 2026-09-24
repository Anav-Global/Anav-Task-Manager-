import React from 'react';
import { LogOut, User, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { UserRole } from '../types';
import { ANAV_LOGO_DATA_URI } from '../assets/logoData';

const roleBadgeStyles: Record<UserRole, { bg: string; text: string; border: string; label: string }> = {
  manager: {
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    text: 'text-brand-purple dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
    label: 'Manager',
  },
  tl: {
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    text: 'text-brand-purple dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
    label: 'Team Lead',
  },
  employee: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    label: 'Employee',
  },
};

export const Navbar: React.FC = () => {
  const { userDoc, user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const role = userDoc?.role || 'employee';
  const roleStyle = roleBadgeStyles[role] || roleBadgeStyles.employee;
  const displayName = userDoc?.name || user?.email || 'User';

  return (
    <header className="h-16 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 px-6 flex items-center justify-between z-10 transition-colors">
      <div className="flex items-center gap-3">
        <img
          src={ANAV_LOGO_DATA_URI}
          alt="Anav Global"
          className="h-8 w-8 rounded-md object-cover"
        />
        <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Anav Task Manager
        </span>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 flex items-center justify-center text-neutral-600 dark:text-neutral-300">
            <User className="w-4 h-4" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 leading-tight">
              {displayName}
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-400 leading-tight">
              {user?.email}
            </span>
          </div>
        </div>

        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}
        >
          {roleStyle.label}
        </span>

        {/* Theme toggle button: next to the user name/role badge, before Sign Out */}
        <button
          id="theme-toggle-btn"
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-neutral-600" />
          )}
        </button>

        <div className="h-5 w-px bg-neutral-200 dark:bg-neutral-700" />

        <button
          id="nav-sign-out-btn"
          onClick={() => signOut()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-md transition-colors cursor-pointer"
          title="Sign Out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </header>
  );
};
