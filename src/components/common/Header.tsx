import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { PWAInstallButton } from './PWAInstallButton';
import { SupabaseSetupModal } from './SupabaseSetupModal';
import {
  Bell,
  Shield,
  LogOut,
  Database,
  CheckCheck,
  Clock,
  User as UserIcon,
} from 'lucide-react';
import { formatGhanaTime } from '../../utils/timezone';

export const Header: React.FC = () => {
  const { user, profile, signOut, isConfigured } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'admin':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-900 text-white">Administrator</span>;
      case 'manager':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">Station Manager</span>;
      case 'officer':
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Security Officer</span>;
      default:
        return null;
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Security OMS Logo"
              className="w-10 h-10 rounded-xl object-contain shadow-sm shadow-orange-600/20"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-900 tracking-tight text-base sm:text-lg">SECURITY <span className="text-orange-600">OMS</span></span>
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                  REALTIME
                </span>
              </div>
              <p className="text-[11px] text-stone-500 hidden md:block">Occurrence Management System</p>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Database Status Button - only show when setup is needed */}
            {!isConfigured && (
              <button
                onClick={() => setShowSetupModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100 animate-pulse transition"
                title="Database backend configuration & SQL migration"
              >
                <Database className="w-3.5 h-3.5 text-orange-600" />
                <span>Setup Supabase</span>
                <span className="w-2 h-2 rounded-full bg-orange-500" />
              </button>
            )}

            {/* PWA Install Button */}
            <PWAInstallButton compact />

            {user && (
              <>
                {/* Notification Bell */}
                <div className="relative">
                  <button
                    id="notifications-bell-btn"
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="relative p-2 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition"
                    aria-label="View notifications"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-orange-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Notifications Popover */}
                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-stone-200 p-4 z-50 animate-fade-in">
                      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-stone-900">Notifications</h3>
                          {unreadCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">
                              {unreadCount} new
                            </span>
                          )}
                        </div>
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:text-orange-700 font-medium"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>Mark all read</span>
                          </button>
                        )}
                      </div>

                      <div className="mt-3 max-h-80 overflow-y-auto space-y-2 divide-y divide-stone-100">
                        {notifications.length === 0 ? (
                          <div className="py-6 text-center text-xs text-stone-500">
                            You're all caught up.
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => markAsRead(notif.id)}
                              className={`pt-2.5 pb-2 text-left cursor-pointer transition rounded-lg p-2 ${
                                notif.read_at ? 'opacity-70 hover:bg-stone-50' : 'bg-orange-50/50 hover:bg-orange-50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-semibold text-stone-900">{notif.title}</span>
                                <span className="text-[10px] text-stone-400 flex items-center gap-1 flex-shrink-0">
                                  <Clock className="w-2.5 h-2.5" />
                                  {formatGhanaTime(notif.created_at)}
                                </span>
                              </div>
                              <p className="text-xs text-stone-600 mt-1 leading-snug">{notif.message}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* User Info & Role */}
                <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-stone-200">
                  <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700 font-medium text-xs">
                    {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                  </div>
                  <div className="text-left hidden md:block">
                    <div className="text-xs font-semibold text-stone-900 truncate max-w-[120px]">
                      {profile?.full_name || user.email?.split('@')[0]}
                    </div>
                    {getRoleBadge(profile?.role)}
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  id="sign-out-btn"
                  onClick={() => signOut()}
                  className="p-2 rounded-xl text-stone-500 hover:text-rose-600 hover:bg-rose-50 transition"
                  title="Sign out of Security OMS"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <SupabaseSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
      />
    </>
  );
};
