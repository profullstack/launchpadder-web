/**
 * API Client with automatic authentication token injection
 * Handles all API requests with proper authentication headers
 */

import { getAccessToken } from '$lib/stores/auth.js';
import { browser } from '$app/environment';

/**
 * Base API configuration
 */
const API_BASE_URL = browser ? window.location.origin : 'http://localhost:3000';

/**
 * Default headers for API requests
 */
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

/**
 * Create authenticated headers
 */
function createAuthHeaders(additionalHeaders = {}) {
  const headers = { ...DEFAULT_HEADERS, ...additionalHeaders };
  
  // Add authorization header if we have a token
  const accessToken = getAccessToken();
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  return headers;
}

/**
 * Handle API response
 */
async function handleResponse(response) {
  const contentType = response.headers.get('content-type');
  
  // Parse JSON response
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }
  
  // Handle error responses
  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `HTTP ${response.status}: ${response.statusText}`);
    error.status = response.status;
    error.response = response;
    error.data = data;
    throw error;
  }
  
  return data;
}

/**
 * Make an authenticated API request
 */
async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  
  const config = {
    ...options,
    headers: createAuthHeaders(options.headers)
  };
  
  try {
    const response = await fetch(url, config);
    return await handleResponse(response);
  } catch (error) {
    console.error(`API request failed: ${config.method || 'GET'} ${url}`, error);
    throw error;
  }
}

/**
 * GET request
 */
export async function apiGet(endpoint, options = {}) {
  return apiRequest(endpoint, {
    ...options,
    method: 'GET'
  });
}

/**
 * POST request
 */
export async function apiPost(endpoint, data = null, options = {}) {
  return apiRequest(endpoint, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined
  });
}

/**
 * PUT request
 */
export async function apiPut(endpoint, data = null, options = {}) {
  return apiRequest(endpoint, {
    ...options,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined
  });
}

/**
 * PATCH request
 */
export async function apiPatch(endpoint, data = null, options = {}) {
  return apiRequest(endpoint, {
    ...options,
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined
  });
}

/**
 * DELETE request
 */
export async function apiDelete(endpoint, options = {}) {
  return apiRequest(endpoint, {
    ...options,
    method: 'DELETE'
  });
}

/**
 * Upload file with authentication
 */
export async function apiUpload(endpoint, formData, options = {}) {
  const headers = createAuthHeaders(options.headers);
  
  // Remove Content-Type header to let browser set it with boundary for FormData
  delete headers['Content-Type'];
  
  return apiRequest(endpoint, {
    ...options,
    method: 'POST',
    headers,
    body: formData
  });
}

/**
 * Authentication-specific API calls
 */
export const authApi = {
  /**
   * Login user
   */
  async login(email, password) {
    return apiPost('/api/auth/login', { email, password });
  },
  
  /**
   * Register user
   */
  async register(userData) {
    return apiPost('/api/auth/signup', userData);
  },
  
  /**
   * Logout user
   */
  async logout() {
    return apiPost('/api/auth/logout');
  },
  
  /**
   * Get current user profile
   */
  async getProfile() {
    return apiGet('/api/auth/profile');
  },
  
  /**
   * Update user profile
   */
  async updateProfile(profileData) {
    return apiPut('/api/auth/profile', profileData);
  },
  
  /**
   * Change password
   */
  async changePassword(currentPassword, newPassword) {
    return apiPost('/api/auth/change-password', {
      currentPassword,
      newPassword
    });
  },
  
  /**
   * Request password reset
   */
  async requestPasswordReset(email) {
    return apiPost('/api/auth/reset-password', { email });
  }
};

/**
 * User-specific API calls
 */
export const userApi = {
  /**
   * Get user by ID
   */
  async getUser(userId) {
    return apiGet(`/api/users/${userId}`);
  },
  
  /**
   * Update user profile
   */
  async updateUser(userId, userData) {
    return apiPut(`/api/users/${userId}`, userData);
  },
  
  /**
   * Get user badges
   */
  async getUserBadges(userId) {
    return apiGet(`/api/users/${userId}/badges`);
  }
};

/**
 * Dashboard API calls
 */
export const dashboardApi = {
  /**
   * Get dashboard overview
   */
  async getOverview() {
    return apiGet('/api/dashboard/overview');
  },
  
  /**
   * Get analytics data
   */
  async getAnalytics(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return apiGet(`/api/dashboard/analytics${queryString ? `?${queryString}` : ''}`);
  },
  
  /**
   * Get audit logs
   */
  async getAuditLogs(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return apiGet(`/api/dashboard/audit-logs${queryString ? `?${queryString}` : ''}`);
  }
};

/**
 * Generic API client for custom endpoints
 */
export const api = {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  patch: apiPatch,
  delete: apiDelete,
  upload: apiUpload,
  request: apiRequest
};

export default api;