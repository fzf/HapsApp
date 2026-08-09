import React from 'react';
import * as Sentry from '@sentry/react-native';
// Import task definitions early to ensure background tasks are defined
import './taskDefinitions';
import { initSentry } from './config/sentry';
import { AuthProvider } from './AuthContext';
import { AppStateProvider } from './contexts';
import { ErrorBoundary } from './components';
import { RootNavigator } from './navigation';

initSentry();

function App() {
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

export default Sentry.wrap(App);
