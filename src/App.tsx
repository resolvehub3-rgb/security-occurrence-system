import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { Header } from './components/common/Header';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { Login } from './components/auth/Login';
import { OfficerLayout } from './components/officer/OfficerLayout';
import { ManagerLayout } from './components/manager/ManagerLayout';
import { AdminLayout } from './components/admin/AdminLayout';

const AppContent: React.FC = () => {
  const { user, profile, loading, refreshProfile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-stone-100 flex flex-col items-center justify-center p-4">
        {/* Animated glow ring */}
        <div className="relative mb-6">
          <div className="absolute inset-0 w-28 h-28 rounded-full bg-orange-400/20 blur-xl animate-pulse" />
          <div className="relative w-24 h-24 rounded-3xl bg-white shadow-2xl shadow-orange-600/15 border border-orange-100 flex items-center justify-center animate-fade-in">
            <img
              src="/logo.png"
              alt="Security OMS"
              className="w-16 h-16 object-contain drop-shadow-sm"
            />
          </div>
        </div>

        {/* Branding */}
        <div className="text-center mb-6 animate-fade-in">
          <h1 className="text-xl font-black text-stone-900 tracking-tight">
            SECURITY <span className="text-orange-600">OMS</span>
          </h1>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400 mt-1">
            Occurrence Management System
          </p>
        </div>

        {/* Loading indicator */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 border-[3px] border-orange-200 rounded-full" />
            <div className="absolute inset-0 w-8 h-8 border-[3px] border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 animate-pulse">
            Synchronizing Security State…
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-100/60 flex flex-col">
        <Header />
        <OfflineIndicator onReconnect={refreshProfile} />
        <Login />
      </div>
    );
  }

  // Role-based main views
  return (
    <div className="min-h-screen bg-stone-100/60 flex flex-col">
      <Header />
      <OfflineIndicator onReconnect={refreshProfile} />

      <div className="flex-1">
        {profile?.role === 'admin' && <AdminLayout />}
        {profile?.role === 'manager' && <ManagerLayout />}
        {profile?.role === 'officer' && <OfficerLayout />}
        {!profile?.role && <OfficerLayout />}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </AuthProvider>
  );
}
