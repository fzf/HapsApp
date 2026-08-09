import './config/sentry-init';
import 'react-native-gesture-handler';
import React from 'react';
import * as Sentry from '@sentry/react-native';
// Import task definitions early to ensure background tasks are defined
import './taskDefinitions';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider } from './src/theme';
import { AuthProvider } from './AuthContext';
import { AppStateProvider } from './contexts';
import { ErrorBoundary } from './components';
import { RootNavigator } from './navigation';

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
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
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);
