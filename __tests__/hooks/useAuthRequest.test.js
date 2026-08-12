import { renderHook, act } from '@testing-library/react-native';
import { useAuthRequest, usePaginatedRequest, useFormRequest } from '../../hooks/useAuthRequest';

// useAuthRequest pulls `api`/`logout` from AuthContext's useAuth(), which
// throws outside an <AuthProvider>. Rather than mount the real provider
// (async SecureStore-backed auth check, real APIService singleton), mock
// useAuth directly so these hooks are tested in isolation.
const mockApi = {};
const mockLogout = jest.fn();
jest.mock('../../AuthContext', () => ({
  useAuth: () => ({ api: mockApi, logout: mockLogout }),
}));

describe('useAuthRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useAuthRequest());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.execute).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
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
    // execute() calls requestFn(api) - api comes from the mocked useAuth().
    expect(mockApiCall).toHaveBeenCalledWith(mockApi);
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
    // The hook stores a user-facing message string, not the raw Error object.
    expect(result.current.error).toBe('API Error');
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

  it('should clear the error via clearError', async () => {
    const { result } = renderHook(() => useAuthRequest());

    await act(async () => {
      await expect(result.current.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow();
    });
    expect(result.current.error).toBeTruthy();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBe(null);
  });
});

describe('usePaginatedRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with pagination state', () => {
    const { result } = renderHook(() => usePaginatedRequest());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.data).toEqual([]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.page).toBe(1);
    expect(typeof result.current.loadPage).toBe('function');
    expect(typeof result.current.loadMore).toBe('function');
    expect(typeof result.current.refresh).toBe('function');
  });

  it('should load a page via loadPage', async () => {
    const mockData = [{ id: 1 }, { id: 2 }];
    const mockApiCall = jest.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() => usePaginatedRequest());

    await act(async () => {
      await result.current.loadPage(mockApiCall, 1);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.page).toBe(1);
    // loadPage's requestFn is called as (api, pageToLoad, pageSize).
    expect(mockApiCall).toHaveBeenCalledWith(mockApi, 1, 20);
  });

  it('should append data when loading a subsequent page', async () => {
    const firstPage = { data: [{ id: 1 }, { id: 2 }], totalPages: 2 };
    const secondPage = { data: [{ id: 3 }, { id: 4 }], totalPages: 2 };

    const mockApiCall = jest.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    const { result } = renderHook(() => usePaginatedRequest());

    await act(async () => {
      await result.current.loadPage(mockApiCall, 1);
    });
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadPage(mockApiCall, 2);
    });

    expect(result.current.data).toEqual([...firstPage.data, ...secondPage.data]);
    expect(result.current.page).toBe(2);
    expect(result.current.hasMore).toBe(false);
  });

  it('should refresh data back to page 1', async () => {
    const initialData = [{ id: 1 }];
    const refreshedData = [{ id: 2 }];

    const mockApiCall = jest.fn()
      .mockResolvedValueOnce(initialData)
      .mockResolvedValueOnce(refreshedData);

    const { result } = renderHook(() => usePaginatedRequest());

    await act(async () => {
      await result.current.loadPage(mockApiCall, 1);
    });
    expect(result.current.data).toEqual(initialData);

    await act(async () => {
      await result.current.refresh(mockApiCall);
    });

    expect(result.current.data).toEqual(refreshedData);
    expect(result.current.page).toBe(1);
  });

  it('should set hasMore to false when no data is returned', async () => {
    const mockApiCall = jest.fn().mockResolvedValue([]);

    const { result } = renderHook(() => usePaginatedRequest());

    await act(async () => {
      await result.current.loadPage(mockApiCall, 1);
    });

    expect(result.current.hasMore).toBe(false);
  });

  // Task 0.5: product bug, see report — loadMore() always calls
  // loadPage(undefined, page + 1) (hooks/useAuthRequest.js), so it never has
  // a requestFn to invoke. loadPage's inner call to `requestFn(api, ...)`
  // throws "requestFn is not a function", which loadPage's own catch block
  // silently swallows (console.warn only) — so loadMore() is a permanent
  // no-op today. There is no current working behavior to assert here.
  it.todo('loadMore() should load the next page (product bug: loadMore never receives/stores a requestFn, see task-0.5 report)');
});

describe('useFormRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with form state', () => {
    const { result } = renderHook(() => useFormRequest());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.success).toBe(false);
    expect(typeof result.current.submit).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('should handle successful form submission', async () => {
    const mockData = { success: true };
    const mockApiCall = jest.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() => useFormRequest());

    await act(async () => {
      const response = await result.current.submit(mockApiCall);
      expect(response).toEqual(mockData);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.success).toBe(true);
    expect(mockApiCall).toHaveBeenCalledWith(mockApi);
  });

  it('should handle form submission errors', async () => {
    const mockError = new Error('Validation failed');
    const mockApiCall = jest.fn().mockRejectedValue(mockError);

    const { result } = renderHook(() => useFormRequest());

    await act(async () => {
      await expect(result.current.submit(mockApiCall)).rejects.toThrow('Validation failed');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Validation failed');
    expect(result.current.success).toBe(false);
  });

  it('should reset form state', () => {
    const { result } = renderHook(() => useFormRequest());

    act(() => {
      result.current.reset();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.success).toBe(false);
  });
});
