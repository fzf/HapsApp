import React from 'react';
import { AuthProvider } from './AuthContext';
import { AppStateProvider } from './contexts';
import { ErrorBoundary } from './components';
import { RootNavigator } from './navigation';

export default function App() {
  return (
    <ErrorBoundary
      name="App Root"
      friendlyMessage="The app encountered an error during startup. Please restart the app."
      showReportButton={true}
    >
      <AuthProvider>
        <AppStateProvider>
          <RootNavigator />
        </AppStateProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
