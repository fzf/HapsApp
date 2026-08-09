// Note: @testing-library/jest-native is deprecated in favor of built-in matchers
// Using built-in Jest matchers from @testing-library/react-native v12.4+

// APIService reads its base URL from process.env.EXPO_PUBLIC_API_URL at
// construction time (it's a singleton instantiated on import), so this must
// be set before any test file imports services/APIService.js.
process.env.EXPO_PUBLIC_API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock SecureStore
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock Location
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve({
    coords: {
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 10
    },
    timestamp: Date.now(),
  })),
  // Current HeartbeatService falls back to this when getCurrentPositionAsync
  // fails; default to "nothing available" so callers must opt in per-test.
  getLastKnownPositionAsync: jest.fn(() => Promise.reject(new Error('no last known position'))),
  watchPositionAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
}));

// Mock TaskManager
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false)),
  unregisterTaskAsync: jest.fn(),
}));

// Mock notifications
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      logtailToken: 'test-token',
      apiUrl: 'http://localhost:3000'
    }
  }
}));

// Mock Sentry
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  withScope: jest.fn((callback) => callback({
    setTag: jest.fn(),
    setContext: jest.fn(),
  })),
}));

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabase: jest.fn(() => ({
    transaction: jest.fn((callback) => callback({
      executeSql: jest.fn((sql, params, success) => success && success([], { rowsAffected: 1 }))
    }))
  }))
}));

// Mock expo-background-task
// registerTaskAsync/unregisterTaskAsync/BackgroundTaskResult are what current
// product code (HeartbeatService, LocationService, taskDefinitions) actually
// calls; startBackgroundTaskAsync is kept for compatibility but is unused.
jest.mock('expo-background-task', () => ({
  startBackgroundTaskAsync: jest.fn(() => Promise.resolve(() => {})),
  registerTaskAsync: jest.fn(() => Promise.resolve()),
  unregisterTaskAsync: jest.fn(() => Promise.resolve()),
  BackgroundTaskResult: {
    Success: 1,
    Failed: 2,
  },
}));

// Mock react-native-background-fetch
jest.mock('react-native-background-fetch', () => ({
  configure: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  STATUS: {
    RESTRICTED: 0,
    DENIED: 1,
    AVAILABLE: 2,
  },
}));

// Mock expo-network
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(() => Promise.resolve({
    type: 'WIFI',
    isConnected: true,
    isInternetReachable: true,
  })),
}));

// Mock react-native Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: jest.fn((options) => options.ios),
  },
}));

// Mock React Navigation
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  }),
  useRoute: () => ({
    params: {},
  }),
  useFocusEffect: jest.fn(),
}));

// Global test setup
global.fetch = jest.fn();

// Silence console noise in tests. Product services (LoggingService,
// HeartbeatService, LocationCacheService, etc.) log heavily via
// console.log/warn/error; without this, passing test output is dominated
// by that noise instead of test results.
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};