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
  });
  initialized = true;
}
