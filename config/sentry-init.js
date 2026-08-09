// Side-effect module: must be the app's first import so Sentry is
// initialized before any service module can throw or capture.
import { initSentry } from './sentry';
initSentry();
