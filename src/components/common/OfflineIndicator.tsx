import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';

export const OfflineIndicator: React.FC<{ onReconnect?: () => void }> = ({ onReconnect }) => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      if (onReconnect) onReconnect();
      const timer = setTimeout(() => {
        setJustReconnected(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onReconnect]);

  if (isOnline && !justReconnected) {
    return null;
  }

  if (justReconnected) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-900/20 animate-fade-in">
        <CheckCircle2 className="w-4 h-4 text-emerald-200" />
        <span>Connected to Network — State Synchronized</span>
      </div>
    );
  }

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-full bg-stone-900 border border-orange-500/30 px-4 py-2 text-xs font-semibold text-white shadow-xl shadow-stone-950/40">
      <WifiOff className="w-4 h-4 text-orange-400 animate-pulse" />
      <span>Connection Lost — <span className="text-orange-300 font-normal">Reconnecting…</span></span>
      <RefreshCw className="w-3.5 h-3.5 text-stone-400 animate-spin" />
    </div>
  );
};
