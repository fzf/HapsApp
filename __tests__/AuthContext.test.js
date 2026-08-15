import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';
import { AuthProvider, useAuth } from '../AuthContext';

// The startup auth check reads SecureStore and JSON.parses the stored user.
// Both can fail on a corrupted install, and both were previously swallowed
// into console.error — invisible in Sentry.
function AuthProbe() {
  const { loading } = useAuth();
  return <Text>{loading ? 'loading' : 'ready'}</Text>;
}

const renderProvider = async () => {
  const view = render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>
  );
  await waitFor(() => view.getByText('ready'));
  return view;
};

describe('AuthProvider startup auth check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports a SecureStore read failure to Sentry', async () => {
    const failure = new Error('keychain unavailable');
    SecureStore.getItemAsync.mockRejectedValue(failure);

    await renderProvider();

    expect(Sentry.captureException).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        tags: expect.objectContaining({ section: 'auth_startup' }),
      })
    );
  });

  it('reports corrupted stored user JSON to Sentry', async () => {
    SecureStore.getItemAsync.mockImplementation(async (key) =>
      key === 'authToken' ? 'a-token' : '{not valid json'
    );

    await renderProvider();

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(SyntaxError),
      expect.objectContaining({
        tags: expect.objectContaining({ section: 'auth_startup' }),
      })
    );
  });

  it('does not report to Sentry when there is no stored session', async () => {
    SecureStore.getItemAsync.mockResolvedValue(null);

    await renderProvider();

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
