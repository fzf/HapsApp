import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import LoggingService from './services/LoggingService';
import APIService, { APIError } from './services/APIService';

const AuthContext = createContext();

// SecureStore options: AFTER_FIRST_UNLOCK allows keychain access when the device
// is locked *after* having been unlocked at least once since boot. This prevents
// the "logout on background" bug caused by the keychain being inaccessible while
// the device is locked and the app tries to restore auth state on foreground.
const SECURE_STORE_OPTIONS = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

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
    const token = await SecureStore.getItemAsync('authToken', SECURE_STORE_OPTIONS);
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
  // Tracks whether initial auth load completed
  const authLoadedRef = useRef(false);

  useEffect(() => {
    checkAuthState();
    // Register 401 handler so any API call that returns unauthorized triggers logout
    APIService.setUnauthorizedHandler(handleUnauthorized);
    return () => APIService.setUnauthorizedHandler(null);
  }, []);

  // Re-verify auth when app comes back to foreground after being in background.
  // If the JS runtime was backgrounded and in-memory state was lost, restore from
  // SecureStore. The 401 handler above will catch expired tokens on the next API call.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && !isAuthenticated && !loading) {
        // Not authenticated in memory — try to restore from SecureStore.
        checkAuthState(/* silent */ true);
      }
    });
    return () => subscription?.remove();
  }, [isAuthenticated, loading]);

  const handleUnauthorized = async () => {
    // Server says our token is invalid — clear everything and go to login.
    console.warn('AuthContext: received 401, clearing session');
    LoggingService.info('Session expired - logging out', {
      event_type: 'authentication',
      action: 'session_expired',
    });
    try {
      await SecureStore.deleteItemAsync('authToken', SECURE_STORE_OPTIONS);
      await SecureStore.deleteItemAsync('user', SECURE_STORE_OPTIONS);
    } catch (e) {
      // Best-effort cleanup
    }
    clearCachedAuthToken();
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    authLoadedRef.current = false;
  };

  const checkAuthState = async (silent = false) => {
    try {
      // Fast path: if we already have an in-memory token and this is not a
      // silent background restore, skip the SecureStore round-trip.
      if (CACHED_AUTH_TOKEN && !silent) {
        return;
      }

      const storedToken = await SecureStore.getItemAsync('authToken', SECURE_STORE_OPTIONS);
      const storedUser = await SecureStore.getItemAsync('user', SECURE_STORE_OPTIONS);

      if (storedToken && storedUser) {
        let parsedUser;
        try {
          parsedUser = JSON.parse(storedUser);
        } catch (parseError) {
          console.error('Failed to parse stored user, clearing corrupted data:', parseError);
          await SecureStore.deleteItemAsync('authToken', SECURE_STORE_OPTIONS);
          await SecureStore.deleteItemAsync('user', SECURE_STORE_OPTIONS);
          return;
        }

        setToken(storedToken);
        setUser(parsedUser);
        setIsAuthenticated(true);
        authLoadedRef.current = true;
        updateCachedAuthToken(storedToken);
      }
    } catch (error) {
      // SecureStore can throw when the keychain is temporarily unavailable
      // (device locked, first boot before unlock). Do NOT log the user out —
      // fall back to the in-memory cache if available.
      console.warn('Error checking auth state from SecureStore:', error.message);

      if (CACHED_AUTH_TOKEN) {
        // Keep the user authenticated using the in-memory token
        console.log('Restoring auth from in-memory cache after SecureStore error');
        setIsAuthenticated(true);
        authLoadedRef.current = true;
      }
      // If no cached token either, fall through and let loading complete →
      // user will see login screen, which is correct.
    } finally {
      if (!silent) {
        setLoading(false);
      }
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
        await SecureStore.setItemAsync('authToken', data.token, SECURE_STORE_OPTIONS);
        await SecureStore.setItemAsync('user', JSON.stringify(data.user), SECURE_STORE_OPTIONS);

        setToken(data.token);
        setUser(data.user);
        setIsAuthenticated(true);
        authLoadedRef.current = true;

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
        await SecureStore.setItemAsync('authToken', data.token, SECURE_STORE_OPTIONS);
        await SecureStore.setItemAsync('user', JSON.stringify(data.user), SECURE_STORE_OPTIONS);

        setToken(data.token);
        setUser(data.user);
        setIsAuthenticated(true);
        authLoadedRef.current = true;

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
      if (token) {
        await APIService.logout();
      }

      await SecureStore.deleteItemAsync('authToken', SECURE_STORE_OPTIONS);
      await SecureStore.deleteItemAsync('user', SECURE_STORE_OPTIONS);

      clearCachedAuthToken();
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      authLoadedRef.current = false;
    } catch (error) {
      console.error('Logout error:', error);
      try {
        await SecureStore.deleteItemAsync('authToken', SECURE_STORE_OPTIONS);
        await SecureStore.deleteItemAsync('user', SECURE_STORE_OPTIONS);
      } catch (e) { /* best-effort */ }
      clearCachedAuthToken();
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      authLoadedRef.current = false;
    }
  };

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
