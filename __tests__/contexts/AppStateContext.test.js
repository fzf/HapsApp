import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('../../services', () => ({
  LocationService: {
    checkLocationPermission: jest.fn(() => Promise.resolve(true)),
    isLocationTrackingActive: jest.fn(() => Promise.resolve(false)),
    startTracking: jest.fn(() => Promise.resolve(true)),
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

jest.mock('../../AuthContext', () => ({
  useAuth: jest.fn(),
}));

import { AppStateProvider } from '../../contexts/AppStateContext';
import { LocationService } from '../../services';
import { useAuth } from '../../AuthContext';

const renderProvider = () =>
  render(
    <AppStateProvider>
      <Text>child</Text>
    </AppStateProvider>
  );

describe('AppStateProvider auto-start location tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts location tracking on launch when a user is signed in', async () => {
    useAuth.mockReturnValue({ user: { id: 1, email: 'fletch@fzf.me' } });

    renderProvider();

    await waitFor(() => {
      expect(LocationService.startTracking).toHaveBeenCalledTimes(1);
    });
  });

  it('does not start tracking when no user is signed in', async () => {
    useAuth.mockReturnValue({ user: null });

    renderProvider();

    // Give any pending init effects a chance to run before asserting
    await waitFor(() => {
      expect(LocationService.checkLocationPermission).toHaveBeenCalled();
    });
    expect(LocationService.startTracking).not.toHaveBeenCalled();
  });

  it('starts tracking once the user signs in after launch', async () => {
    useAuth.mockReturnValue({ user: null });
    const { rerender } = renderProvider();

    await waitFor(() => {
      expect(LocationService.checkLocationPermission).toHaveBeenCalled();
    });
    expect(LocationService.startTracking).not.toHaveBeenCalled();

    useAuth.mockReturnValue({ user: { id: 1, email: 'fletch@fzf.me' } });
    rerender(
      <AppStateProvider>
        <Text>child</Text>
      </AppStateProvider>
    );

    await waitFor(() => {
      expect(LocationService.startTracking).toHaveBeenCalledTimes(1);
    });
  });

  it('survives a startTracking failure without crashing', async () => {
    useAuth.mockReturnValue({ user: { id: 1 } });
    LocationService.startTracking.mockRejectedValueOnce(new Error('permissions denied'));

    const { getByText } = renderProvider();

    await waitFor(() => {
      expect(LocationService.startTracking).toHaveBeenCalled();
    });
    expect(getByText('child')).toBeTruthy();
  });
});
