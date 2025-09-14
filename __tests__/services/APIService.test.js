import APIService, { APIError } from '../../services/APIService';

// Mock fetch
global.fetch = jest.fn();

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
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        status: 200,
      });

      const result = await APIService.request('/test');
      
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/test',
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
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
        status: 200,
      });

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
      fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => errorResponse,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(APIService.request('/test')).rejects.toThrow(APIError);
    });

    it('should retry on network failure', async () => {
      fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
          status: 200,
        });

      const result = await APIService.request('/test');
      
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true });
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
        status: 200,
      });
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
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'new-token', user: { id: 1 } }),
        status: 200,
      });
    });

    it('should handle login', async () => {
      const email = 'test@example.com';
      const password = 'password';
      const result = await APIService.login(email, password);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ user: { email, password } }),
        })
      );
      expect(result.token).toBe('new-token');
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
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
        status: 200,
      });
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
});