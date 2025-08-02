import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import LoggingService from './services/LoggingService';

const AuthContext = createContext();

const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://localhost:3000' : 'https://haps.app');

// Add network connectivity test
const testApiConnectivity = async () => {
  try {
    LoggingService.info('Testing API connectivity', {
      event_type: 'connectivity',
      action: 'test_start',
      api_url: API_URL
    });

    const response = await fetch(`${API_URL}/api/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      timeout: 10000
    });

    LoggingService.info('API connectivity test result', {
      event_type: 'connectivity',
      action: 'test_result',
      status: response.status,
      api_url: API_URL,
      success: response.ok
    });

    return response.ok;
  } catch (error) {
    LoggingService.error('API connectivity test failed', error, {
      event_type: 'connectivity',
      action: 'test_failed',
      api_url: API_URL,
      error_message: error.message
    });
    return false;
  }
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
}

// Helper function to clear cached auth token
export function clearCachedAuthToken() {
  CACHED_AUTH_TOKEN = null;
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
        api_url: API_URL
      });

      // Test API connectivity first
      const isConnected = await testApiConnectivity();
      if (!isConnected) {
        return { 
          success: false, 
          error: `Cannot connect to server at ${API_URL}. Please check your internet connection.` 
        };
      }

      const response = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          user: {
            email,
            password,
          },
        }),
      });

      LoggingService.info('Login API response received', {
        event_type: 'authentication',
        action: 'api_response',
        status: response.status,
        status_text: response.statusText,
        api_url: API_URL
      });

      const data = await response.json();

      if (response.ok && data.token) {
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
        LoggingService.warn('Login failed', {
          event_type: 'authentication',
          action: 'login_failed',
          status: response.status,
          error: data.error || 'Login failed',
          response_data: data
        });

        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      LoggingService.error('Login network error', error, {
        event_type: 'authentication',
        action: 'login_error',
        email: email,
        api_url: API_URL,
        error_message: error.message
      });

      console.error('Login error:', error);
      return { success: false, error: `Network error: ${error.message}` };
    }
  };

  const register = async (email, password, passwordConfirmation) => {
    try {
      const response = await fetch(`${API_URL}/api/registrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          user: {
            email,
            password,
            password_confirmation: passwordConfirmation,
          },
        }),
      });

      const data = await response.json();

      if (response.ok && data.token) {
        await SecureStore.setItemAsync('authToken', data.token);
        await SecureStore.setItemAsync('user', JSON.stringify(data.user));

        setToken(data.token);
        setUser(data.user);
        setIsAuthenticated(true);

        // Update the cached token for background tasks
        updateCachedAuthToken(data.token);

        return { success: true };
      } else {
        return { success: false, error: data.error || 'Registration failed' };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Network error' };
    }
  };

  const logout = async () => {
    try {
      // Optional: Call logout endpoint
      if (token) {
        await fetch(`${API_URL}/api/sessions`, {
          method: 'DELETE',
          headers: {
            'Authorization': token,
            'Accept': 'application/json',
          },
        });
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

  const authenticatedFetch = async (url, options = {}) => {
    if (!token) {
      throw new Error('No authentication token available');
    }

    const defaultHeaders = {
      'Authorization': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const mergedOptions = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    return fetch(url, mergedOptions);
  };

  const value = {
    isAuthenticated,
    user,
    token,
    loading,
    login,
    register,
    logout,
    authenticatedFetch,
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
