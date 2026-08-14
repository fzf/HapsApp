import * as Sentry from '@sentry/react-native';

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // no DSN configured (e.g. local dev) — stay silent
  Sentry.init({
    dsn,
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
    environment: process.env.EXPO_PUBLIC_BUILD_TYPE || 'unknown',
    // Launch-time crashes are the ones we can't see from JS: a native crash or
    // an iOS watchdog termination kills the app before any JS handler runs.
    enableNativeCrashHandling: true,
    enableWatchdogTerminationTracking: true,
  });
  initialized = true;
}
