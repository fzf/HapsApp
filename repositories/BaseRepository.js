import APIService, { APIError } from '../services/APIService';
import { logError } from '../utils/errorHandling';

/**
 * Base repository class providing common data access patterns
 */
class BaseRepository {
  constructor(endpoint, entityName = 'item') {
    this.endpoint = endpoint;
    this.entityName = entityName;
    this.apiService = APIService;
  }

  /**
   * Handle repository errors with consistent logging
   */
  handleError(error, operation, context = {}) {
    logError(error, {
      repository: this.constructor.name,
      operation,
      endpoint: this.endpoint,
      entity: this.entityName,
      ...context,
    });
    throw error;
  }

  /**
   * Get all items with optional query parameters
   */
  async findAll(params = {}) {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${this.endpoint}?${queryString}` : this.endpoint;
      return await this.apiService.get(url);
    } catch (error) {
      this.handleError(error, 'findAll', { params });
    }
  }

  /**
   * Get paginated items
   */
  async findPaginated(page = 1, limit = 20, params = {}) {
    try {
      const queryParams = {
        page,
        limit,
        ...params,
      };
      return await this.findAll(queryParams);
    } catch (error) {
      this.handleError(error, 'findPaginated', { page, limit, params });
    }
  }

  /**
   * Find item by ID
   */
  async findById(id) {
    try {
      return await this.apiService.get(`${this.endpoint}/${id}`);
    } catch (error) {
      this.handleError(error, 'findById', { id });
    }
  }

  /**
   * Create new item
   */
  async create(data) {
    try {
      return await this.apiService.post(this.endpoint, data);
    } catch (error) {
      this.handleError(error, 'create', { data });
    }
  }

  /**
   * Update item by ID
   */
  async update(id, data) {
    try {
      return await this.apiService.put(`${this.endpoint}/${id}`, data);
    } catch (error) {
      this.handleError(error, 'update', { id, data });
    }
  }

  /**
   * Partially update item by ID
   */
  async patch(id, data) {
    try {
      return await this.apiService.patch(`${this.endpoint}/${id}`, data);
    } catch (error) {
      this.handleError(error, 'patch', { id, data });
    }
  }

  /**
   * Delete item by ID
   */
  async delete(id) {
    try {
      return await this.apiService.delete(`${this.endpoint}/${id}`);
    } catch (error) {
      this.handleError(error, 'delete', { id });
    }
  }

  /**
   * Upload multiple items (for bulk operations)
   */
  async uploadBatch(items) {
    try {
      return await this.apiService.post(`${this.endpoint}/batch`, { items });
    } catch (error) {
      this.handleError(error, 'uploadBatch', { itemCount: items.length });
    }
  }

  /**
   * Search items with query
   */
  async search(query, params = {}) {
    try {
      const searchParams = {
        q: query,
        ...params,
      };
      return await this.findAll(searchParams);
    } catch (error) {
      this.handleError(error, 'search', { query, params });
    }
  }
}

export default BaseRepository;