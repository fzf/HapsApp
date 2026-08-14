const fs = require('fs');
const path = require('path');

// The app shipped for months with crash reporting silently disabled because
// EXPO_PUBLIC_SENTRY_DSN was never set in any build profile — initSentry()
// returns early without a DSN. Guard the profiles that ship to real devices.
const easConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../eas.json'), 'utf8')
);

const REPORTING_PROFILES = ['debug', 'preview', 'production', 'production-simulator'];

describe('eas.json build profiles', () => {
  it.each(REPORTING_PROFILES)('profile "%s" defines a Sentry DSN', (profile) => {
    const env = easConfig.build[profile].env;

    expect(env.EXPO_PUBLIC_SENTRY_DSN).toMatch(/^https:\/\/.+@.+\/\d+$/);
  });

  it.each(REPORTING_PROFILES)('profile "%s" defines a build type to tag events with', (profile) => {
    const env = easConfig.build[profile].env;

    expect(env.EXPO_PUBLIC_BUILD_TYPE).toBe(profile);
  });
});
