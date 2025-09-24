import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import LoggingService from './services/LoggingService';
import APIService, { APIError } from './services/APIService';

const AuthContext = createContext();

const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://localhost:3000' : 'https://haps.app');

// Initialize API service with auth token when available
const initializeAPIService = (token) => {
  APIService.setCachedAuthToken(token);
};

// Global auth token cache for background tasks
// This prevents SecureStore access issues in background contexts
let CACHED_AUTH_TOKEN = null;

// Helper function to safely get auth token for background tasks
export async function getAuthTokenForBackgroundTask() {
  try {
    // First try to use cached token
    if (CACHED_AUTH_TOKEN) {
      return CACHED_AUTH_TOKEN;
    }

    // Only try SecureStore if we're in foreground or if necessary
    // This helps avoid "User interaction is not allowed" errors
    const token = await SecureStore.getItemAsync('authToken');
    if (token) {
      CACHED_AUTH_TOKEN = token; // Cache for future background use
      return token;
    }

    return null;
  } catch (error) {
    // Don't log SecureStore errors to Sentry as they're expected in background
    console.warn('Could not retrieve auth token for background task:', error.message);
    return CACHED_AUTH_TOKEN; // Return cached token if available
  }
}

// Helper function to update cached auth token
export function updateCachedAuthToken(token) {
  CACHED_AUTH_TOKEN = token;
  initializeAPIService(token);
}

// Helper function to clear cached auth token
export function clearCachedAuthToken() {
  CACHED_AUTH_TOKEN = null;
  APIService.clearCachedAuthToken();
}

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const storedToken = await SecureStore.getItemAsync('authToken');
      const storedUser = await SecureStore.getItemAsync('user');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
        // Update the cached token for background tasks
        updateCachedAuthToken(storedToken);
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      LoggingService.info('Login attempt started', {
        event_type: 'authentication',
        action: 'login_attempt',
        email: email,
      });

      const data = await APIService.login(email, password);
      console.log('Login response data received', data);

      if (data && data.token) {
        await SecureStore.setItemAsync('authToken', data.token);
        await SecureStore.setItemAsync('user', JSON.stringify(data.user));

        setToken(data.token);
        setUser(data.user);
        setIsAuthenticated(true);

        // Update the cached token for background tasks
        updateCachedAuthToken(data.token);

        LoggingService.info('Login successful', {
          event_type: 'authentication',
          action: 'login_success',
          user_id: data.user?.id,
          email: data.user?.email
        });

        return { success: true };
      } else {
        return { success: false, error: 'Invalid response from server' };
      }
    } catch (error) {
      LoggingService.error('Login error', error, {
        event_type: 'authentication',
        action: 'login_error',
        email: email,
        error_message: error.message,
        error_status: error.status,
      });

      console.error('Login error:', error);
      
      if (error instanceof APIError) {
        return { success: false, error: error.message };
      }
      
      return { success: false, error: `Network error: ${error.message}` };
    }
  };

  const register = async (email, password, passwordConfirmation) => {
    try {
      const data = await APIService.register(email, password, passwordConfirmation);

      if (data && data.token) {
        await SecureStore.setItemAsync('authToken', data.token);
        await SecureStore.setItemAsync('user', JSON.stringify(data.user));

        setToken(data.token);
        setUser(data.user);
        setIsAuthenticated(true);

        // Update the cached token for background tasks
        updateCachedAuthToken(data.token);

        return { success: true };
      } else {
        return { success: false, error: 'Invalid response from server' };
      }
    } catch (error) {
      console.error('Registration error:', error);
      
      if (error instanceof APIError) {
        return { success: false, error: error.message };
      }
      
      return { success: false, error: 'Network error' };
    }
  };

  const logout = async () => {
    try {
      // Optional: Call logout endpoint
      if (token) {
        await APIService.logout();
      }

      // Clear stored credentials
      await SecureStore.deleteItemAsync('authToken');
      await SecureStore.deleteItemAsync('user');

      // Clear cached token for background tasks
      clearCachedAuthToken();

      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout API call fails, clear local state
      await SecureStore.deleteItemAsync('authToken');
      await SecureStore.deleteItemAsync('user');
      clearCachedAuthToken();
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  // Provide direct access to authenticated API service
  const api = APIService;

  const value = {
    isAuthenticated,
    user,
    token,
    loading,
    login,
    register,
    logout,
    api,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
