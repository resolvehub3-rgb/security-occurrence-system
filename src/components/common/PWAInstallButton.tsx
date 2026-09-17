import React, { useState } from 'react';
import { usePWAInstall } from './usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        id="pwa-install-btn"
        onClick={install}
        className={`inline-flex items-center gap-1.5 font-medium transition rounded-lg border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 ${
          compact ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
        }`}
        title="Install Security OMS application to your home screen"
      >
        <Download className="w-3.5 h-3.5 text-orange-600" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          id="pwa-install-ios-btn"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-1.5 font-medium transition rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 ${
            compact ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
          }`}
          title="Install Security OMS on iOS"
        >
          <Smartphone className="w-3.5 h-3.5 text-orange-600" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-stone-200">
              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold">
                    S
                  </div>
                  <h3 className="text-base font-semibold text-stone-900">Install Security OMS</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-stone-400 hover:text-stone-600 rounded-md"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 text-sm text-stone-600 space-y-2.5">
                <p className="font-medium text-stone-800">To install on iPhone / iPad:</p>
                <div className="flex items-start gap-2.5 p-2.5 bg-stone-50 rounded-xl text-stone-700 text-xs">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-700 font-bold flex items-center justify-center">1</span>
                  <span>Tap the <strong>Share</strong> icon in the Safari navigation bar at the bottom.</span>
                </div>
                <div className="flex items-start gap-2.5 p-2.5 bg-stone-50 rounded-xl text-stone-700 text-xs">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-700 font-bold flex items-center justify-center">2</span>
                  <span>Scroll down the action sheet and tap <strong>Add to Home Screen</strong>.</span>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-orange-600 py-2.5 text-sm font-medium text-white hover:bg-orange-700 transition"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
