import React, { useState, useEffect, useCallback } from 'react';
import { OfficerHome } from './OfficerHome';
import { OfficerHistory } from './OfficerHistory';
import { OfficerProfile } from './OfficerProfile';
import { getOfficerAccessStatus, formatSecondsCountdown, formatGhanaShortTime } from '../../utils/timezone';
import { Home, History, User, ShieldAlert, Clock, Lock } from 'lucide-react';

type OfficerTab = 'home' | 'history' | 'profile';

export const OfficerLayout: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<OfficerTab>('home');
  const [accessStatus, setAccessStatus] = useState(getOfficerAccessStatus());
  const [countdown, setCountdown] = useState(accessStatus.nextChangeSeconds);

  const refreshAccess = useCallback(() => {
    const status = getOfficerAccessStatus();
    setAccessStatus(status);
    setCountdown(status.nextChangeSeconds);
  }, []);

  // Real-time clock: check every second
  useEffect(() => {
    refreshAccess();
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          refreshAccess();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [refreshAccess]);

  // If outside duty window, show restricted access screen
  if (!accessStatus.allowed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-stone-100 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center space-y-6 animate-fade-in">
          {/* Lock Icon */}
          <div className="relative inline-block">
            <div className="absolute inset-0 w-24 h-24 rounded-full bg-orange-400/15 blur-xl animate-pulse" />
            <div className="relative w-24 h-24 rounded-3xl bg-white shadow-xl shadow-orange-600/10 border border-orange-100 flex items-center justify-center">
              <Lock className="w-10 h-10 text-orange-500" />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <h1 className="text-xl font-black text-stone-900 tracking-tight">
              Access <span className="text-orange-600">Restricted</span>
            </h1>
            <p className="text-sm text-stone-600 leading-relaxed">
              Security Officers can only access the portal during the duty window.
            </p>
          </div>

          {/* Time Info Card */}
          <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-center gap-2 text-orange-700">
              <ShieldAlert className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">{accessStatus.message}</span>
            </div>

            {/* Duty Window Hours */}
            <div className="flex items-center justify-center gap-6 text-xs">
              <div className="text-center">
                <div className="text-stone-400 font-medium mb-0.5">Opens</div>
                <div className="font-bold text-stone-900 text-sm">7:30 AM</div>
              </div>
              <div className="w-px h-8 bg-stone-200" />
              <div className="text-center">
                <div className="text-stone-400 font-medium mb-0.5">Closes</div>
                <div className="font-bold text-stone-900 text-sm">5:00 PM</div>
              </div>
            </div>

            {/* Countdown */}
            <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
              <div className="flex items-center justify-center gap-2 text-stone-500 mb-2">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Access opens in</span>
              </div>
              <div className="text-3xl font-black text-stone-900 font-mono tracking-wider">
                {formatSecondsCountdown(countdown)}
              </div>
            </div>
          </div>

          {/* Profile access hint */}
          <p className="text-[11px] text-stone-400">
            You can still access your Profile from the bottom navigation.
          </p>
        </div>

        {/* Bottom nav — only Profile is functional */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 shadow-lg">
          <div className="max-w-md mx-auto h-16 px-4 grid grid-cols-3 items-center">
            <button
              disabled
              className="flex flex-col items-center justify-center h-full py-1 text-stone-300 cursor-not-allowed"
            >
              <div className="p-1 rounded-xl"><Home className="w-5 h-5" /></div>
              <span className="text-[11px] tracking-tight mt-0.5">Home</span>
            </button>
            <button
              disabled
              className="flex flex-col items-center justify-center h-full py-1 text-stone-300 cursor-not-allowed"
            >
              <div className="p-1 rounded-xl"><History className="w-5 h-5" /></div>
              <span className="text-[11px] tracking-tight mt-0.5">History</span>
            </button>
            <button
              onClick={() => setCurrentTab('profile')}
              className="flex flex-col items-center justify-center h-full py-1 text-stone-400 hover:text-stone-600 font-medium transition"
            >
              <div className="p-1 rounded-xl"><User className="w-5 h-5" /></div>
              <span className="text-[11px] tracking-tight mt-0.5">Profile</span>
            </button>
          </div>
        </nav>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100/60 pb-16">
      {/* Active Tab Screen */}
      <main className="w-full">
        {currentTab === 'home' && <OfficerHome />}
        {currentTab === 'history' && <OfficerHistory />}
        {currentTab === 'profile' && <OfficerProfile />}
      </main>

      {/* Fixed Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 shadow-lg">
        <div className="max-w-md mx-auto h-16 px-4 grid grid-cols-3 items-center">
          {/* Tab 1: Home */}
          <button
            id="officer-tab-home"
            onClick={() => setCurrentTab('home')}
            className={`flex flex-col items-center justify-center h-full py-1 transition ${
              currentTab === 'home'
                ? 'text-orange-600 font-bold'
                : 'text-stone-400 hover:text-stone-600 font-medium'
            }`}
          >
            <div className={`p-1 rounded-xl transition ${currentTab === 'home' ? 'bg-orange-50' : ''}`}>
              <Home className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight mt-0.5">Home</span>
          </button>

          {/* Tab 2: History */}
          <button
            id="officer-tab-history"
            onClick={() => setCurrentTab('history')}
            className={`flex flex-col items-center justify-center h-full py-1 transition ${
              currentTab === 'history'
                ? 'text-orange-600 font-bold'
                : 'text-stone-400 hover:text-stone-600 font-medium'
            }`}
          >
            <div className={`p-1 rounded-xl transition ${currentTab === 'history' ? 'bg-orange-50' : ''}`}>
              <History className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight mt-0.5">History</span>
          </button>

          {/* Tab 3: Profile */}
          <button
            id="officer-tab-profile"
            onClick={() => setCurrentTab('profile')}
            className={`flex flex-col items-center justify-center h-full py-1 transition ${
              currentTab === 'profile'
                ? 'text-orange-600 font-bold'
                : 'text-stone-400 hover:text-stone-600 font-medium'
            }`}
          >
            <div className={`p-1 rounded-xl transition ${currentTab === 'profile' ? 'bg-orange-50' : ''}`}>
              <User className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight mt-0.5">Profile</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
