import { renderHook, act } from '@testing-library/react-native';
import { useAuthRequest, usePaginatedRequest, useFormRequest } from '../../hooks/useAuthRequest';
import { APIService } from '../../services/APIService';

// Mock APIService
jest.mock('../../services/APIService');

describe('useAuthRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useAuthRequest());
    
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.data).toBe(null);
    expect(typeof result.current.execute).toBe('function');
  });

  it('should handle successful API call', async () => {
    const mockData = { success: true };
    const mockApiCall = jest.fn().mockResolvedValue(mockData);
    
    const { result } = renderHook(() => useAuthRequest());
    
    await act(async () => {
      const response = await result.current.execute(mockApiCall);
      expect(response).toEqual(mockData);
    });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.data).toEqual(mockData);
    expect(mockApiCall).toHaveBeenCalledTimes(1);
  });

  it('should handle API errors', async () => {
    const mockError = new Error('API Error');
    const mockApiCall = jest.fn().mockRejectedValue(mockError);
    
    const { result } = renderHook(() => useAuthRequest());
    
    await act(async () => {
      await expect(result.current.execute(mockApiCall)).rejects.toThrow('API Error');
    });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toEqual(mockError);
    expect(result.current.data).toBe(null);
  });

  it('should set loading state during API call', async () => {
    let resolvePromise;
    const mockApiCall = jest.fn(() => new Promise(resolve => { resolvePromise = resolve; }));
    
    const { result } = renderHook(() => useAuthRequest());
    
    act(() => {
      result.current.execute(mockApiCall);
    });
    
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(null);
    
    await act(async () => {
      resolvePromise({ success: true });
    });
    
    expect(result.current.loading).toBe(false);
  });

  it('should reset error on new request', async () => {
    const { result } = renderHook(() => useAuthRequest());
    
    // First request that fails
    await act(async () => {
      await expect(result.current.execute(() => Promise.reject(new Error('First error')))).rejects.toThrow();
    });
    
    expect(result.current.error).toBeTruthy();
    
    // Second request that succeeds
    await act(async () => {
      await result.current.execute(() => Promise.resolve({ success: true }));
    });
    
    expect(result.current.error).toBe(null);
  });
});

describe('usePaginatedRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with pagination state', () => {
    const mockApiCall = jest.fn();
    const { result } = renderHook(() => usePaginatedRequest(mockApiCall));
    
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.data).toEqual([]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.page).toBe(1);
    expect(typeof result.current.loadMore).toBe('function');
    expect(typeof result.current.refresh).toBe('function');
  });

  it('should load first page', async () => {
    const mockData = [{ id: 1 }, { id: 2 }];
    const mockApiCall = jest.fn().mockResolvedValue(mockData);
    
    const { result } = renderHook(() => usePaginatedRequest(mockApiCall));
    
    await act(async () => {
      await result.current.loadMore();
    });
    
    expect(result.current.data).toEqual(mockData);
    expect(result.current.page).toBe(2);
    expect(mockApiCall).toHaveBeenCalledWith(1);
  });

  it('should append data on loadMore', async () => {
    const firstPage = [{ id: 1 }, { id: 2 }];
    const secondPage = [{ id: 3 }, { id: 4 }];
    
    const mockApiCall = jest.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    
    const { result } = renderHook(() => usePaginatedRequest(mockApiCall));
    
    // Load first page
    await act(async () => {
      await result.current.loadMore();
    });
    
    // Load second page
    await act(async () => {
      await result.current.loadMore();
    });
    
    expect(result.current.data).toEqual([...firstPage, ...secondPage]);
    expect(result.current.page).toBe(3);
  });

  it('should refresh data', async () => {
    const initialData = [{ id: 1 }];
    const refreshedData = [{ id: 2 }];
    
    const mockApiCall = jest.fn()
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce(refreshedData);
    
    const { result } = renderHook(() => usePaginatedRequest(mockApiCall));
    
    // Load initial data
    await act(async () => {
      await result.current.loadMore();
    });
    
    expect(result.current.data).toEqual(initialData);
    
    // Refresh
    await act(async () => {
      await result.current.refresh();
    });
    
    expect(result.current.data).toEqual(refreshedData);
    expect(result.current.page).toBe(2);
  });

  it('should set hasMore to false when no data returned', async () => {
    const mockApiCall = jest.fn().mockResolvedValue([]);
    
    const { result } = renderHook(() => usePaginatedRequest(mockApiCall));
    
    await act(async () => {
      await result.current.loadMore();
    });
    
    expect(result.current.hasMore).toBe(false);
  });
});

describe('useFormRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with form state', () => {
    const mockApiCall = jest.fn();
    const { result } = renderHook(() => useFormRequest(mockApiCall));
    
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.success).toBe(false);
    expect(typeof result.current.submit).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('should handle successful form submission', async () => {
    const mockData = { success: true };
    const formData = { name: 'test' };
    const mockApiCall = jest.fn().mockResolvedValue(mockData);
    
    const { result } = renderHook(() => useFormRequest(mockApiCall));
    
    await act(async () => {
      const response = await result.current.submit(formData);
      expect(response).toEqual(mockData);
    });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.success).toBe(true);
    expect(mockApiCall).toHaveBeenCalledWith(formData);
  });

  it('should handle form submission errors', async () => {
    const mockError = new Error('Validation failed');
    const mockApiCall = jest.fn().mockRejectedValue(mockError);
    
    const { result } = renderHook(() => useFormRequest(mockApiCall));
    
    await act(async () => {
      await expect(result.current.submit({})).rejects.toThrow('Validation failed');
    });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toEqual(mockError);
    expect(result.current.success).toBe(false);
  });

  it('should reset form state', () => {
    const mockApiCall = jest.fn();
    const { result } = renderHook(() => useFormRequest(mockApiCall));
    
    // Simulate some state changes
    act(() => {
      result.current.reset();
    });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.success).toBe(false);
  });
});