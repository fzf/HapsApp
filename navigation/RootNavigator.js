import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../AuthContext';
import { Screen, LoadingSpinner } from '../components';
import AppNavigator from './AppNavigator';
import AuthNavigator from './AuthNavigator';

/**
 * Root navigator that decides between app and auth navigation based on auth state
 */
const RootNavigator = () => {
  const { isAuthenticated, loading } = useAuth();

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
    <NavigationContainer>
      {isAuthenticated ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default RootNavigator;