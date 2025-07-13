/**
 * Rate Limiting Service
 * Comprehensive rate limiting with multiple tiers (IP, User, API Key, Global)
 */

import { supabase } from '$lib/config/supabase.js';

/**
 * Rate limiting service with multi-tier support
 */
class RateLimitingService {
  constructor() {
    this.defaultConfigs = {
      ip: 'ip_anonymous_basic',
      user: 'user_authenticated',
      api_key: 'api_key_basic',
      global: 'global_protection'
    };
  }

  /**
   * Check if a request is within rate limits
   * @param {string} identifier - IP address, user ID, API key, or 'global'
   * @param {string} type - Rate limit type: 'ip', 'user', 'api_key', 'global'
   * @param {string} [configName] - Optional specific config name
   * @returns {Promise<Object>} Rate limit result
   */
  async checkRateLimit(identifier, type, configName = null) {
    try {
      // Get rate limit configuration
      const config = await this.getRateLimitConfig(type, configName);
      if (!config) {
        throw new Error(`No rate limit configuration found for type: ${type}`);
      }

      // Get or create tracking record
      const tracking = await this.getOrCreateTracking(identifier, config.id);
      
      // Check if currently blocked
      if (tracking.is_blocked && tracking.blocked_until && new Date(tracking.blocked_until) > new Date()) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: new Date(tracking.blocked_until),
          retryAfter: Math.ceil((new Date(tracking.blocked_until) - new Date()) / 1000),
          type,
          identifier
        };
      }

      // Check if window has expired
      const windowStart = new Date(tracking.window_start);
      const windowEnd = new Date(windowStart.getTime() + (config.window_seconds * 1000));
      const now = new Date();

      if (now >= windowEnd) {
        // Reset window
        await this.resetWindow(tracking.id, config.id);
        return {
          allowed: true,
          remaining: config.max_requests - 1,
          resetTime: new Date(now.getTime() + (config.window_seconds * 1000)),
          type,
          identifier
        };
      }

      // Calculate total allowed requests (including burst)
      const totalAllowed = config.max_requests + (config.burst_allowance || 0);
      const currentCount = tracking.request_count;

      if (currentCount >= totalAllowed) {
        // Block the identifier
        const blockedUntil = new Date(windowEnd.getTime() + (config.window_seconds * 1000));
        await this.blockIdentifier(tracking.id, blockedUntil);
        
        return {
          allowed: false,
          remaining: 0,
          resetTime: windowEnd,
          retryAfter: Math.ceil((windowEnd - now) / 1000),
          type,
          identifier
        };
      }

      // Increment request count
      await this.incrementRequestCount(tracking.id);

