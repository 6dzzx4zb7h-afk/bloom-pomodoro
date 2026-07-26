/// <reference types="vite/client" />

const SERVICE_WORKER_PATH = '/sw.js';

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
};

function isNativeCapacitorShell(): boolean {
  return (window as CapacitorWindow).Capacitor?.isNativePlatform?.() === true;
}

/**
 * PLAN 8.15: install the generated app-shell worker only for production web
 * builds. Capacitor already bundles the same files inside the APK and should
 * not acquire a second, independently cached copy.
 */
export function registerBloomServiceWorker(
  reloadPage: () => void = () => window.location.reload(),
): void {
  if (
    !import.meta.env.PROD ||
    !('serviceWorker' in navigator) ||
    isNativeCapacitorShell()
  ) {
    return;
  }

  const serviceWorker = navigator.serviceWorker;
  const controlledAtBoot = serviceWorker.controller !== null;
  let reloadStarted = false;

  serviceWorker.addEventListener('controllerchange', () => {
    // Claiming the very first worker should not bounce the first visit. When a
    // controlled page receives a new build, reload once so its HTML and hashed
    // assets come from one cache version.
    if (!controlledAtBoot || reloadStarted) return;
    reloadStarted = true;
    reloadPage();
  });

  const register = async () => {
    try {
      const registration = await serviceWorker.register(SERVICE_WORKER_PATH, {
        scope: '/',
        updateViaCache: 'none',
      });
      // One explicit check at page load is enough; browsers also check on
      // navigation. Avoid polling or foreground-triggered update traffic while
      // someone is in the middle of a session.
      void registration.update().catch(() => undefined);
    } catch {
      // Registration is progressive enhancement. A blocked/unsupported worker
      // must not stop the already-loaded local app or trigger any fallback
      // request to another origin.
    }
  };

  if (document.readyState === 'complete') {
    void register();
  } else {
    window.addEventListener('load', () => void register(), { once: true });
  }
}
