import React from 'react';
import { NavLink } from 'react-router-dom';
import { Users, FolderTree, UserCog, CheckSquare, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { userDoc } = useAuth();
  const isPrivileged = userDoc?.role === 'tl' || userDoc?.role === 'manager';

  return (
    <aside className="w-60 bg-neutral-50 border-r border-neutral-200 flex flex-col justify-between py-6 px-3">
      <nav className="space-y-1">
        <NavLink
          to="/dashboard/tasks"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-gradient-to-r from-brand-purple to-brand-blue text-white shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900'
            }`
          }
        >
          <CheckSquare className="w-4 h-4" />
          <span>Tasks</span>
        </NavLink>

        <NavLink
          to="/dashboard/reports"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-gradient-to-r from-brand-purple to-brand-blue text-white shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900'
            }`
          }
        >
          <BarChart3 className="w-4 h-4" />
          <span>Reports</span>
        </NavLink>

        <NavLink
          to="/dashboard/clients"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-gradient-to-r from-brand-purple to-brand-blue text-white shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900'
            }`
          }
        >
          <Users className="w-4 h-4" />
          <span>Clients</span>
        </NavLink>

        <NavLink
          to="/dashboard/groups"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-gradient-to-r from-brand-purple to-brand-blue text-white shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900'
            }`
          }
        >
          <FolderTree className="w-4 h-4" />
          <span>Groups</span>
        </NavLink>

        {isPrivileged && (
          <NavLink
            to="/dashboard/users"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gradient-to-r from-brand-purple to-brand-blue text-white shadow-xs'
                  : 'text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900'
              }`
            }
          >
            <UserCog className="w-4 h-4" />
            <span>Users</span>
          </NavLink>
        )}
      </nav>

      <div className="px-3 pt-4 border-t border-neutral-200/80 text-xs text-neutral-400">
        Phase 1 Core View
      </div>
    </aside>
  );
};
