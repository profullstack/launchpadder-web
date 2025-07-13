// src/lib/services/content-freshness-monitor.js
// Core service for monitoring and managing content freshness

/**
 * ContentFreshnessMonitor - Manages content freshness tracking and monitoring
 * 
 * This service provides comprehensive functionality for:
 * - Tracking content freshness status
 * - Calculating staleness scores
 * - Managing refresh queues
 * - Recording version history
 * - Scheduling refresh operations
 */
export class ContentFreshnessMonitor {
  /**
   * Priority multipliers for staleness score calculation
   */
  static PRIORITY_MULTIPLIERS = {
    low: 0.8,
    normal: 1.0,
    high: 1.2,
    critical: 1.5,
  };

  /**
   * Default configuration values
   */
  static DEFAULTS = {
    STALENESS_THRESHOLD: 50,
    QUEUE_LIMIT: 50,
    VERSION_HISTORY_LIMIT: 10,
    STALE_SUBMISSIONS_LIMIT: 100,
  };

  /**
   * Initialize ContentFreshnessMonitor
   * 
   * @param {Object} supabase - Supabase client instance
   * @param {Object} logger - Logger instance
   */
  constructor(supabase, logger) {
    if (!supabase) {
      throw new Error('Supabase client is required');
    }
    if (!logger) {
      throw new Error('Logger is required');
    }

    this.supabase = supabase;
    this.logger = logger;
  }

  /**
   * Check freshness status for a specific submission
   * 
   * @param {string} submissionId - The submission ID to check
   * @returns {Promise<Object|null>} Freshness data or null if not found
   * @throws {Error} If database query fails
   */
  async checkFreshness(submissionId) {
    this.logger.debug('Checking freshness for submission', { submissionId });

    try {
      const { data, error } = await this.supabase
        .from('content_freshness')
        .select('*')
        .eq('submission_id', submissionId)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data || null;
    } catch (error) {
      throw new Error(`Failed to check freshness: ${error.message}`);
    }
  }

