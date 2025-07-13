/**
 * Federation Discovery Service
 * 
 * Handles discovery and management of federated LaunchPadder instances
 * and their available directories for cross-platform submissions.
 */

/**
 * FederationDiscoveryService class for managing federation network
 */
export class FederationDiscoveryService {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error('Supabase client is required');
    }
    
    this.supabase = supabaseClient;
    
    // API endpoints for federation communication
    this.endpoints = {
      health: '/api/federation/health',
      info: '/api/federation/info',
      directories: '/api/federation/directories'
    };
    
    // Timeout for external API calls (10 seconds)
    this.requestTimeout = 10000;
  }

  /**
   * Discover available directories from all known federation instances
   * @param {Object} options - Discovery options
   * @param {string} options.category - Filter by directory category
   * @param {number} options.limit - Limit number of results
   * @param {boolean} options.activeOnly - Only include active instances
   * @returns {Promise<Array>} Array of discovered directories
   */
  async discoverDirectories(options = {}) {
    const { category, limit, activeOnly = true } = options;
    
    try {
      // Get known federation instances
      const instances = await this.getKnownInstances({ 
        status: activeOnly ? 'active' : undefined 
      });
      
      const allDirectories = [];
      
      // Query each instance for their directories
      for (const instance of instances) {
        try {
          const directories = await this._fetchInstanceDirectories(instance);
          
          // Add instance metadata to each directory
          const enrichedDirectories = directories.map(dir => ({
            ...dir,
            instance_id: instance.id,
            instance_name: instance.name,
            instance_url: instance.base_url,
            federation_source: true
          }));
          
          allDirectories.push(...enrichedDirectories);
        } catch (error) {
          console.warn(`Failed to fetch directories from ${instance.name}:`, error.message);
          // Continue with other instances even if one fails
        }
      }
      
      // Filter by category if specified
      let filteredDirectories = allDirectories;
      if (category) {
        filteredDirectories = allDirectories.filter(dir => dir.category === category);
      }
      
      // Sort by submission count (most active first)
      filteredDirectories.sort((a, b) => (b.submission_count || 0) - (a.submission_count || 0));
      
      // Apply limit if specified
      if (limit && limit > 0) {
        filteredDirectories = filteredDirectories.slice(0, limit);
      }
      
      return filteredDirectories;
    } catch (error) {
      console.error('Error discovering directories:', error);
      throw new Error(`Failed to discover directories: ${error.message}`);
    }
  }

  /**
   * Register a new federation instance
   * @param {Object} instanceData - Instance registration data
   * @param {string} instanceData.name - Instance name
   * @param {string} instanceData.base_url - Instance base URL
   * @param {string} instanceData.description - Instance description
   * @param {string} instanceData.admin_email - Admin email
   * @returns {Promise<Object>} Registration result
   */
  async registerInstance(instanceData) {
    const { name, base_url, description, admin_email } = instanceData;
    
    // Validate required fields
    if (!name) {
      throw new Error('Instance name is required');
    }
    
    if (!base_url) {
      throw new Error('Instance base_url is required');
    }
    
    if (!admin_email) {
      throw new Error('Admin email is required');
    }
    
    // Validate URL format
    if (!this._isValidUrl(base_url)) {
      throw new Error('Invalid URL format for base_url');
    }
    
    // Validate email format
    if (!this._isValidEmail(admin_email)) {
      throw new Error('Invalid email format for admin_email');
    }
    
    try {
      // Insert new instance with pending status
      const { data, error } = await this.supabase
        .from('federation_instances')
        .insert([{
          name,
          base_url: base_url.replace(/\/$/, ''), // Remove trailing slash
          description,
          admin_email,
          status: 'pending',
          created_at: new Date().toISOString(),
          last_seen: new Date().toISOString()
        }])
        .select();
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
      return {
        success: true,
        instance: data?.[0] || null
      };
    } catch (error) {
      console.error('Error registering instance:', error);
      throw error;
    }
  }

  /**
   * Verify instance health and API compatibility
   * @param {string} instanceUrl - Instance base URL
   * @returns {Promise<Object>} Verification result
   */
  async verifyInstance(instanceUrl) {
    const result = {
      healthy: false,
      compatible: false,
      federation_enabled: false,
      version: null,
      api_version: null,
      error: null
    };
    
    try {
      // Check health endpoint
      const healthResponse = await this._fetchWithTimeout(
        `${instanceUrl}${this.endpoints.health}`,
        { timeout: this.requestTimeout }
      );
      
      if (!healthResponse.ok) {
        throw new Error(`Health check failed: ${healthResponse.status}`);
      }
      
      const healthData = await healthResponse.json();
      result.healthy = healthData.status === 'healthy';
      result.version = healthData.version;
      result.api_version = healthData.api_version;
      
      // Check federation info endpoint
      const infoResponse = await this._fetchWithTimeout(
        `${instanceUrl}${this.endpoints.info}`,
        { timeout: this.requestTimeout }
      );
      
      if (infoResponse.ok) {
        const infoData = await infoResponse.json();
        result.federation_enabled = infoData.federation_enabled === true;
        result.compatible = result.federation_enabled && 
                           infoData.supported_features?.includes('submissions');
      }
      
    } catch (error) {
      result.error = error.message;
      console.warn(`Instance verification failed for ${instanceUrl}:`, error.message);
    }
    
    return result;
  }

  /**
   * Update instance status and last seen timestamp
   * @param {string} instanceId - Instance ID
   * @param {string} status - New status (active, inactive, error)
   * @returns {Promise<Object>} Update result
   */
  async updateInstanceStatus(instanceId, status) {
    try {
      const { data, error } = await this.supabase
        .from('federation_instances')
        .update({
          status,
          last_seen: new Date().toISOString()
        })
        .eq('id', instanceId)
        .select();
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
      return {
        success: true,
        instance: data?.[0] || null
      };
    } catch (error) {
      console.error('Error updating instance status:', error);
      throw error;
    }
  }

  /**
   * Get list of known federation instances
   * @param {Object} options - Query options
   * @param {string} options.status - Filter by status
   * @param {number} options.limit - Limit results
   * @returns {Promise<Array>} Array of federation instances
   */
  async getKnownInstances(options = {}) {
    const { status, limit } = options;
    
    try {
      let query = this.supabase
        .from('federation_instances')
        .select('*')
        .order('last_seen', { ascending: false });
      
      if (status) {
        query = query.eq('status', status);
      }
      
      if (limit) {
        query = query.limit(limit);
      }
      
      // Handle both real Supabase client and test mocks
      const result = await query;
      const { data, error } = result || {};
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
      return data || [];
    } catch (error) {
      console.error('Error fetching known instances:', error);
      throw error;
    }
  }

  /**
   * Ping all known instances to check their health
   * @returns {Promise<Array>} Array of ping results
   */
  async pingInstances() {
    try {
      const instances = await this.getKnownInstances();
      const results = [];
      
      // Ping instances in parallel with Promise.allSettled
      const pingPromises = instances.map(async (instance) => {
        const verification = await this.verifyInstance(instance.base_url);
        
        // Update instance status based on verification
        const newStatus = verification.healthy ? 'active' : 'inactive';
        await this.updateInstanceStatus(instance.id, newStatus);
        
        return {
          instance_id: instance.id,
          instance_name: instance.name,
          instance_url: instance.base_url,
          healthy: verification.healthy,
          compatible: verification.compatible,
          federation_enabled: verification.federation_enabled,
          error: verification.error
        };
      });
      
      const pingResults = await Promise.allSettled(pingPromises);
      
      // Extract results from settled promises
      for (const result of pingResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error('Ping failed:', result.reason);
          results.push({
            healthy: false,
            error: result.reason.message
          });
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error pinging instances:', error);
      throw error;
    }
  }

  /**
   * Fetch directories from a specific federation instance
   * @param {Object} instance - Federation instance
   * @returns {Promise<Array>} Array of directories
   * @private
   */
  async _fetchInstanceDirectories(instance) {
    const url = `${instance.base_url}${this.endpoints.directories}`;
    
    const response = await this._fetchWithTimeout(url, {
      timeout: this.requestTimeout,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'LaunchPadder-Federation/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.directories || [];
  }

  /**
   * Fetch with timeout support
   * @param {string} url - URL to fetch
   * @param {Object} options - Fetch options with timeout
   * @returns {Promise<Response>} Fetch response
   * @private
   */
  async _fetchWithTimeout(url, options = {}) {
    const { timeout = this.requestTimeout, ...fetchOptions } = options;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid URL
   * @private
   */
  _isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid email
   * @private
   */
  _isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

// Export singleton instance factory
export function createFederationDiscoveryService(supabaseClient) {
  return new FederationDiscoveryService(supabaseClient);
}

// Default export
export default FederationDiscoveryService;