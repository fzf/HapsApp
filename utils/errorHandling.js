import LoggingService from '../services/LoggingService';
import { APIError } from '../services/APIService';

/**
 * Error handling utilities for consistent error processing across the app
 */

/**
 * Get user-friendly error message from error object
 */
export const getUserFriendlyErrorMessage = (error) => {
  if (error instanceof APIError) {
    if (error.isNetworkError) {
      return 'Network error. Please check your internet connection and try again.';
    }
    
    if (error.isTimeout) {
      return 'Request timed out. Please try again.';
    }
    
    if (error.isAuthError) {
      return 'Your session has expired. Please log in again.';
    }
    
    if (error.isServerError) {
      return 'Server error. Please try again later.';
    }
    
    // Return the API error message if it's user-friendly
    return error.message || 'An unexpected error occurred.';
  }
  
  // Handle common React Native/JavaScript errors
  if (error.message) {
    if (error.message.includes('Network request failed')) {
      return 'Network error. Please check your internet connection.';
    }
    
    if (error.message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    
    if (error.message.includes('JSON')) {
      return 'Data format error. Please try again or contact support.';
    }
  }
  
  // Generic fallback
  return 'An unexpected error occurred. Please try again.';
};

/**
 * Log error with context information
 */
export const logError = (error, context = {}) => {
  const errorInfo = {
    event_type: 'error',
    action: 'error_logged',
    error_type: error.constructor.name,
    error_message: error.message,
    error_stack: error.stack,
    ...context,
  };
  
  if (error instanceof APIError) {
    errorInfo.api_status = error.status;
    errorInfo.api_endpoint = error.endpoint;
    errorInfo.is_network_error = error.isNetworkError;
    errorInfo.is_timeout = error.isTimeout;
    errorInfo.is_auth_error = error.isAuthError;
    errorInfo.is_server_error = error.isServerError;
  }
  
  LoggingService.error('Application error occurred', error, errorInfo);
};

/**
 * Handle async operation with error logging and user-friendly messages
 */
export const handleAsyncOperation = async (
  operation,
  options = {}
) => {
  const {
    onSuccess,
    onError,
    errorContext = {},
    logError: shouldLogError = true,
  } = options;
  
  try {
    const result = await operation();
    
    if (onSuccess) {
      onSuccess(result);
    }
    
    return { success: true, data: result, error: null };
  } catch (error) {
    if (shouldLogError) {
      logError(error, errorContext);
    }
    
    const userMessage = getUserFriendlyErrorMessage(error);
    
    if (onError) {
      onError(error, userMessage);
    }
    
    return { 
      success: false, 
      data: null, 
      error: userMessage,
      originalError: error 
    };
  }
};

/**
 * Create error handler for React components
 */
export const createErrorHandler = (componentName, additionalContext = {}) => {
  return (error, errorContext = {}) => {
    logError(error, {
      component: componentName,
      ...additionalContext,
      ...errorContext,
    });
    
    return getUserFriendlyErrorMessage(error);
  };
};

/**
 * Retry wrapper with exponential backoff
 */
export const withRetry = async (
  operation,
  options = {}
) => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    shouldRetry = (error) => {
      // By default, retry on network errors and server errors
      if (error instanceof APIError) {
        return error.isNetworkError || error.isServerError;
      }
      return false;
    },
  } = options;
  
  let lastError;
  let delay = baseDelay;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }
  
  throw lastError;
};

/**
 * Safe async wrapper that prevents unhandled promise rejections
 */
export const safeAsync = (asyncFn, fallback = null) => {
  return async (...args) => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      console.warn('Safe async operation failed:', error);
      logError(error, { operation: 'safe_async' });
      return fallback;
    }
  };
};

/**
 * Debounced error handler to prevent spam logging
 */
export const createDebouncedErrorHandler = (handler, delay = 1000) => {
  let timeoutId = null;
  let lastError = null;
  
  return (error, context = {}) => {
    lastError = error;
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      handler(lastError, context);
      timeoutId = null;
      lastError = null;
    }, delay);
  };
};