  /**
   * Calculate staleness score based on time elapsed and priority
   * 
   * @param {Date} lastChecked - When content was last checked
   * @param {number} thresholdHours - Freshness threshold in hours
   * @param {string} priority - Priority level (low, normal, high, critical)
   * @returns {number} Staleness score (0-100)
   */
  calculateStalenessScore(lastChecked, thresholdHours, priority = 'normal') {
    const now = new Date();
    const hoursElapsed = (now.getTime() - new Date(lastChecked).getTime()) / (1000 * 60 * 60);
    
    // Handle edge case of zero threshold
    if (thresholdHours === 0) {
      return 100.0;
    }

    // Calculate base score as percentage of threshold
    const baseScore = Math.min(100.0, (hoursElapsed / thresholdHours) * 100.0);
    
    // Apply priority multiplier
    const multiplier = ContentFreshnessMonitor.PRIORITY_MULTIPLIERS[priority] || 1.0;
    const finalScore = Math.min(100.0, baseScore * multiplier);
    
    return Math.round(finalScore * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Update freshness status for a submission
   * 
   * @param {string} submissionId - The submission ID to update
   * @param {Object} updateData - Data to update
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If update fails
   */
  async updateFreshnessStatus(submissionId, updateData) {
    try {
      const { data, error } = await this.supabase
        .from('content_freshness')
        .update(updateData)
        .eq('submission_id', submissionId);

      if (error) {
        throw new Error(error.message);
      }

      this.logger.info('Updated freshness status', {
        submissionId,
        status: updateData.status,
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to update freshness status: ${error.message}`);
    }
  }

  /**
   * Get submissions that are considered stale
   * 
   * @param {number} threshold - Staleness score threshold (default: 50)
   * @param {number} limit - Maximum number of results (default: 100)
   * @returns {Promise<Array>} Array of stale submissions
   * @throws {Error} If query fails
   */
  async getStaleSubmissions(
    threshold = ContentFreshnessMonitor.DEFAULTS.STALENESS_THRESHOLD,
    limit = ContentFreshnessMonitor.DEFAULTS.STALE_SUBMISSIONS_LIMIT
  ) {
    try {
      const { data, error } = await this.supabase
        .from('content_freshness')
        .select('*')
        .gte('staleness_score', threshold)
        .order('staleness_score', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message);
      }

      return data || [];
    } catch (error) {
      throw new Error(`Failed to get stale submissions: ${error.message}`);
    }
  }

  /**
   * Schedule a refresh operation for a submission
   * 
   * @param {string} submissionId - The submission ID to refresh
   * @param {string} freshnessId - The freshness record ID
   * @param {string} priority - Priority level (default: 'normal')
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If scheduling fails
   */
  async scheduleRefresh(submissionId, freshnessId, priority = 'normal') {
    try {
      const scheduleData = {
        submission_id: submissionId,
        freshness_id: freshnessId,
        priority,
        scheduled_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from('refresh_queue')
        .insert(scheduleData);

      if (error) {
        throw new Error(error.message);
      }

      this.logger.info('Scheduled refresh', {
        submissionId,
        priority,
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to schedule refresh: ${error.message}`);
    }
  }

  /**
   * Get pending items from the refresh queue
   * 
   * @param {number} limit - Maximum number of items to retrieve (default: 50)
   * @returns {Promise<Array>} Array of queue items
   * @throws {Error} If query fails
   */
  async getRefreshQueue(limit = ContentFreshnessMonitor.DEFAULTS.QUEUE_LIMIT) {
    try {
      const { data, error } = await this.supabase
        .from('refresh_queue')
        .select('*')
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(error.message);
      }

      return data || [];
    } catch (error) {
      throw new Error(`Failed to get refresh queue: ${error.message}`);
    }
  }

  /**
   * Update the status of a refresh queue item
   * 
   * @param {string} queueId - The queue item ID
   * @param {string} status - New status
   * @param {string} workerId - Worker ID processing the item
   * @param {string} errorMessage - Error message if failed
   * @param {Object} errorDetails - Additional error details
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If update fails
   */
  async updateRefreshQueueStatus(queueId, status, workerId, errorMessage = null, errorDetails = null) {
    try {
      const updateData = {
        status,
        worker_id: workerId,
      };

      // Add timestamps based on status
      if (status === 'processing') {
        updateData.started_at = new Date().toISOString();
      } else if (status === 'completed' || status === 'failed') {
        updateData.completed_at = new Date().toISOString();
      }

      // Add error information if provided
      if (errorMessage) {
        updateData.error_message = errorMessage;
      }
      if (errorDetails) {
        updateData.error_details = errorDetails;
      }

      const { data, error } = await this.supabase
        .from('refresh_queue')
        .update(updateData)
        .eq('id', queueId);

      if (error) {
        throw new Error(error.message);
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to update refresh queue status: ${error.message}`);
    }
  }

  /**
   * Create a version snapshot for content changes
   * 
   * @param {Object} versionData - Version data to store
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If creation fails
   */
  async createVersionSnapshot(versionData) {
    try {
      const { data, error } = await this.supabase
        .from('content_versions')
        .insert(versionData);

      if (error) {
        throw new Error(error.message);
      }

      this.logger.info('Created version snapshot', {
        submissionId: versionData.submission_id,
        version: versionData.version_number,
        changeScore: versionData.change_score,
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to create version snapshot: ${error.message}`);
    }
  }

  /**
   * Get version history for a submission
   * 
   * @param {string} submissionId - The submission ID
   * @param {number} limit - Maximum number of versions to retrieve (default: 10)
   * @returns {Promise<Array>} Array of version records
   * @throws {Error} If query fails
   */
  async getVersionHistory(submissionId, limit = ContentFreshnessMonitor.DEFAULTS.VERSION_HISTORY_LIMIT) {
    try {
      const { data, error } = await this.supabase
        .from('content_versions')
        .select('*')
        .eq('submission_id', submissionId)
        .order('version_number', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(error.message);
      }

      return data || [];
    } catch (error) {
      throw new Error(`Failed to get version history: ${error.message}`);
    }
  }

  /**
   * Record refresh operation history
   * 
   * @param {Object} historyData - History data to record
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If recording fails
   */
  async recordRefreshHistory(historyData) {
    try {
      const { data, error } = await this.supabase
        .from('refresh_history')
        .insert(historyData);

      if (error) {
        throw new Error(error.message);
      }

      this.logger.debug('Recorded refresh history', {
        submissionId: historyData.submission_id,
        success: historyData.success,
        duration: historyData.processing_duration_ms,
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to record refresh history: ${error.message}`);
    }
  }

  /**
   * Get refresh statistics for analytics
   * 
   * @param {Date} startDate - Start date for statistics
   * @param {Date} endDate - End date for statistics
   * @returns {Promise<Object>} Statistics object
   * @throws {Error} If query fails
   */
  async getRefreshStatistics(startDate, endDate) {
    try {
      const { data, error } = await this.supabase
        .from('refresh_history')
        .select('success, processing_duration_ms, changes_found')
        .gte('started_at', startDate.toISOString())
        .lte('started_at', endDate.toISOString());

      if (error) {
        throw new Error(error.message);
      }

      const stats = {
        total_refreshes: data.length,
        successful_refreshes: data.filter(r => r.success).length,
        failed_refreshes: data.filter(r => !r.success).length,
        changes_detected: data.filter(r => r.changes_found).length,
        avg_duration_ms: data.length > 0 
          ? data.reduce((sum, r) => sum + (r.processing_duration_ms || 0), 0) / data.length
          : 0,
      };

      return stats;
    } catch (error) {
      throw new Error(`Failed to get refresh statistics: ${error.message}`);
    }
  }

  /**
   * Update staleness scores for all tracked content
   * 
   * @returns {Promise<number>} Number of records updated
   * @throws {Error} If update fails
   */
  async updateAllStalenessScores() {
    try {
      const { data, error } = await this.supabase
        .rpc('update_staleness_scores');

      if (error) {
        throw new Error(error.message);
      }

      this.logger.info('Updated staleness scores', { updatedCount: data });
      return data || 0;
    } catch (error) {
      throw new Error(`Failed to update staleness scores: ${error.message}`);
    }
  }

  /**
   * Get freshness overview statistics
   * 
   * @returns {Promise<Object>} Overview statistics
   * @throws {Error} If query fails
   */
  async getFreshnessOverview() {
    try {
      const { data, error } = await this.supabase
        .from('content_freshness')
        .select('status, staleness_score, priority');

      if (error) {
        throw new Error(error.message);
      }

      const overview = {
        total_tracked: data.length,
        by_status: {},
        by_priority: {},
        avg_staleness_score: 0,
        stale_count: 0,
      };

      // Calculate statistics
      let totalScore = 0;
      data.forEach(item => {
        // Count by status
        overview.by_status[item.status] = (overview.by_status[item.status] || 0) + 1;
        
        // Count by priority
        overview.by_priority[item.priority] = (overview.by_priority[item.priority] || 0) + 1;
        
        // Sum staleness scores
        totalScore += item.staleness_score || 0;
        
        // Count stale items (score >= 50)
        if (item.staleness_score >= 50) {
          overview.stale_count++;
        }
      });

      overview.avg_staleness_score = data.length > 0 
        ? Math.round((totalScore / data.length) * 100) / 100
        : 0;

      return overview;
    } catch (error) {
      throw new Error(`Failed to get freshness overview: ${error.message}`);
    }
  }
}