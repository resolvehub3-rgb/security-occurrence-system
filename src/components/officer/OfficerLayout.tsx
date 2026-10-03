import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabase';
import { OfficerHome } from './OfficerHome';
import { OfficerHistory } from './OfficerHistory';
import { OfficerProfile } from './OfficerProfile';
import {
  getOfficerAccessStatus,
  formatSecondsCountdown,
  isSubmissionGraceWindow,
  SUBMISSION_GRACE_MINUTES,
} from '../../utils/timezone';
import { Home, History, User, ShieldAlert, Clock, Lock } from 'lucide-react';

type OfficerTab = 'home' | 'history' | 'profile';

export const OfficerLayout: React.FC = () => {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState<OfficerTab>('home');
  const [accessStatus, setAccessStatus] = useState(() => getOfficerAccessStatus());
  const [countdown, setCountdown] = useState(accessStatus.nextChangeSeconds);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Outside the duty window (7:30 AM – 8:00 AM only), an officer whose shift has
  // just ended keeps access long enough to submit the final report.
  const hasShiftEndingInGrace = useCallback(async (): Promise<boolean> => {
    if (!user || !isSubmissionGraceWindow()) return false;
    try {
      const supabase = getSupabase();
      const now = Date.now();
      const { data, error } = await supabase
        .from('duty_sessions')
        .select('id')
        .eq('officer_id', user.id)
        .gte('expected_end_at', new Date(now - SUBMISSION_GRACE_MINUTES * 60 * 1000).toISOString())
        .lte('expected_end_at', new Date(now).toISOString())
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Grace period check failed:', error);
        return false;
      }
      return !!data;
    } catch (err) {
      console.error('Grace period check failed:', err);
      return false;
    }
  }, [user]);

  // Full status refresh — re-evaluates allowed/blocked and resets countdown
  const refreshAccess = useCallback(async () => {
    const base = getOfficerAccessStatus();
    const withinSubmissionGrace = base.allowed ? false : await hasShiftEndingInGrace();
    const status = getOfficerAccessStatus({ withinSubmissionGrace });
    setAccessStatus(status);
    setCountdown(status.nextChangeSeconds);
  }, [hasShiftEndingInGrace]);

  // Real-time: tick every second, full refresh every 30 seconds and when countdown hits 0
  useEffect(() => {
    refreshAccess();

    tickRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    // Safety net: full refresh every 30 seconds to catch any edge cases
    const safetyNet = setInterval(() => refreshAccess(), 30000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      clearInterval(safetyNet);
    };
  }, [refreshAccess]);

  // Window status may have changed (opened / closed / grace expired) at zero
  useEffect(() => {
    if (countdown === 0) refreshAccess();
  }, [countdown, refreshAccess]);

  // If outside duty window, show restricted access screen
  if (!accessStatus.allowed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 via-orange-50/30 to-stone-100 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center space-y-6 animate-fade-in">
          {/* Lock Icon with animated glow */}
          <div className="relative inline-block">
            <div className="absolute inset-0 w-24 h-24 rounded-full bg-orange-400/15 blur-xl animate-pulse" />
            <div className="relative w-24 h-24 rounded-3xl bg-white shadow-xl shadow-orange-600/10 border border-orange-100 flex items-center justify-center">
              <Lock className="w-10 h-10 text-orange-500" />
            </div>
          </div>

          {/* Access Restricted heading */}
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

            {/* Duty window hours: 5:00 PM – 7:30 AM */}
            <div className="flex items-center justify-center gap-6 text-xs">
              <div className="text-center">
                <div className="text-stone-400 font-medium mb-0.5">Opens</div>
                <div className="font-bold text-stone-900 text-sm">5:00 PM</div>
              </div>
              <div className="w-px h-8 bg-stone-200" />
              <div className="text-center">
                <div className="text-stone-400 font-medium mb-0.5">Closes</div>
                <div className="font-bold text-stone-900 text-sm">7:30 AM</div>
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

          <p className="text-[11px] text-stone-400">
            You can still access your Profile from the bottom navigation.
          </p>
        </div>

        {/* Bottom nav — Home & History disabled, Profile works */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 shadow-lg">
          <div className="max-w-md mx-auto h-16 px-4 grid grid-cols-3 items-center">
            <button
              disabled
              className="flex flex-col items-center justify-center h-full py-1 text-stone-300 cursor-not-allowed opacity-40"
            >
              <div className="p-1 rounded-xl"><Home className="w-5 h-5" /></div>
              <span className="text-[11px] tracking-tight mt-0.5">Home</span>
            </button>
            <button
              disabled
              className="flex flex-col items-center justify-center h-full py-1 text-stone-300 cursor-not-allowed opacity-40"
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
