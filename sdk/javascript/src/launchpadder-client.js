/**
 * LaunchPadder Federation SDK
 * 
 * JavaScript client library for easy integration with the LaunchPadder Federation API.
 * Supports both Node.js and browser environments.
 */

class LaunchPadderClient {
  /**
   * Create a new LaunchPadder client instance
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - Federation API key
   * @param {string} [options.baseUrl='https://api.launchpadder.com'] - Base API URL
   * @param {string} [options.version='v1'] - API version
   * @param {number} [options.timeout=30000] - Request timeout in milliseconds
   * @param {boolean} [options.debug=false] - Enable debug logging
   */
  constructor(options = {}) {
    if (!options.apiKey) {
      throw new Error('API key is required');
    }

    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.launchpadder.com';
    this.version = options.version || 'v1';
    this.timeout = options.timeout || 30000;
    this.debug = options.debug || false;
    
    this.token = null;
    this.tokenExpiry = null;
    
    // Initialize API endpoints
    this.auth = new AuthAPI(this);
    this.federation = new FederationAPI(this);
    this.submissions = new SubmissionsAPI(this);
    this.analytics = new AnalyticsAPI(this);
    this.webhooks = new WebhooksAPI(this);
    this.partners = new PartnersAPI(this);
  }

  /**
   * Get the full API URL for an endpoint
   * @param {string} endpoint - API endpoint path
   * @returns {string} Full URL
   */
  getUrl(endpoint) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    return `${this.baseUrl}/api/${this.version}/${cleanEndpoint}`;
  }

  /**
   * Log debug messages if debug mode is enabled
   * @param {string} message - Debug message
   * @param {*} data - Additional data to log
   */
  log(message, data = null) {
    if (this.debug) {
      console.log(`[LaunchPadder SDK] ${message}`, data || '');
    }
  }

  /**
   * Make an authenticated HTTP request
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} [data] - Request data
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Response data
   */
  async request(method, endpoint, data = null, options = {}) {
    const url = this.getUrl(endpoint);
    
    // Ensure we have a valid token
    await this.ensureAuthenticated();
    
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'LaunchPadder-SDK/1.0.0',
      ...options.headers
    };

    // Add authentication header
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    } else {
      headers['X-API-Key'] = this.apiKey;
    }

    const requestOptions = {
      method: method.toUpperCase(),
      headers,
      ...options
    };

    if (data && ['POST', 'PUT', 'PATCH'].includes(requestOptions.method)) {
      requestOptions.body = JSON.stringify(data);
    }

    this.log(`${method.toUpperCase()} ${url}`, data);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      requestOptions.signal = controller.signal;

      const response = await fetch(url, requestOptions);
      clearTimeout(timeoutId);

      const responseData = await response.json();

      if (!response.ok) {
        throw new LaunchPadderError(
          responseData.error || 'Request failed',
          response.status,
          responseData.code,
          responseData
        );
      }

      this.log(`Response ${response.status}`, responseData);
      return responseData;

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new LaunchPadderError('Request timeout', 408, 'TIMEOUT');
      }
      
      if (error instanceof LaunchPadderError) {
        throw error;
      }
      
      throw new LaunchPadderError(
        error.message || 'Network error',
        0,
        'NETWORK_ERROR'
      );
    }
  }

  /**
   * Ensure we have a valid authentication token
   */
  async ensureAuthenticated() {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return; // Token is still valid
    }

    try {
      const response = await this.auth.getToken();
      this.token = response.token;
      this.tokenExpiry = Date.now() + (response.expires_in * 1000) - 60000; // Refresh 1 minute early
      this.log('Authentication token refreshed');
    } catch (error) {
      this.log('Authentication failed', error.message);
      throw error;
    }
  }

  /**
   * GET request
   */
  async get(endpoint, options = {}) {
    return this.request('GET', endpoint, null, options);
  }

  /**
   * POST request
   */
  async post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, data, options);
  }

  /**
   * PUT request
   */
  async put(endpoint, data, options = {}) {
    return this.request('PUT', endpoint, data, options);
  }

  /**
   * DELETE request
   */
  async delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, null, options);
  }
}

/**
 * Authentication API methods
 */
class AuthAPI {
  constructor(client) {
    this.client = client;
  }

  /**
   * Exchange API key for JWT token
   * @returns {Promise<Object>} Token response
   */
  async getToken() {
    const url = this.client.getUrl('auth/token');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LaunchPadder-SDK/1.0.0'
      },
      body: JSON.stringify({
        api_key: this.client.apiKey
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new LaunchPadderError(
        data.error || 'Authentication failed',
        response.status,
        data.code,
        data
      );
    }

    return data;
  }
}

/**
 * Federation API methods
 */
class FederationAPI {
  constructor(client) {
    this.client = client;
  }

  /**
   * Get federation instance information
   * @returns {Promise<Object>} Federation info
   */
  async getInfo() {
    return this.client.get('federation/info');
  }

