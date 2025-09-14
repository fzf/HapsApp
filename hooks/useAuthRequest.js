import { useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { APIError } from '../services/APIService';

/**
 * Custom hook for making authenticated API requests with built-in loading and error states
 * Provides consistent error handling and loading patterns across the app
 */
export const useAuthRequest = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { api, logout } = useAuth();

  const execute = useCallback(async (requestFn) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await requestFn(api);
      return result;
    } catch (err) {
      console.error('API request failed:', err);
      
      // Handle authentication errors by logging out
      if (err instanceof APIError && err.isAuthError) {
        console.warn('Authentication error, logging out user');
        await logout();
        setError('Your session has expired. Please log in again.');
        return null;
      }
      
      // Set user-friendly error messages
      let errorMessage = 'An unexpected error occurred';
      
      if (err instanceof APIError) {
        if (err.isNetworkError) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (err.isTimeout) {
          errorMessage = 'Request timed out. Please try again.';
        } else if (err.isServerError) {
          errorMessage = 'Server error. Please try again later.';
        } else {
          errorMessage = err.message;
        }
      } else {
        errorMessage = err.message || errorMessage;
      }
      
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api, logout]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    execute,
    loading,
    error,
    clearError,
  };
};

/**
 * Hook for making paginated API requests
 */
export const usePaginatedRequest = (initialPage = 1, pageSize = 20) => {
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const { execute, loading, error, clearError } = useAuthRequest();

  const loadPage = useCallback(async (requestFn, pageToLoad = page, reset = false) => {
    try {
      const result = await execute(async (api) => {
        return await requestFn(api, pageToLoad, pageSize);
      });

      if (result) {
        const newData = result.data || result;
        const totalPages = result.totalPages || Math.ceil((result.total || newData.length) / pageSize);
        
        if (reset || pageToLoad === 1) {
          setData(newData);
        } else {
          setData(prev => [...prev, ...newData]);
        }
        
        setHasMore(pageToLoad < totalPages);
        setPage(pageToLoad);
      }
    } catch (err) {
      // Error is handled by useAuthRequest
      console.warn('Paginated request failed:', err.message);
    }
  }, [execute, page, pageSize]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      loadPage(undefined, page + 1);
    }
  }, [hasMore, loading, loadPage, page]);

  const refresh = useCallback(async (requestFn) => {
    await loadPage(requestFn, 1, true);
  }, [loadPage]);

  return {
    data,
    loading,
    error,
    hasMore,
    page,
    loadPage,
    loadMore,
    refresh,
    clearError,
  };
};

/**
 * Hook for form submissions with loading and error states
 */
export const useFormRequest = () => {
  const { execute, loading, error, clearError } = useAuthRequest();
  const [success, setSuccess] = useState(false);

  const submit = useCallback(async (requestFn) => {
    try {
      setSuccess(false);
      const result = await execute(requestFn);
      setSuccess(true);
      return result;
    } catch (err) {
      setSuccess(false);
      throw err;
    }
  }, [execute]);

  const reset = useCallback(() => {
    setSuccess(false);
    clearError();
  }, [clearError]);

  return {
    submit,
    loading,
    error,
    success,
    clearError,
    reset,
  };
};