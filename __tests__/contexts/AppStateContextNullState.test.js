import React from 'react';
import { Text, AppState } from 'react-native';
import { render, act } from '@testing-library/react-native';

jest.mock('../../services', () => ({
  LocationService: {
    checkLocationPermission: jest.fn(() => Promise.resolve(true)),
    isLocationTrackingActive: jest.fn(() => Promise.resolve(false)),
  },
  HeartbeatService: {
    startHeartbeat: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../services/LoggingService', () => ({
  info: jest.fn(),
  error: jest.fn(),
  location: jest.fn(),
}));

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true, type: 'WIFI' })
  ),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Regression test for the build-101 launch crash (Sentry MOBILE-38):
// AppState.currentState is documented to be null briefly at startup. When the
// provider module captured that null into initialState and the first 'change'
// event fired (a permission dialog does exactly this), the listener called
// state.appState.match(...) — a TypeError thrown synchronously inside a native
// event callback, which no error boundary can catch and which aborts the app
// as a fatal jsi::JSError.
describe('AppStateProvider with null AppState.currentState at startup', () => {
  it('survives the first AppState change events without throwing', () => {
    let changeHandler = null;

    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      get: () => null,
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'change') changeHandler = handler;
      return { remove: jest.fn() };
    });

    // Require after currentState is null so module-level initialState captures it,
    // matching the real startup race.
    const { AppStateProvider } = require('../../contexts/AppStateContext');
    render(
      <AppStateProvider>
        <Text>child</Text>
      </AppStateProvider>
    );

    expect(typeof changeHandler).toBe('function');

    // Permission dialog appears → 'inactive', then is dismissed → 'active'
    expect(() => {
      act(() => changeHandler('inactive'));
      act(() => changeHandler('active'));
    }).not.toThrow();
  });

  it('reports instead of dying when a listener dependency throws', () => {
    let changeHandler = null;

    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
      if (type === 'change') changeHandler = handler;
      return { remove: jest.fn() };
    });
    const LoggingService = require('../../services/LoggingService');
    LoggingService.info.mockImplementation(() => {
      throw new Error('logging exploded');
    });
    const Sentry = require('@sentry/react-native');

    const { AppStateProvider } = require('../../contexts/AppStateContext');
    render(
      <AppStateProvider>
        <Text>child</Text>
      </AppStateProvider>
    );

    expect(() => act(() => changeHandler('active'))).not.toThrow();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
