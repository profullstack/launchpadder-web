// src/lib/services/regeneration-engine.js
// Service for automated content regeneration and change detection

import crypto from 'crypto';

/**
 * RegenerationEngine - Handles automated content updates and regeneration
 * 
 * This service provides functionality for:
 * - Automated content regeneration when source changes
 * - Smart detection of meaningful changes vs minor updates
 * - Batch processing for efficiency
 * - Rollback capabilities for failed updates
 * - Change scoring and significance analysis
 */
export class RegenerationEngine {
  /**
   * Field weights for change score calculation
   * Higher values indicate more important fields
   */
  static FIELD_WEIGHTS = {
    title: 0.4,
    description: 0.3,
    image: 0.2,
    author: 0.1,
    url: 0.3,
    tags: 0.15,
    content: 0.25,
    publishedDate: 0.05,
    lastModified: 0.01,
    views: 0.01,
    likes: 0.01,
  };

  /**
   * Fields that are considered insignificant for change detection
   */
  static INSIGNIFICANT_FIELDS = [
    'lastModified',
    'lastAccessed',
    'views',
    'likes',
    'shares',
    'timestamp',
    'fetchedAt',
  ];

  /**
   * Configuration constants
   */
  static DEFAULTS = {
    SIGNIFICANCE_THRESHOLD: 0.1,
    BATCH_SIZE: 10,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
  };

  /**
   * Initialize RegenerationEngine
   * 
   * @param {Object} supabase - Supabase client instance
   * @param {Object} logger - Logger instance
   * @param {Object} metadataFetcher - Metadata fetcher service
   * @param {Object} freshnessMonitor - Content freshness monitor service
   */
  constructor(supabase, logger, metadataFetcher, freshnessMonitor) {
    if (!supabase) {
      throw new Error('Supabase client is required');
    }
    if (!logger) {
      throw new Error('Logger is required');
    }
    if (!metadataFetcher) {
      throw new Error('Metadata fetcher is required');
    }
    if (!freshnessMonitor) {
      throw new Error('Freshness monitor is required');
    }

    this.supabase = supabase;
    this.logger = logger;
    this.metadataFetcher = metadataFetcher;
    this.freshnessMonitor = freshnessMonitor;
  }

