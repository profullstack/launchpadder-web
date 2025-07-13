/**
 * Content Freshness Monitor Service
 * Monitors and tracks the freshness of submitted content, schedules updates,
 * and manages content lifecycle based on configurable policies.
 */

export class ContentFreshnessMonitor {
  constructor(options = {}) {
    this.supabase = options.supabase;
    this.defaultPolicy = options.defaultPolicy || 'default';
    this.batchSize = options.batchSize || 50;
    this.maxConcurrency = options.maxConcurrency || 5;
    
    // Valid refresh types
    this.validRefreshTypes = ['metadata', 'ai_regeneration', 'validation', 'full'];
    
    if (!this.supabase) {
      throw new Error('Supabase client is required');
    }
  }

  /**
   * Check freshness for a single submission
   * @param {string} submissionId - The submission ID to check
   * @returns {Promise<Object>} Freshness check result
   */
  async checkSubmissionFreshness(submissionId) {
    try {
      // Get submission data
      const { data: submission, error: submissionError } = await this.supabase
        .from('submissions')
        .select(`
          id, url, last_metadata_check, last_metadata_update, 
          url_status_code, content_freshness_score, is_stale
        `)
        .eq('id', submissionId)
        .single();

      if (submissionError) {
        if (submissionError.code === 'PGRST116') {
          throw new Error('Submission not found');
        }
        throw new Error(`Failed to check submission freshness: ${submissionError.message}`);
      }

      // Get freshness policy
      const policy = await this.getFreshnessPolicy();
      
      // Calculate new freshness score
      const previousScore = submission.content_freshness_score || 0;
      const newScore = this.calculateFreshnessScore(submission, policy);
      const needsUpdate = this.shouldScheduleUpdate(submission, policy, newScore);

      // Update the submission with new score
      const { error: updateError } = await this.supabase
        .from('submissions')
        .update({
          content_freshness_score: newScore,
          is_stale: newScore < 50,
          last_metadata_check: new Date().toISOString()
        })
        .eq('id', submissionId);

      if (updateError) {
        console.warn(`Failed to update freshness score for ${submissionId}:`, updateError.message);
      }

      return {
        submissionId,
        url: submission.url,
        previousScore,
        newScore,
        needsUpdate,
        isStale: newScore < 50,
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to check submission freshness: ${error.message}`);
    }
  }

  /**
   * Calculate freshness score for a submission
   * @param {Object} submission - Submission data
   * @param {Object} policy - Freshness policy
   * @returns {number} Freshness score (0-100)
   */
  calculateFreshnessScore(submission, policy) {
    const now = new Date();
    const maxAgeMs = policy.max_age_hours * 60 * 60 * 1000;
    const staleThresholdMs = policy.stale_threshold_hours * 60 * 60 * 1000;
    
    let score = 100;

    // Check time since last metadata check
    if (submission.last_metadata_check) {
      const lastCheck = new Date(submission.last_metadata_check);
      const timeSinceCheck = now - lastCheck;
      
      if (timeSinceCheck > maxAgeMs) {
        const excessHours = (timeSinceCheck - maxAgeMs) / (60 * 60 * 1000);
        score -= Math.min(50, Math.floor(excessHours / 24) * 5);
      }
    } else {
      // Never checked - significant penalty
      score -= 40;
    }

    // Check time since last metadata update
    if (submission.last_metadata_update) {
      const lastUpdate = new Date(submission.last_metadata_update);
      const timeSinceUpdate = now - lastUpdate;
      
      if (timeSinceUpdate > maxAgeMs * 2) {
        const excessHours = (timeSinceUpdate - maxAgeMs * 2) / (60 * 60 * 1000);
        score -= Math.min(30, Math.floor(excessHours / 24) * 3);
      }
    } else {
      // Never updated - moderate penalty
      score -= 25;
    }

    // Check URL status
    if (submission.url_status_code) {
      if (submission.url_status_code >= 400) {
        score -= 40; // Significant penalty for failed URLs
      } else if (submission.url_status_code >= 300) {
        score -= 10; // Minor penalty for redirects
      }
    }

    // Ensure score is within bounds
    return Math.max(0, Math.min(100, Math.floor(score)));
  }

  /**
   * Determine if a submission should be scheduled for update
   * @param {Object} submission - Submission data
   * @param {Object} policy - Freshness policy
   * @param {number} freshnessScore - Current freshness score
   * @returns {boolean} Whether to schedule update
   */
  shouldScheduleUpdate(submission, policy, freshnessScore) {
    // Always update if score is very low
    if (freshnessScore < 30) {
      return true;
    }

    // Check if enough time has passed since last check
    if (submission.last_metadata_check) {
      const lastCheck = new Date(submission.last_metadata_check);
      const hoursSinceCheck = (new Date() - lastCheck) / (60 * 60 * 1000);
      
      if (hoursSinceCheck >= policy.check_frequency_hours) {
        return true;
      }
    } else {
      // Never checked
      return true;
    }

    // Check if URL status indicates problems
    if (submission.url_status_code && submission.url_status_code >= 400) {
      return true;
    }

    return false;
  }

  /**
   * Get submissions that need freshness checks
   * @param {number} limit - Maximum number of submissions to return
   * @returns {Promise<Array>} Array of stale submissions
   */
  async getStaleSubmissions(limit = this.batchSize) {
    try {
      const { data: submissions, error } = await this.supabase
        .from('submissions')
        .select(`
          id, url, last_metadata_check, last_metadata_update,
          content_freshness_score, url_status_code, is_stale
        `)
        .lt('content_freshness_score', 70)
        .is('archived_at', null)
        .order('content_freshness_score', { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to get stale submissions: ${error.message}`);
      }

      return submissions || [];
    } catch (error) {
      throw new Error(`Failed to get stale submissions: ${error.message}`);
    }
  }

  /**
   * Schedule a refresh job for a submission
   * @param {string} submissionId - Submission ID
   * @param {string} refreshType - Type of refresh ('metadata', 'ai_regeneration', 'validation', 'full')
   * @param {number} priority - Priority (1-10, lower is higher priority)
   * @param {Object} metadata - Additional metadata for the job
   * @returns {Promise<Object>} Scheduled job details
   */
  async scheduleRefresh(submissionId, refreshType = 'metadata', priority = 5, metadata = {}) {
    if (!this.validRefreshTypes.includes(refreshType)) {
      throw new Error(`Invalid refresh type: ${refreshType}. Valid types: ${this.validRefreshTypes.join(', ')}`);
    }

    try {
      const jobData = {
        submission_id: submissionId,
        refresh_type: refreshType,
        priority,
        scheduled_at: new Date().toISOString(),
        status: 'pending',
        metadata
      };

      const { error } = await this.supabase
        .from('content_refresh_queue')
        .insert(jobData);

      if (error) {
        throw new Error(`Failed to schedule refresh: ${error.message}`);
      }

      return {
        submissionId,
        refreshType,
        priority,
        scheduledAt: jobData.scheduled_at,
        metadata
      };
    } catch (error) {
      throw new Error(`Failed to schedule refresh: ${error.message}`);
    }
  }

  /**
   * Run freshness check for multiple submissions
   * @param {number} batchSize - Number of submissions to process
   * @returns {Promise<Object>} Processing results
   */
  async runFreshnessCheck(batchSize = this.batchSize) {
    const results = {
      checked: 0,
      scheduled: 0,
      errors: 0,
      startTime: new Date().toISOString()
    };

    try {
      // Get stale submissions
      const submissions = await this.getStaleSubmissions(batchSize);
      
      if (submissions.length === 0) {
        results.endTime = new Date().toISOString();
        return results;
      }

      // Process submissions in batches to control concurrency
      const batches = this.chunkArray(submissions, this.maxConcurrency);
      
      for (const batch of batches) {
        const promises = batch.map(async (submission) => {
          try {
            const checkResult = await this.checkSubmissionFreshness(submission.id);
            results.checked++;

            if (checkResult.needsUpdate) {
              await this.scheduleRefresh(
                submission.id,
                'metadata',
                this.calculatePriority(checkResult.newScore)
              );
              results.scheduled++;
            }
          } catch (error) {
            console.error(`Error checking submission ${submission.id}:`, error.message);
            results.errors++;
          }
        });

        await Promise.all(promises);
      }

      results.endTime = new Date().toISOString();
      return results;
    } catch (error) {
      results.error = error.message;
      results.endTime = new Date().toISOString();
      throw error;
    }
  }

  /**
   * Calculate priority based on freshness score
   * @param {number} score - Freshness score
   * @returns {number} Priority (1-10)
   */
  calculatePriority(score) {
    if (score < 20) return 1; // Highest priority
    if (score < 40) return 3;
    if (score < 60) return 5;
    if (score < 80) return 7;
    return 9; // Lowest priority
  }

  /**
   * Get freshness policy by name
   * @param {string} policyName - Policy name (defaults to instance default)
   * @returns {Promise<Object>} Freshness policy
   */
  async getFreshnessPolicy(policyName = this.defaultPolicy) {
    try {
      const { data: policy, error } = await this.supabase
        .from('content_freshness_policies')
        .select('*')
        .eq('name', policyName)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error(`Freshness policy not found: ${policyName}`);
        }
        throw new Error(`Failed to get freshness policy: ${error.message}`);
      }

      return policy;
    } catch (error) {
      throw new Error(`Failed to get freshness policy: ${error.message}`);
    }
  }

  /**
   * Update daily freshness metrics
   * @param {Date} date - Date to generate metrics for (defaults to today)
   * @returns {Promise<Object>} Update result
   */
  async updateFreshnessMetrics(date = new Date()) {
    try {
      const targetDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format

      const { error } = await this.supabase
        .rpc('generate_daily_freshness_metrics', { target_date: targetDate });

      if (error) {
        throw new Error(`Failed to update freshness metrics: ${error.message}`);
      }

      return {
        date: targetDate,
        success: true,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to update freshness metrics: ${error.message}`);
    }
  }

  /**
   * Archive stale submissions based on threshold
   * @param {number} staleThresholdHours - Hours after which to archive
   * @returns {Promise<Object>} Archive result
   */
  async archiveStaleSubmissions(staleThresholdHours = 720) {
    try {
      const { data: archivedCount, error } = await this.supabase
        .rpc('archive_stale_submissions', { stale_threshold_hours: staleThresholdHours });

      if (error) {
        throw new Error(`Failed to archive stale submissions: ${error.message}`);
      }

      return {
        archivedCount: archivedCount || 0,
        thresholdHours: staleThresholdHours,
        archivedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to archive stale submissions: ${error.message}`);
    }
  }

  /**
   * Get freshness statistics
   * @returns {Promise<Object>} Freshness statistics
   */
  async getFreshnessStatistics() {
    try {
      const { data: stats, error } = await this.supabase
        .from('submissions')
        .select('content_freshness_score, is_stale, archived_at')
        .is('archived_at', null);

      if (error) {
        throw new Error(`Failed to get freshness statistics: ${error.message}`);
      }

      const total = stats.length;
      const fresh = stats.filter(s => s.content_freshness_score >= 70).length;
      const stale = stats.filter(s => s.is_stale).length;
      const avgScore = total > 0 
        ? stats.reduce((sum, s) => sum + (s.content_freshness_score || 0), 0) / total 
        : 0;

      return {
        total,
        fresh,
        stale,
        averageScore: Math.round(avgScore * 100) / 100,
        freshPercentage: total > 0 ? Math.round((fresh / total) * 100) : 0,
        stalePercentage: total > 0 ? Math.round((stale / total) * 100) : 0
      };
    } catch (error) {
      throw new Error(`Failed to get freshness statistics: ${error.message}`);
    }
  }

  /**
   * Utility function to chunk array into smaller arrays
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array} Array of chunks
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Cleanup method
   */
  async cleanup() {
    // No cleanup needed for this service
  }
}

/**
 * Factory function to create ContentFreshnessMonitor instance
 * @param {Object} options - Configuration options
 * @returns {ContentFreshnessMonitor} Monitor instance
 */
export function createContentFreshnessMonitor(options = {}) {
  return new ContentFreshnessMonitor(options);
}

// Export default instance (only if supabase is available)
export const contentFreshnessMonitor = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
  ? null // Will be initialized by the application with proper supabase client
  : null;