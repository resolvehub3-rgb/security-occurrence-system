import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Shared across browser tabs and the installed (standalone) web app instance. */
const INSTALLED_KEY = 'securityoms.installed';

const readStoredInstall = (): boolean => {
  try {
    return localStorage.getItem(INSTALLED_KEY) === '1';
  } catch {
    return false;
  }
};

const markInstalled = (): void => {
  try {
    localStorage.setItem(INSTALLED_KEY, '1');
  } catch {
    /* storage unavailable (private mode) — ignore */
  }
};

const detectStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPadOS masquerades as macOS, so also check for touch capability. */
const detectIOS = (userAgent: string): boolean =>
  /iPad|iPhone|iPod/.test(userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** In-app webviews (Instagram, Facebook, …) cannot reach "Add to Home Screen". */
const IN_APP_TOKENS = [
  'Instagram',
  'FBAN',
  'FBAV',
  'FBIOS',
  'Twitter',
  'TikTok',
  'Line/',
  'Snapchat',
  'LinkedIn',
  'GSA',
  'WhatsApp',
  'Discord',
];

const detectInAppBrowser = (userAgent: string, isIOSDevice: boolean): boolean =>
  isIOSDevice && (IN_APP_TOKENS.some((token) => userAgent.includes(token)) || !/Safari/.test(userAgent));

export type InstallResult = 'accepted' | 'dismissed' | 'unavailable';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  useEffect(() => {
    const standalone = detectStandalone();
    if (standalone) {
      // Persist so the normal Safari tab can detect the install too
      // (the standalone web app shares localStorage with the site).
      markInstalled();
    }
    setIsInstalled(standalone || readStoredInstall());

    const userAgent = navigator.userAgent;
    const iosDevice = detectIOS(userAgent);
    setIsIOS(iosDevice);
    setIsInAppBrowser(detectInAppBrowser(userAgent, iosDevice));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      markInstalled();
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    // The user may have added the app from the share sheet, then launched it
    // from the Home Screen (which sets the flag). Re-check whenever the tab
    // regains attention so the install UI can close with a success state.
    const syncInstalled = () => {
      if (readStoredInstall()) setIsInstalled(true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncInstalled();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('focus', syncInstalled);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('focus', syncInstalled);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  /**
   * Instant install where the platform allows it (Chrome/Edge/Android via
   * `beforeinstallprompt`). Returns 'unavailable' on iOS, where Safari has no
   * install API — callers should open the guided iOS flow instead.
   */
  const install = useCallback(async (): Promise<InstallResult> => {
    if (!deferredPrompt) return 'unavailable';

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        markInstalled();
        setIsInstalled(true);
        setDeferredPrompt(null);
        return 'accepted';
      }
      setDeferredPrompt(null);
      return 'dismissed';
    } catch {
      setDeferredPrompt(null);
      return 'dismissed';
    }
  }, [deferredPrompt]);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isInAppBrowser,
    install,
  };
}