  /**
   * Regenerate content for a specific submission
   * 
   * @param {string} submissionId - The submission ID to regenerate
   * @param {Object} options - Regeneration options
   * @returns {Promise<Object>} Regeneration result
   */
  async regenerateSubmission(submissionId, options = {}) {
    const startTime = Date.now();
    
    this.logger.info('Starting regeneration', { submissionId });

    try {
      // Fetch current submission data
      const { data: submissions, error: fetchError } = await this.supabase
        .from('submissions')
        .select('*')
        .eq('id', submissionId)
        .single();

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      if (!submissions) {
        throw new Error('Submission not found');
      }

      const submission = submissions;

      // Fetch fresh metadata and images
      const [newMetadata, newImages] = await Promise.all([
        this.metadataFetcher.fetchMetadata(submission.url),
        this.metadataFetcher.fetchImages(submission.url),
      ]);

      // Detect changes
      const metadataChanges = this.detectChanges(submission.original_meta, newMetadata);
      const imageChanges = this.detectChanges(submission.images, newImages);

      const hasSignificantChanges = 
        this.isSignificantChange(metadataChanges) || 
        this.isSignificantChange(imageChanges);

      const processingTime = Date.now() - startTime;

      // Prepare result object
      const result = {
        submissionId,
        success: true,
        changesDetected: metadataChanges.hasChanges || imageChanges.hasChanges,
        significantChanges: hasSignificantChanges,
        processingTime,
        metadataChanges: metadataChanges.changedFields,
        imageChanges: imageChanges.changedFields,
        changeScore: Math.max(metadataChanges.changeScore, imageChanges.changeScore),
      };

      // Update submission if changes detected
      if (result.changesDetected) {
        const updateData = {
          original_meta: newMetadata,
          images: newImages,
          updated_at: new Date().toISOString(),
        };

        // Only update rewritten_meta if significant changes detected
        if (hasSignificantChanges && options.updateRewrittenMeta !== false) {
          // Here you would typically call an AI rewriter service
          // For now, we'll just copy the original metadata
          updateData.rewritten_meta = newMetadata;
        }

        const { error: updateError } = await this.supabase
          .from('submissions')
          .update(updateData)
          .eq('id', submissionId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Create version snapshot
        if (this.freshnessMonitor.createVersionSnapshot) {
          const versionData = {
            submission_id: submissionId,
            freshness_id: submission.freshness_id || null,
            version_number: (submission.version_number || 1) + 1,
            content_hash: this.generateContentHash(newMetadata),
            metadata_hash: this.generateContentHash(newMetadata),
            images_hash: this.generateContentHash(newImages),
            changes_detected: {
              metadata: metadataChanges.changedFields,
              images: imageChanges.changedFields,
            },
            change_summary: this.generateChangeSummary(metadataChanges, imageChanges),
            change_score: result.changeScore,
            original_meta_snapshot: newMetadata,
            rewritten_meta_snapshot: updateData.rewritten_meta,
            images_snapshot: newImages,
            processing_duration_ms: processingTime,
            detection_method: 'content_hash',
          };

          await this.freshnessMonitor.createVersionSnapshot(versionData);
        }

        // Record refresh history
        if (this.freshnessMonitor.recordRefreshHistory) {
          const historyData = {
            submission_id: submissionId,
            freshness_id: submission.freshness_id || null,
            refresh_type: options.refreshType || 'manual',
            trigger_reason: options.triggerReason || 'regeneration_request',
            success: true,
            changes_found: result.changesDetected,
            content_updated: hasSignificantChanges,
            processing_duration_ms: processingTime,
            changes_detected: {
              metadata: metadataChanges.changedFields,
              images: imageChanges.changedFields,
            },
            old_content_hash: this.generateContentHash(submission.original_meta),
            new_content_hash: this.generateContentHash(newMetadata),
            started_at: new Date(startTime).toISOString(),
            completed_at: new Date().toISOString(),
          };

          await this.freshnessMonitor.recordRefreshHistory(historyData);
        }
      }

      this.logger.info('Regeneration completed', {
        submissionId,
        success: result.success,
        changesDetected: result.changesDetected,
        processingTime,
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Regeneration failed', {
        submissionId,
        error: error.message,
        processingTime,
      });

      return {
        submissionId,
        success: false,
        error: error.message,
        processingTime,
        changesDetected: false,
      };
    }
  }

  /**
   * Detect changes between old and new data
   * 
   * @param {Object} oldData - Previous data
   * @param {Object} newData - New data
   * @returns {Object} Change detection result
   */
  detectChanges(oldData, newData) {
    if (!oldData && !newData) {
      return { hasChanges: false, changedFields: [], changeScore: 0 };
    }

    if (!oldData || !newData) {
      return {
        hasChanges: true,
        changedFields: Object.keys(newData || oldData || {}),
        changeScore: 1.0,
      };
    }

    const changedFields = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    for (const key of allKeys) {
      if (!this.isEqual(oldData[key], newData[key])) {
        changedFields.push(key);
      }
    }

    const changeScore = this.calculateChangeScore(changedFields);

    return {
      hasChanges: changedFields.length > 0,
      changedFields,
      changeScore,
    };
  }

  /**
   * Calculate change score based on changed fields
   * 
   * @param {Array} changedFields - List of changed field names
   * @returns {number} Change score (0-1)
   */
  calculateChangeScore(changedFields) {
    if (!changedFields || changedFields.length === 0) {
      return 0;
    }

    let totalWeight = 0;
    for (const field of changedFields) {
      const weight = RegenerationEngine.FIELD_WEIGHTS[field] || 0.05;
      totalWeight += weight;
    }

    // Cap at 1.0
    return Math.min(1.0, totalWeight);
  }

  /**
   * Determine if changes are significant enough to warrant action
   * 
   * @param {Object} changes - Change detection result
   * @returns {boolean} Whether changes are significant
   */
  isSignificantChange(changes) {
    if (!changes.hasChanges) {
      return false;
    }

    // Check if any significant fields changed
    const significantFieldChanged = changes.changedFields.some(
      field => !RegenerationEngine.INSIGNIFICANT_FIELDS.includes(field)
    );

    if (!significantFieldChanged) {
      return false;
    }

    // Check change score threshold
    return changes.changeScore >= RegenerationEngine.DEFAULTS.SIGNIFICANCE_THRESHOLD;
  }

  /**
   * Process multiple submissions in batches
   * 
   * @param {Array} submissionIds - List of submission IDs to process
   * @param {number} batchSize - Number of submissions to process concurrently
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Object>} Batch processing result
   */
  async batchRegenerate(submissionIds, batchSize = RegenerationEngine.DEFAULTS.BATCH_SIZE, progressCallback = null) {
    const startTime = Date.now();
    const results = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      changesDetected: 0,
      significantChanges: 0,
      errors: [],
      processingTime: 0,
    };

    if (!submissionIds || submissionIds.length === 0) {
      return results;
    }

    this.logger.info('Starting batch regeneration', {
      totalSubmissions: submissionIds.length,
      batchSize,
    });

    // Process in batches
    for (let i = 0; i < submissionIds.length; i += batchSize) {
      const batch = submissionIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (submissionId) => {
        try {
          const result = await this.regenerateSubmission(submissionId, {
            refreshType: 'batch',
            triggerReason: 'batch_regeneration',
          });

          if (result.success) {
            results.successful++;
            if (result.changesDetected) {
              results.changesDetected++;
            }
            if (result.significantChanges) {
              results.significantChanges++;
            }
          } else {
            results.failed++;
            results.errors.push({
              submissionId,
              error: result.error,
            });
          }

          return result;
        } catch (error) {
          results.failed++;
          results.errors.push({
            submissionId,
            error: error.message,
          });
          
          this.logger.error('Batch regeneration item failed', {
            submissionId,
            error: error.message,
          });

          return { submissionId, success: false, error: error.message };
        }
      });

      await Promise.all(batchPromises);
      results.totalProcessed += batch.length;

      // Call progress callback if provided
      if (progressCallback) {
        progressCallback({
          processed: results.totalProcessed,
          total: submissionIds.length,
          successful: results.successful,
          failed: results.failed,
          changesDetected: results.changesDetected,
        });
      }
    }

