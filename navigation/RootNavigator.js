import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useColorScheme } from 'react-native';
import { useAuth } from '../AuthContext';
import { Screen, LoadingSpinner } from '../components';
import AppTabs from '../src/navigation/AppTabs';
import AuthNavigator from './AuthNavigator';

/**
 * Root navigator that decides between app and auth navigation based on auth state
 */
const RootNavigator = () => {
  const { isAuthenticated, loading } = useAuth();
  const scheme = useColorScheme();

  if (loading) {
    return (
      <Screen
        loading={true}
        loadingMessage="Loading..."
        safeArea={true}
        showErrorBoundary={false}
      />
    );
  }

  return (
    <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {isAuthenticated ? <AppTabs /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default RootNavigator;