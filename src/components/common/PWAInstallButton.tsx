import React, { useEffect, useState } from 'react';
import { usePWAInstall } from './usePWAInstall';
import { ArrowDown, Check, CheckCircle2, Download, Home, Share, X } from 'lucide-react';

type StepProps = { icon: React.ReactNode; title: React.ReactNode; hint?: React.ReactNode };

const Step = ({ icon, title, hint }: StepProps) => (
  <div className="flex items-start gap-3 p-3 bg-stone-50 rounded-xl text-stone-700 text-sm">
    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center">
      {icon}
    </span>
    <span className="leading-snug">
      {title}
      {hint && <span className="block mt-0.5 text-xs text-stone-500">{hint}</span>}
    </span>
  </div>
);

interface IOSGuideProps {
  isInstalled: boolean;
  isInAppBrowser: boolean;
  onClose: () => void;
}

const IOSInstallGuide: React.FC<IOSGuideProps> = ({ isInstalled, isInAppBrowser, onClose }) => {
  const [mounted, setMounted] = useState(false);
  const [showRetryHint, setShowRetryHint] = useState(false);

  // Slide-up entrance so the guide appears the instant Install is tapped.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Success is detected automatically (the installed app writes a flag that
  // this tab picks up on focus/visibility — see usePWAInstall).
  useEffect(() => {
    if (isInstalled) {
      const timer = setTimeout(onClose, 2200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isInstalled, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center p-4 pt-10 sm:pt-16 bg-black/30 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Install SecurityOMS"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-stone-200 transition-all duration-300 ${
          mounted ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
        }`}
      >
        {isInstalled ? (
          <div className="py-3 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-500" />
            <h3 className="mt-3 text-lg font-semibold text-stone-900">App Installed 🎉</h3>
            <p className="mt-1 text-sm text-stone-500">Open SecurityOMS from your Home Screen.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold">
                  S
                </div>
                <h3 className="text-base font-semibold text-stone-900">Install SecurityOMS</h3>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1 text-stone-400 hover:text-stone-600 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="mt-3 text-sm font-medium text-stone-800">Just 3 quick taps:</p>

            <div className="mt-2 space-y-2">
              <Step
                icon={<Share className="w-4 h-4" />}
                title={
                  <>
                    Tap <strong>Share</strong> in the Safari bar at the bottom.
                  </>
                }
                hint={
                  <>
                    Don’t see it? Tap <strong>⋯</strong> (bottom right) first, then <strong>Share</strong>.
                  </>
                }
              />
              <Step
                icon={<Home className="w-4 h-4" />}
                title={
                  <>
                    Tap <strong>Add to Home Screen</strong>.
                  </>
                }
                hint={
                  <>
                    On iOS 26, tap <strong>View More</strong> if you don’t see it.
                  </>
                }
              />
              <Step icon={<Check className="w-4 h-4" />} title="Tap Add. That’s it!" />
            </div>

            {isInAppBrowser && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-snug">
                You’re inside another app’s built-in browser. Tap <strong>⋯ → Open in Safari</strong>{' '}
                first — only Safari (or Chrome/Edge on iOS) can install.
              </div>
            )}

            <button
              onClick={() => {
                if (isInstalled) onClose();
                else setShowRetryHint(true);
              }}
              className="mt-4 w-full rounded-xl bg-orange-600 py-2.5 text-sm font-medium text-white hover:bg-orange-700 transition"
            >
              {showRetryHint ? 'Check Again' : 'Done'}
            </button>

            {showRetryHint && !isInstalled && (
              <p className="mt-2 text-center text-xs text-stone-500">
                Don’t see the icon yet? Repeat steps 1–3 and make sure you tap <strong>Add</strong>.
              </p>
            )}
          </>
        )}
      </div>

      {/* Animated arrow pointing at the still-visible Safari toolbar below. */}
      {!isInstalled && (
        <div className="mt-3 flex flex-col items-center text-orange-500 animate-bounce">
          <span className="text-xs font-semibold text-stone-600 bg-white/90 rounded-full px-2.5 py-1 shadow">
            Tap Share down here
          </span>
          <ArrowDown className="w-7 h-7 mt-1" />
        </div>
      )}
    </div>
  );
};

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isInAppBrowser, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const buttonClassName = `inline-flex items-center gap-1.5 font-medium transition rounded-lg border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 ${
    compact ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
  }`;

  let trigger: React.ReactNode = null;

  if (!isInstalled) {
    if (isInstallable) {
      // Chromium / Android / Desktop: native prompt, instant one-tap install.
      trigger = (
        <button
          id="pwa-install-btn"
          onClick={() => void install()}
          className={buttonClassName}
          title="Install Security OMS application to your home screen"
        >
          <Download className="w-3.5 h-3.5 text-orange-600" />
          <span>Install App</span>
        </button>
      );
    } else if (isIOS) {
      // iOS: Safari exposes no install API, so open the guided flow instantly.
      trigger = (
        <button
          id="pwa-install-ios-btn"
          onClick={() => setShowIOSGuide(true)}
          className={buttonClassName}
          title="Install Security OMS on iOS"
        >
          <Download className="w-3.5 h-3.5 text-orange-600" />
          <span>Install App</span>
        </button>
      );
    }
  }

  return (
    <>
      {trigger}
      {showIOSGuide && (
        <IOSInstallGuide
          isInstalled={isInstalled}
          isInAppBrowser={isInAppBrowser}
          onClose={() => setShowIOSGuide(false)}
        />
      )}
    </>
  );
};