    results.processingTime = Date.now() - startTime;

    this.logger.info('Batch regeneration completed', {
      totalProcessed: results.totalProcessed,
      successful: results.successful,
      failed: results.failed,
      processingTime: results.processingTime,
    });

    return results;
  }

  /**
   * Rollback a submission to a previous version
   * 
   * @param {string} submissionId - The submission ID
   * @param {number} targetVersion - Version number to rollback to
   * @returns {Promise<Object>} Rollback result
   */
  async rollbackSubmission(submissionId, targetVersion) {
    this.logger.info('Rolling back submission', { submissionId, targetVersion });

    try {
      // Prevent rollback to current version (version 1)
      if (targetVersion === 1) {
        throw new Error('Cannot rollback to current version');
      }

      // Fetch target version data
      const { data: versions, error: versionError } = await this.supabase
        .from('content_versions')
        .select('*')
        .eq('submission_id', submissionId)
        .eq('version_number', targetVersion)
        .single();

      if (versionError) {
        throw new Error(versionError.message);
      }

      if (!versions) {
        throw new Error('Version not found');
      }

      const version = versions;

      // Restore submission data from version snapshot
      const updateData = {
        original_meta: version.original_meta_snapshot,
        rewritten_meta: version.rewritten_meta_snapshot,
        images: version.images_snapshot,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await this.supabase
        .from('submissions')
        .update(updateData)
        .eq('id', submissionId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      this.logger.info('Rollback completed', {
        submissionId,
        targetVersion,
      });

      return {
        success: true,
        submissionId,
        rolledBackToVersion: targetVersion,
      };

    } catch (error) {
      this.logger.error('Rollback failed', {
        submissionId,
        targetVersion,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Get regeneration statistics for a time period
   * 
   * @param {Date} startDate - Start date for statistics
   * @param {Date} endDate - End date for statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getRegenerationStats(startDate, endDate) {
    try {
      const { data, error } = await this.supabase
        .from('refresh_history')
        .select('success, processing_duration_ms, changes_found, refresh_type')
        .gte('started_at', startDate.toISOString())
        .lte('started_at', endDate.toISOString())
        .eq('refresh_type', 'manual'); // Only manual regenerations

      if (error) {
        throw new Error(error.message);
      }

      const stats = {
        totalRegenerations: data.length,
        successfulRegenerations: data.filter(r => r.success).length,
        failedRegenerations: data.filter(r => !r.success).length,
        changesDetected: data.filter(r => r.changes_found).length,
        averageProcessingTime: data.length > 0 
          ? Math.round(data.reduce((sum, r) => sum + (r.processing_duration_ms || 0), 0) / data.length)
          : 0,
        successRate: data.length > 0 
          ? Math.round((data.filter(r => r.success).length / data.length) * 100)
          : 0,
        changeDetectionRate: data.length > 0 
          ? Math.round((data.filter(r => r.changes_found).length / data.length) * 100)
          : 0,
      };

      return stats;
    } catch (error) {
      throw new Error(`Failed to get regeneration statistics: ${error.message}`);
    }
  }

  /**
   * Generate a content hash for change detection
   * 
   * @param {Object} content - Content to hash
   * @returns {string} Content hash
   */
  generateContentHash(content) {
    const contentString = JSON.stringify(content, Object.keys(content).sort());
    return crypto.createHash('sha256').update(contentString).digest('hex');
  }

  /**
   * Generate a human-readable summary of changes
   * 
   * @param {Object} metadataChanges - Metadata changes
   * @param {Object} imageChanges - Image changes
   * @returns {string} Change summary
   */
  generateChangeSummary(metadataChanges, imageChanges) {
    const changes = [];

    if (metadataChanges.hasChanges) {
      changes.push(`Metadata: ${metadataChanges.changedFields.join(', ')}`);
    }

    if (imageChanges.hasChanges) {
      changes.push(`Images: ${imageChanges.changedFields.join(', ')}`);
    }

    return changes.length > 0 ? changes.join('; ') : 'No changes detected';
  }

  /**
   * Deep equality check for objects and arrays
   * 
   * @param {*} a - First value
   * @param {*} b - Second value
   * @returns {boolean} Whether values are equal
   */
  isEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.isEqual(item, b[index]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => this.isEqual(a[key], b[key]));
    }

    return false;
  }
}