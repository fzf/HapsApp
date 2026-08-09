import APIService, { APIError } from '../../services/APIService';

// LoggingService makes its own real `fetch` call (to Better Stack) on every
// APIService request. Left un-mocked it shares the same mocked global.fetch
// queue as the requests under test, silently stealing queued responses and
// flooding the console with its debug logs. Mock it away so tests exercise
// only the HTTP behavior they're asserting on.
jest.mock('../../services/LoggingService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    location: jest.fn(),
    sync: jest.fn(),
    backgroundTask: jest.fn(),
    flush: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

// APIService.handleResponse() always reads response.headers.get('content-type'),
// so every mocked response needs a headers object with a .get() method.
const jsonResponse = (data, { ok = true, status = 200, statusText = 'OK' } = {}) => ({
  ok,
  status,
  statusText,
  headers: { get: () => 'application/json' },
  json: async () => data,
});

describe('APIService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    APIService.clearCachedAuthToken();
  });

  describe('setCachedAuthToken', () => {
    it('should set cached authentication token', () => {
      APIService.setCachedAuthToken('test-token');
      expect(APIService.cachedAuthToken).toBe('test-token');
    });
  });

  describe('clearCachedAuthToken', () => {
    it('should clear cached authentication token', () => {
      APIService.setCachedAuthToken('test-token');
      APIService.clearCachedAuthToken();
      expect(APIService.cachedAuthToken).toBe(null);
    });
  });

  describe('request', () => {
    it('should make successful GET request', async () => {
      const mockResponse = { data: 'test' };
      fetch.mockResolvedValueOnce(jsonResponse(mockResponse));

      const result = await APIService.request('/test');

      expect(fetch).toHaveBeenCalledWith(
        `${process.env.EXPO_PUBLIC_API_URL}/test`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should include Authorization header when token is set', async () => {
      APIService.setCachedAuthToken('test-token');
      fetch.mockResolvedValueOnce(jsonResponse({}));

      await APIService.request('/test');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
    });

    it('should throw APIError on HTTP error', async () => {
      const errorResponse = { error: 'Not found' };
      fetch.mockResolvedValueOnce(jsonResponse(errorResponse, { ok: false, status: 404, statusText: 'Not Found' }));

      let caught;
      try {
        await APIService.request('/test');
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(APIError);
      expect(caught).toMatchObject({ status: 404, data: errorResponse });
    });

    it('should convert a raw fetch failure into a network APIError (no retry)', async () => {
      // Current APIService has no retry logic: a rejected fetch() is wrapped
      // once into an APIError and thrown straight through.
      fetch.mockRejectedValueOnce(new Error('Network error'));

      let caught;
      try {
        await APIService.request('/test');
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(APIError);
      expect(caught).toMatchObject({ isNetworkError: true, status: 0 });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      fetch.mockResolvedValue(jsonResponse({ success: true }));
    });

    it('should handle GET requests', async () => {
      await APIService.get('/test');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle POST requests with data', async () => {
      const data = { key: 'value' };
      await APIService.post('/test', data);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
        })
      );
    });

    it('should handle PUT requests', async () => {
      const data = { key: 'updated' };
      await APIService.put('/test', data);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(data),
        })
      );
    });

    it('should handle DELETE requests', async () => {
      await APIService.delete('/test');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('authentication methods', () => {
    beforeEach(() => {
      fetch.mockResolvedValue(jsonResponse({ token: 'new-token', user: { id: 1 } }));
    });

    it('should handle login', async () => {
      const email = 'test@example.com';
      const password = 'password';
      const result = await APIService.login(email, password);

      // login() first calls testConnectivity() (GET /up), then POSTs to
      // /api/sessions, so fetch is called twice here.
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ user: { email, password } }),
        })
      );
      expect(result.token).toBe('new-token');
    });

    it('should throw when the server is unreachable', async () => {
      // testConnectivity() fails => login() short-circuits without ever
      // POSTing to /api/sessions.
      fetch.mockReset();
      fetch.mockRejectedValue(new Error('offline'));

      await expect(APIService.login('test@example.com', 'password')).rejects.toThrow(APIError);
      expect(fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions'),
        expect.anything()
      );
    });

    it('should handle registration', async () => {
      const email = 'test@example.com';
      const password = 'password';
      const passwordConfirmation = 'password';
      const result = await APIService.register(email, password, passwordConfirmation);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/registrations'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            user: { email, password, password_confirmation: passwordConfirmation }
          }),
        })
      );
      expect(result.token).toBe('new-token');
    });
  });

  describe('location methods', () => {
    beforeEach(() => {
      fetch.mockResolvedValue(jsonResponse({ success: true }));
    });

    it('should upload locations', async () => {
      const locations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() }
      ];

      await APIService.uploadLocations(locations);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/users/locations'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ locations }),
        })
      );
    });

    it('should get timeline', async () => {
      const date = '2023-01-01';
      await APIService.getTimelineForDate(date);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/timeline?date=${date}`),
        expect.objectContaining({ method: 'GET' })
      );
    });
  });
});

describe('APIError', () => {
  it('should create error with status and message', () => {
    const error = new APIError('Not Found', 404, { detail: 'Resource not found' }, '/api/test');

    expect(error.message).toBe('Not Found');
    expect(error.status).toBe(404);
    expect(error.data).toEqual({ detail: 'Resource not found' });
    expect(error.endpoint).toBe('/api/test');
    expect(error.name).toBe('APIError');
  });

  it('should be instanceof Error', () => {
    const error = new APIError('Server Error', 500);
    expect(error instanceof Error).toBe(true);
  });

  it('classifies status codes correctly', () => {
    expect(new APIError('x', 0).isNetworkError).toBe(true);
    expect(new APIError('x', 408).isTimeout).toBe(true);
    expect(new APIError('x', 404).isClientError).toBe(true);
    expect(new APIError('x', 500).isServerError).toBe(true);
    expect(new APIError('x', 401).isAuthError).toBe(true);
    expect(new APIError('x', 403).isAuthError).toBe(true);
  });
});

describe('TransactionsScreen API usage', () => {
  it('only calls methods that exist on APIService', () => {
    const APIService = require('../../services/APIService').default;
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../../components/TransactionsScreen.js'), 'utf8');
    const calls = [...source.matchAll(/APIService\.(\w+)\(/g)].map(m => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const method of calls) {
      expect(typeof APIService[method]).toBe('function');
    }
  });
});
