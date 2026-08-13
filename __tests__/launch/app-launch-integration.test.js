/**
 * Launch-path integration test: real AuthContext, real contexts, real
 * services (only Expo/RN native primitives are mocked in jest-setup).
 *
 * Mimics a cold start on a device with cached credentials: taskDefinitions
 * evaluate first (as in App.js), then the provider stack mounts, auth
 * restores the stored user, and AppStateProvider auto-starts tracking.
 */
import '../../taskDefinitions';
import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';

import { AuthProvider } from '../../AuthContext';
import { AppStateProvider } from '../../contexts';

describe('cold start with cached credentials (real modules)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SecureStore.getItemAsync.mockImplementation(async (key) => {
      if (key === 'authToken') return 'test-token';
      if (key === 'user') return JSON.stringify({ id: 1, email: 'fletch@fzf.me' });
      return null;
    });
    Location.getForegroundPermissionsAsync = jest.fn(() => Promise.resolve({ status: 'granted' }));
    Location.getBackgroundPermissionsAsync = jest.fn(() => Promise.resolve({ status: 'granted' }));
  });

  it('mounts the provider stack and auto-starts location tracking without throwing', async () => {
    const { getByText } = render(
      <AuthProvider>
        <AppStateProvider>
          <Text>launched</Text>
        </AppStateProvider>
      </AuthProvider>
    );

    expect(getByText('launched')).toBeTruthy();

    await waitFor(
      () => {
        expect(Location.startLocationUpdatesAsync).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );
  });
});