  /**
   * List available directories
   * @param {Object} [params] - Query parameters
   * @returns {Promise<Object>} Directories list
   */
  async getDirectories(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `federation/directories?${queryString}` : 'federation/directories';
    return this.client.get(endpoint);
  }

  /**
   * List federation instances
   * @param {Object} [params] - Query parameters
   * @returns {Promise<Object>} Instances list
   */
  async getInstances(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `federation/instances?${queryString}` : 'federation/instances';
    return this.client.get(endpoint);
  }

  /**
   * Register a new federation instance
   * @param {Object} instanceData - Instance data
   * @returns {Promise<Object>} Created instance
   */
  async createInstance(instanceData) {
    return this.client.post('federation/instances', instanceData);
  }
}

/**
 * Submissions API methods
 */
class SubmissionsAPI {
  constructor(client) {
    this.client = client;
  }

  /**
   * Create a new submission
   * @param {Object} submissionData - Submission data
   * @returns {Promise<Object>} Created submission
   */
  async create(submissionData) {
    return this.client.post('submissions', submissionData);
  }

  /**
   * List submissions
   * @param {Object} [params] - Query parameters
   * @returns {Promise<Object>} Submissions list
   */
  async list(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `submissions?${queryString}` : 'submissions';
    return this.client.get(endpoint);
  }

  /**
   * Get submission by ID
   * @param {string} id - Submission ID
   * @returns {Promise<Object>} Submission details
   */
  async get(id) {
    return this.client.get(`submissions/${id}`);
  }

  /**
   * Update submission
   * @param {string} id - Submission ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated submission
   */
  async update(id, updateData) {
    return this.client.put(`submissions/${id}`, updateData);
  }

  /**
   * Submit to federation
   * @param {Object} federationData - Federation submission data
   * @returns {Promise<Object>} Federation submission
   */
  async submitToFederation(federationData) {
    return this.client.post('federation/submit', federationData);
  }

  /**
   * Get federation submission status
   * @param {string} id - Federation submission ID
   * @returns {Promise<Object>} Status information
   */
  async getFederationStatus(id) {
    return this.client.get(`federation/submissions/${id}/status`);
  }
}

/**
 * Analytics API methods
 */
class AnalyticsAPI {
  constructor(client) {
    this.client = client;
  }

  /**
   * Get analytics overview
   * @param {Object} [params] - Query parameters
   * @returns {Promise<Object>} Analytics overview
   */
  async getOverview(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `analytics/overview?${queryString}` : 'analytics/overview';
    return this.client.get(endpoint);
  }

  /**
   * Get federation analytics
   * @param {Object} [params] - Query parameters
   * @returns {Promise<Object>} Federation analytics
   */
  async getFederation(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `analytics/federation?${queryString}` : 'analytics/federation';
    return this.client.get(endpoint);
  }
}

/**
 * Webhooks API methods
 */
class WebhooksAPI {
  constructor(client) {
    this.client = client;
  }

  /**
   * List webhooks
   * @returns {Promise<Object>} Webhooks list
   */
  async list() {
    return this.client.get('webhooks');
  }

  /**
   * Create webhook
   * @param {Object} webhookData - Webhook data
   * @returns {Promise<Object>} Created webhook
   */
  async create(webhookData) {
    return this.client.post('webhooks', webhookData);
  }

  /**
   * Delete webhook
   * @param {string} id - Webhook ID
   * @returns {Promise<Object>} Deletion confirmation
   */
  async delete(id) {
    return this.client.delete(`webhooks/${id}`);
  }
}

/**
 * Partners API methods
 */
class PartnersAPI {
  constructor(client) {
    this.client = client;
  }

  /**
   * List partners
   * @returns {Promise<Object>} Partners list
   */
  async list() {
    return this.client.get('partners');
  }

  /**
   * Get partner by ID
   * @param {string} id - Partner ID
   * @returns {Promise<Object>} Partner details
   */
  async get(id) {
    return this.client.get(`partners/${id}`);
  }

  /**
   * Create partner
   * @param {Object} partnerData - Partner data
   * @returns {Promise<Object>} Created partner
   */
  async create(partnerData) {
    return this.client.post('partners', partnerData);
  }

  /**
   * Update partner
   * @param {string} id - Partner ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated partner
   */
  async update(id, updateData) {
    return this.client.put(`partners/${id}`, updateData);
  }
}

/**
 * Custom error class for LaunchPadder API errors
 */
class LaunchPadderError extends Error {
  constructor(message, status = 0, code = 'UNKNOWN_ERROR', response = null) {
    super(message);
    this.name = 'LaunchPadderError';
    this.status = status;
    this.code = code;
    this.response = response;
  }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  // Node.js
  module.exports = { LaunchPadderClient, LaunchPadderError };
} else if (typeof window !== 'undefined') {
  // Browser
  window.LaunchPadderClient = LaunchPadderClient;
  window.LaunchPadderError = LaunchPadderError;
}

export { LaunchPadderClient, LaunchPadderError };