      return {
        allowed: true,
        remaining: totalAllowed - currentCount - 1,
        resetTime: windowEnd,
        type,
        identifier
      };

    } catch (error) {
      console.error('Rate limit check error:', error);
      throw new Error(`Failed to check rate limit: ${error.message}`);
    }
  }

  /**
   * Get rate limit configuration by type
   * @param {string} type - Rate limit type
   * @param {string} [configName] - Optional specific config name
   * @returns {Promise<Object|null>} Configuration object
   */
  async getRateLimitConfig(type, configName = null) {
    try {
      const name = configName || this.defaultConfigs[type];
      if (!name) {
        return null;
      }

      const { data, error } = await supabase
        .from('rate_limit_configs')
        .select('*')
        .eq('name', name)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching rate limit config:', error);
      throw error;
    }
  }

  /**
   * Get or create tracking record for identifier
   * @param {string} identifier - Identifier to track
   * @param {string} configId - Configuration ID
   * @returns {Promise<Object>} Tracking record
   */
  async getOrCreateTracking(identifier, configId) {
    try {
      // Try to get existing tracking record
      const { data: existing, error: fetchError } = await supabase
        .from('rate_limit_tracking')
        .select('*')
        .eq('identifier', identifier)
        .eq('config_id', configId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (existing) {
        return existing;
      }

      // Create new tracking record
      const { data: newRecord, error: insertError } = await supabase
        .from('rate_limit_tracking')
        .insert({
          identifier,
          config_id: configId,
          request_count: 0,
          window_start: new Date().toISOString(),
          last_request_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      return newRecord;
    } catch (error) {
      console.error('Error getting/creating tracking record:', error);
      throw error;
    }
  }

  /**
   * Reset tracking window
   * @param {string} trackingId - Tracking record ID
   * @param {string} configId - Configuration ID
   * @returns {Promise<void>}
   */
  async resetWindow(trackingId, configId) {
    try {
      const { error } = await supabase
        .from('rate_limit_tracking')
        .update({
          request_count: 1,
          window_start: new Date().toISOString(),
          last_request_at: new Date().toISOString(),
          is_blocked: false,
          blocked_until: null
        })
        .eq('id', trackingId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error resetting window:', error);
      throw error;
    }
  }

  /**
   * Increment request count for tracking record
   * @param {string} trackingId - Tracking record ID
   * @returns {Promise<void>}
   */
  async incrementRequestCount(trackingId) {
    try {
      const { error } = await supabase
        .from('rate_limit_tracking')
        .update({
          request_count: supabase.raw('request_count + 1'),
          last_request_at: new Date().toISOString()
        })
        .eq('id', trackingId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error incrementing request count:', error);
      throw error;
    }
  }

  /**
   * Block an identifier
   * @param {string} trackingId - Tracking record ID
   * @param {Date} blockedUntil - When the block expires
   * @returns {Promise<void>}
   */
  async blockIdentifier(trackingId, blockedUntil) {
    try {
      const { error } = await supabase
        .from('rate_limit_tracking')
        .update({
          is_blocked: true,
          blocked_until: blockedUntil.toISOString()
        })
        .eq('id', trackingId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error blocking identifier:', error);
      throw error;
    }
  }

  /**
   * Update rate limit configuration
   * @param {string} configId - Configuration ID
   * @param {Object} updates - Configuration updates
   * @returns {Promise<Object>} Updated configuration
   */
  async updateRateLimitConfig(configId, updates) {
    try {
      // Validate updates
      this.validateConfigUpdates(updates);

      const { data, error } = await supabase
        .from('rate_limit_configs')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', configId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error updating rate limit config:', error);
      throw error;
    }
  }

  /**
   * Validate configuration updates
   * @param {Object} updates - Configuration updates to validate
   * @throws {Error} If validation fails
   */
  validateConfigUpdates(updates) {
    if (updates.max_requests !== undefined && updates.max_requests <= 0) {
      throw new Error('Invalid configuration: max_requests must be positive');
    }

    if (updates.window_seconds !== undefined && updates.window_seconds <= 0) {
      throw new Error('Invalid configuration: window_seconds must be positive');
    }

    if (updates.burst_allowance !== undefined && updates.burst_allowance < 0) {
      throw new Error('Invalid configuration: burst_allowance cannot be negative');
    }
  }

  /**
   * Clean up expired tracking records
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupExpiredTracking() {
    try {
      // Remove old tracking records (older than 1 hour)
      const cutoffTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('rate_limit_tracking')
        .delete()
        .lt('window_start', cutoffTime)
        .eq('is_blocked', false);

      if (error) {
        throw error;
      }

      // Unblock expired blocks
      const { data: unblocked, error: unblockError } = await supabase
        .from('rate_limit_tracking')
        .update({
          is_blocked: false,
          blocked_until: null
        })
        .lt('blocked_until', new Date().toISOString())
        .eq('is_blocked', true);

      if (unblockError) {
        throw unblockError;
      }

      return {
        deletedCount: data?.length || 0,
        unblockedCount: unblocked?.length || 0
      };
    } catch (error) {
      console.error('Error cleaning up expired tracking:', error);
      throw new Error(`Failed to cleanup expired tracking: ${error.message}`);
    }
  }

  /**
   * Get currently blocked identifiers
   * @returns {Promise<Array>} List of blocked identifiers
   */
  async getActiveBlocks() {
    try {
      const { data, error } = await supabase
        .from('rate_limit_tracking')
        .select(`
          identifier,
          blocked_until,
          rate_limit_configs!inner(name)
        `)
        .eq('is_blocked', true)
        .gt('blocked_until', new Date().toISOString());

      if (error) {
        throw error;
      }

      return data.map(block => ({
        identifier: block.identifier,
        blocked_until: new Date(block.blocked_until),
        config_name: block.rate_limit_configs.name
      }));
    } catch (error) {
      console.error('Error fetching active blocks:', error);
      throw error;
    }
  }

  /**
   * Manually unblock an identifier
   * @param {string} identifier - Identifier to unblock
   * @returns {Promise<Object>} Unblock result
   */
  async unblockIdentifier(identifier) {
    try {
      const { data, error } = await supabase
        .from('rate_limit_tracking')
        .update({
          is_blocked: false,
          blocked_until: null
        })
        .eq('identifier', identifier)
        .eq('is_blocked', true)
        .select()
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!data) {
        return {
          success: false,
          message: `Blocked identifier '${identifier}' not found`
        };
      }

      return {
        success: true,
        identifier,
        message: 'Identifier unblocked successfully'
      };
    } catch (error) {
      console.error('Error unblocking identifier:', error);
      throw error;
    }
  }

  /**
   * Get rate limiting statistics
   * @param {Object} [options] - Query options
   * @returns {Promise<Object>} Statistics
   */
  async getRateLimitStats(options = {}) {
    try {
      const timeframe = options.timeframe || '24 hours';
      const cutoffTime = new Date(Date.now() - this.parseTimeframe(timeframe)).toISOString();

      // Get total requests
      const { data: totalData, error: totalError } = await supabase
        .from('rate_limit_tracking')
        .select('request_count', { count: 'exact' })
        .gte('last_request_at', cutoffTime);

      if (totalError) throw totalError;

      // Get blocked requests
      const { data: blockedData, error: blockedError } = await supabase
        .from('rate_limit_tracking')
        .select('*', { count: 'exact' })
        .eq('is_blocked', true)
        .gte('last_request_at', cutoffTime);

      if (blockedError) throw blockedError;

      // Get active blocks
      const { data: activeData, error: activeError } = await supabase
        .from('rate_limit_tracking')
        .select('*', { count: 'exact' })
        .eq('is_blocked', true)
        .gt('blocked_until', new Date().toISOString());

      if (activeError) throw activeError;

      const totalRequests = totalData?.reduce((sum, record) => sum + record.request_count, 0) || 0;
      const blockedRequests = blockedData?.length || 0;
      const activeBlocks = activeData?.length || 0;

      return {
        totalRequests,
        blockedRequests,
        activeBlocks,
        blockRate: totalRequests > 0 ? Math.round((blockedRequests / totalRequests) * 100) : 0,
        timeframe
      };
    } catch (error) {
      console.error('Error fetching rate limit stats:', error);
      throw error;
    }
  }

  /**
   * Parse timeframe string to milliseconds
   * @param {string} timeframe - Timeframe string (e.g., '24 hours', '7 days')
   * @returns {number} Milliseconds
   */
  parseTimeframe(timeframe) {
    const units = {
      minute: 60 * 1000,
      minutes: 60 * 1000,
      hour: 60 * 60 * 1000,
      hours: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000
    };

    const match = timeframe.match(/^(\d+)\s+(minute|minutes|hour|hours|day|days)$/);
    if (!match) {
      return 24 * 60 * 60 * 1000; // Default to 24 hours
    }

    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }
}

// Export singleton instance
export const rateLimitingService = new RateLimitingService();