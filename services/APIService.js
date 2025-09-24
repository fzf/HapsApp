import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import LoggingService from './LoggingService';

/**
 * Centralized API service for handling all HTTP requests
 * Provides consistent error handling, authentication, and request/response patterns
 */
class APIService {
  constructor() {
    this.baseURL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://localhost:3000' : 'https://haps.app');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-App-Signature': 'HapsApp-Production-v1.0',
      'User-Agent': `HapsApp/${Platform.OS === 'ios' ? 'iOS' : 'Android'}/Production`,
    };
    this.cachedAuthToken = null;
  }

  /**
   * Set cached auth token for background tasks
   */
  setCachedAuthToken(token) {
    this.cachedAuthToken = token;
  }

  /**
   * Clear cached auth token
   */
  clearCachedAuthToken() {
    this.cachedAuthToken = null;
  }

  /**
   * Get auth token from secure store or cache
   */
  async getAuthToken() {
    try {
      if (this.cachedAuthToken) {
        return this.cachedAuthToken;
      }

      const token = await SecureStore.getItemAsync('authToken');
      if (token) {
        this.cachedAuthToken = token;
        return token;
      }

      return null;
    } catch (error) {
      console.warn('Could not retrieve auth token:', error.message);
      return this.cachedAuthToken;
    }
  }

  /**
   * Build full URL from endpoint
   */
  buildURL(endpoint) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this.baseURL}${cleanEndpoint}`;
  }

  /**
   * Build request headers with optional authentication
   */
  async buildHeaders(options = {}) {
    const headers = { ...this.defaultHeaders, ...options.headers };
    
    if (options.authenticated !== false) {
      const token = await this.getAuthToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    return headers;
  }

  /**
   * Handle API response and errors consistently
   */
  async handleResponse(response, options = {}) {
    const { endpoint, method, skipLogging = false } = options;

    if (!skipLogging) {
      LoggingService.info('API request completed', {
        event_type: 'api_request',
        action: 'response_received',
        method,
        endpoint,
        status: response.status,
        status_text: response.statusText,
      });
    }

    // Handle different content types
    const contentType = response.headers.get('content-type');
    let data = null;

    try {
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    } catch (parseError) {
      LoggingService.warn('Failed to parse response body', {
        event_type: 'api_request',
        action: 'parse_error',
        endpoint,
        error: parseError.message,
      });
    }

    if (!response.ok) {
      const error = new APIError(
        data?.error || data?.message || `HTTP ${response.status}`,
        response.status,
        data,
        endpoint
      );

      if (!skipLogging) {
        LoggingService.error('API request failed', error, {
          event_type: 'api_request',
          action: 'request_failed',
          endpoint,
          status: response.status,
          error_data: data,
        });
      }

      throw error;
    }

    return data;
  }

  /**
   * Generic request method
   */
  async request(endpoint, options = {}) {
    const { method = 'GET', body, timeout = 30000, skipLogging = false, ...otherOptions } = options;
    const url = this.buildURL(endpoint);
    const headers = await this.buildHeaders(otherOptions);

    if (!skipLogging) {
      LoggingService.info('API request started', {
        event_type: 'api_request',
        action: 'request_start',
        method,
        endpoint,
        url,
        has_body: !!body,
      });
    }

    const requestOptions = {
      method,
      headers,
      ...otherOptions,
    };

    if (body && method !== 'GET') {
      requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    // Add timeout support
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    requestOptions.signal = controller.signal;

    try {
      const response = await fetch(url, requestOptions);
      clearTimeout(timeoutId);
      
      return await this.handleResponse(response, {
        endpoint,
        method,
        skipLogging,
      });
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        const timeoutError = new APIError(
          `Request timeout after ${timeout}ms`,
          408,
          null,
          endpoint
        );
        
        if (!skipLogging) {
          LoggingService.error('API request timeout', timeoutError, {
            event_type: 'api_request',
            action: 'request_timeout',
            endpoint,
            timeout,
          });
        }
        
        throw timeoutError;
      }

      if (error instanceof APIError) {
        throw error;
      }

      const networkError = new APIError(
        error.message || 'Network error',
        0,
        null,
        endpoint
      );

      if (!skipLogging) {
        LoggingService.error('API network error', networkError, {
          event_type: 'api_request',
          action: 'network_error',
          endpoint,
          error_message: error.message,
        });
      }

      throw networkError;
    }
  }

  /**
   * Test API connectivity
   */
  async testConnectivity() {
    try {
      await this.request('/up', {
        method: 'GET',
        authenticated: false,
        timeout: 10000,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  // Convenience methods for different HTTP verbs
  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body });
  }

  async put(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', body });
  }

  async patch(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PATCH', body });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  // Authentication-specific methods
  async login(email, password) {
    const isConnected = await this.testConnectivity();
    if (!isConnected) {
      throw new APIError(
        `Cannot connect to server at ${this.baseURL}. Please check your internet connection.`,
        0,
        null,
        '/api/sessions'
      );
    }

    return this.post('/api/sessions', {
      user: { email, password }
    }, { authenticated: false });
  }

  async register(email, password, passwordConfirmation) {
    return this.post('/api/registrations', {
      user: {
        email,
        password,
        password_confirmation: passwordConfirmation,
      }
    }, { authenticated: false });
  }

  async logout() {
    try {
      await this.delete('/api/sessions');
    } catch (error) {
      // Ignore logout errors - we'll clear local state anyway
      console.warn('Logout API call failed:', error.message);
    }
  }

  // Location-specific methods
  async uploadLocations(locations) {
    return this.post('/users/locations', { locations });
  }

  // Timeline-specific methods
  async getTimelineForDate(dateString) {
    return this.get(`/api/timeline?date=${dateString}`);
  }

  async getTimelineForDateRange(startDate, endDate) {
    return this.get(`/api/timeline?start_date=${startDate}&end_date=${endDate}`);
  }
}

/**
 * Custom API Error class for better error handling
 */
class APIError extends Error {
  constructor(message, status, data, endpoint) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
    this.endpoint = endpoint;
  }

  get isNetworkError() {
    return this.status === 0;
  }

  get isTimeout() {
    return this.status === 408;
  }

  get isClientError() {
    return this.status >= 400 && this.status < 500;
  }

  get isServerError() {
    return this.status >= 500 && this.status < 600;
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
}

// Export singleton instance and error class
const apiService = new APIService();
export { APIError };
export default apiService;