const DSN = 'https://examplekey@o0.ingest.us.sentry.io/0';

// babel-preset-expo rewrites `process.env.EXPO_PUBLIC_*` reads to the
// `expo/virtual/env` module, which holds a live reference to process.env.
// Mutate process.env in place — reassigning it would detach that reference.
//
// Sentry must be required *after* jest.resetModules(), so the test and
// config/sentry.js share the same mock instance.
describe('initSentry', () => {
  const ENV_KEYS = ['EXPO_PUBLIC_SENTRY_DSN', 'EXPO_PUBLIC_BUILD_TYPE'];
  const originalValues = {};

  beforeAll(() => {
    ENV_KEYS.forEach((key) => { originalValues[key] = process.env[key]; });
  });

  beforeEach(() => {
    jest.resetModules();
    ENV_KEYS.forEach((key) => { delete process.env[key]; });
  });

  afterAll(() => {
    ENV_KEYS.forEach((key) => {
      if (originalValues[key] === undefined) delete process.env[key];
      else process.env[key] = originalValues[key];
    });
  });

  const load = () => ({
    Sentry: require('@sentry/react-native'),
    initSentry: require('../../config/sentry').initSentry,
  });

  it('stays silent when no DSN is configured', () => {
    const { Sentry, initSentry } = load();

    initSentry();

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initializes with the configured DSN', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
    const { Sentry, initSentry } = load();

    initSentry();

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init.mock.calls[0][0].dsn).toBe(DSN);
  });

  it('enables native crash handling so launch-time native crashes are captured', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
    const { Sentry, initSentry } = load();

    initSentry();

    expect(Sentry.init.mock.calls[0][0].enableNativeCrashHandling).toBe(true);
  });

  it('tracks watchdog terminations so iOS launch hangs are reported', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
    const { Sentry, initSentry } = load();

    initSentry();

    expect(Sentry.init.mock.calls[0][0].enableWatchdogTerminationTracking).toBe(true);
  });

  it('tags events with the build type as the environment', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
    process.env.EXPO_PUBLIC_BUILD_TYPE = 'preview';
    const { Sentry, initSentry } = load();

    initSentry();

    expect(Sentry.init.mock.calls[0][0].environment).toBe('preview');
  });

  it('falls back to an unknown environment when no build type is set', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
    const { Sentry, initSentry } = load();

    initSentry();

    expect(Sentry.init.mock.calls[0][0].environment).toBe('unknown');
  });

  it('initializes only once across repeated calls', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
    const { Sentry, initSentry } = load();

    initSentry();
    initSentry();

    expect(Sentry.init).toHaveBeenCalledTimes(1);
  });
});
