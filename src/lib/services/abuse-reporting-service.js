/**
 * Abuse Reporting Service
 * User reporting mechanisms and automated flagging system
 */

import { supabase } from '$lib/config/supabase.js';

/**
 * Abuse reporting service for handling user reports and automated flagging
 */
class AbuseReportingService {
  constructor() {
    this.validStatuses = ['pending', 'investigating', 'resolved', 'dismissed'];
    this.validReportTypes = ['spam', 'inappropriate', 'copyright', 'harassment', 'other'];
    this.validPriorities = [1, 2, 3, 4]; // 1=low, 2=medium, 3=high, 4=critical

    // Priority mapping for different report types
    this.typePriorityMap = {
      'copyright': 4,     // Critical - legal implications
      'harassment': 3,    // High - user safety
      'spam': 2,          // Medium - content quality
      'inappropriate': 2, // Medium - content quality
      'other': 1          // Low - needs review
    };
  }

  /**
   * Submit an abuse report
   * @param {Object} reportData - Report data
   * @returns {Promise<Object>} Submission result
   */
  async submitReport(reportData) {
    try {
      // Validate required fields
      this.validateReportData(reportData);

      const { submission_id, reported_by, report_type, description } = reportData;

      // Check for duplicate reports from the same user
      const existingReport = await this.checkDuplicateReport(submission_id, reported_by);
      if (existingReport) {
        return {
          success: false,
          error: 'You have already reported this submission',
          existingReportId: existingReport.id
        };
      }

      // Calculate priority based on report type
      const priority = this.calculatePriority(report_type, reportData.priority);

      // Insert the report
      const { data, error } = await supabase
        .from('abuse_reports')
        .insert({
          submission_id,
          reported_by,
          report_type,
          description: description.trim(),
          status: 'pending',
          priority,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        success: true,
        reportId: data.id,
        status: data.status,
        priority: data.priority,
        reportType: data.report_type,
        createdAt: new Date(data.created_at)
      };

    } catch (error) {
      console.error('Abuse report submission error:', error);
      throw new Error(`Failed to submit abuse report: ${error.message}`);
    }
  }

  /**
   * Get abuse reports with filtering and pagination
   * @param {Object} [options] - Query options
   * @returns {Promise<Object>} Reports and pagination info
   */
  async getReports(options = {}) {
    try {
      const {
        status,
        reportType,
        assignedTo,
        minPriority,
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = options;

      let query = supabase
        .from('abuse_reports')
        .select(`
          *,
          submissions!inner(id, url, original_meta, rewritten_meta),
          reporter:profiles!reported_by(id, username, full_name),
          assignee:profiles!assigned_to(id, username, full_name)
        `);

      // Apply filters
      if (status) {
        query = query.eq('status', status);
      }

      if (reportType) {
        query = query.eq('report_type', reportType);
      }

      if (assignedTo) {
        query = query.eq('assigned_to', assignedTo);
      }

      if (minPriority) {
        query = query.gte('priority', minPriority);
      }

      // Apply sorting
      const validSortFields = ['created_at', 'priority', 'status', 'report_type'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
      const order = ['asc', 'desc'].includes(sortOrder) ? sortOrder : 'desc';

      query = query.order(sortField, { ascending: order === 'asc' });

      // Apply pagination
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      return {
        reports: data || [],
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };

    } catch (error) {
      console.error('Get reports error:', error);
      throw error;
    }
  }

  /**
   * Update report status and details
   * @param {string} reportId - Report ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Updated report
   */
  async updateReportStatus(reportId, updates) {
    try {
      // Validate updates
      this.validateReportUpdates(updates);

      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      // Set resolved_at timestamp if status is being set to resolved
      if (updates.status === 'resolved' || updates.status === 'dismissed') {
        updateData.resolved_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('abuse_reports')
        .update(updateData)
        .eq('id', reportId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;

    } catch (error) {
      console.error('Report status update error:', error);
      throw error;
    }
  }

  /**
   * Assign report to a moderator
   * @param {string} reportId - Report ID
   * @param {string} moderatorId - Moderator user ID
   * @returns {Promise<Object>} Assignment result
   */
  async assignReport(reportId, moderatorId) {
    try {
      const { data, error } = await supabase
        .from('abuse_reports')
        .update({
          assigned_to: moderatorId,
          status: 'investigating',
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        success: true,
        reportId,
        assignedTo: data.assigned_to,
        status: data.status
      };

    } catch (error) {
      console.error('Report assignment error:', error);
      throw new Error(`Failed to assign report: ${error.message}`);
    }
  }

  /**
   * Get comprehensive report statistics
   * @param {Object} [options] - Query options
   * @returns {Promise<Object>} Statistics
   */
  async getReportStatistics(options = {}) {
    try {
      const timeframe = options.timeframe || '30 days';
      const cutoffTime = new Date(Date.now() - this.parseTimeframe(timeframe)).toISOString();

      // Get total reports
      const { data: totalData, error: totalError } = await supabase
        .from('abuse_reports')
        .select('*', { count: 'exact' })
        .gte('created_at', cutoffTime);

      if (totalError) throw totalError;

      // Get reports by status
      const { data: pendingData, error: pendingError } = await supabase
        .from('abuse_reports')
        .select('*', { count: 'exact' })
        .eq('status', 'pending')
        .gte('created_at', cutoffTime);

      if (pendingError) throw pendingError;

      const { data: investigatingData, error: investigatingError } = await supabase
        .from('abuse_reports')
        .select('*', { count: 'exact' })
        .eq('status', 'investigating')
        .gte('created_at', cutoffTime);

      if (investigatingError) throw investigatingError;

      const { data: resolvedData, error: resolvedError } = await supabase
        .from('abuse_reports')
        .select('*', { count: 'exact' })
        .eq('status', 'resolved')
        .gte('created_at', cutoffTime);

      if (resolvedError) throw resolvedError;

      const { data: dismissedData, error: dismissedError } = await supabase
        .from('abuse_reports')
        .select('*', { count: 'exact' })
        .eq('status', 'dismissed')
        .gte('created_at', cutoffTime);

      if (dismissedError) throw dismissedError;

      // Get report type distribution
      const { data: typeDistribution, error: typeError } = await supabase
        .from('abuse_reports')
        .select('report_type')
        .gte('created_at', cutoffTime)
        .then(result => {
          if (result.error) throw result.error;
          
          const distribution = result.data.reduce((acc, report) => {
            acc[report.report_type] = (acc[report.report_type] || 0) + 1;
            return acc;
          }, {});

          return {
            data: Object.entries(distribution).map(([report_type, count]) => ({ report_type, count })),
            error: null
          };
        });

      if (typeError) throw typeError;

      const totalReports = totalData?.length || 0;
      const pendingReports = pendingData?.length || 0;
      const investigatingReports = investigatingData?.length || 0;
      const resolvedReports = resolvedData?.length || 0;
      const dismissedReports = dismissedData?.length || 0;

      const resolvedCount = resolvedReports + dismissedReports;
      const resolutionRate = totalReports > 0 ? Math.round((resolvedCount / totalReports) * 100) : 0;

      return {
        totalReports,
        pendingReports,
        investigatingReports,
        resolvedReports,
        dismissedReports,
        resolutionRate,
        reportTypeDistribution: typeDistribution,
        timeframe
      };

    } catch (error) {
      console.error('Report statistics error:', error);
      throw error;
    }
  }

  /**
   * Automatically flag submission based on criteria
   * @param {string} submissionId - Submission ID to flag
   * @param {Object} flaggingCriteria - Criteria that triggered the flag
   * @returns {Promise<Object>} Auto-flagging result
   */
  async autoFlagSubmission(submissionId, flaggingCriteria) {
    try {
      const { reason, confidence, rule_triggered } = flaggingCriteria;

      // Check if submission is already auto-flagged
      const existingAutoFlag = await this.checkExistingAutoFlag(submissionId);
      if (existingAutoFlag) {
        return {
          success: false,
          error: 'Submission has already been auto-flagged',
          existingReportId: existingAutoFlag.id
        };
      }

      // Determine report type and priority based on criteria
      const reportType = this.determineAutoFlagType(flaggingCriteria);
      const priority = this.calculateAutoFlagPriority(confidence);

      // Create auto-generated report
      const { data, error } = await supabase
        .from('abuse_reports')
        .insert({
          submission_id: submissionId,
          reported_by: null, // System-generated report
          report_type: reportType,
          description: `Automatically flagged: ${reason}`,
          status: 'pending',
          priority,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        success: true,
        reportId: data.id,
        reportType: data.report_type,
        priority: data.priority,
        autoFlagged: true,
        confidence,
        ruleTriggered: rule_triggered
      };

    } catch (error) {
      console.error('Auto-flagging error:', error);
      throw error;
    }
  }

  /**
   * Bulk update multiple reports
   * @param {Array} updates - Array of report updates
   * @returns {Promise<Object>} Bulk update result
   */
  async bulkUpdateReports(updates) {
    try {
      // Validate all updates first
      for (const update of updates) {
        this.validateReportUpdates(update);
      }

      const { data, error } = await supabase
        .from('abuse_reports')
        .upsert(updates.map(update => ({
          ...update,
          updated_at: new Date().toISOString()
        })))
        .select();

      if (error) {
        throw error;
      }

      return {
        success: true,
        updatedCount: data?.length || 0,
        updates: data
      };

    } catch (error) {
      console.error('Bulk report update error:', error);
      throw error;
    }
  }

  /**
   * Get all reports for a specific submission
   * @param {string} submissionId - Submission ID
   * @returns {Promise<Array>} Reports for the submission
   */
  async getReportsBySubmission(submissionId) {
    try {
      const { data, error } = await supabase
        .from('abuse_reports')
        .select(`
          *,
          reporter:profiles!reported_by(id, username, full_name)
        `)
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];

    } catch (error) {
      console.error('Get reports by submission error:', error);
      throw error;
    }
  }

  /**
   * Get moderation queue with prioritized items
   * @param {Object} [options] - Queue options
   * @returns {Promise<Object>} Moderation queue
   */
  async getModerationQueue(options = {}) {
    try {
      const { limit = 50, assignedTo } = options;

      let query = supabase
        .from('abuse_reports')
        .select(`
          *,
          submissions!inner(id, url, original_meta, rewritten_meta),
          reporter:profiles!reported_by(id, username, full_name)
        `)
        .in('status', ['pending', 'investigating']);

      if (assignedTo) {
        query = query.eq('assigned_to', assignedTo);
      }

      // Order by priority (descending) then by creation date (ascending for FIFO)
      query = query
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit);

      const { data: queue, error: queueError } = await query;

      if (queueError) throw queueError;

      // Get queue statistics
      const { data: stats, error: statsError } = await supabase
        .from('abuse_reports')
        .select('priority')
        .in('status', ['pending', 'investigating'])
        .then(result => {
          if (result.error) throw result.error;
          
          const priorityStats = result.data.reduce((acc, report) => {
            acc[report.priority] = (acc[report.priority] || 0) + 1;
            return acc;
          }, {});

          return {
            data: Object.entries(priorityStats).map(([priority, count]) => ({ priority: parseInt(priority), count })),
            error: null
          };
        });

      if (statsError) throw statsError;

      const totalItems = stats.reduce((sum, stat) => sum + stat.count, 0);
      const criticalItems = stats.find(s => s.priority === 4)?.count || 0;
      const highPriorityItems = stats.find(s => s.priority === 3)?.count || 0;

      return {
        queue: queue || [],
        statistics: {
          totalItems,
          criticalItems,
          highPriorityItems,
          priorityDistribution: stats
        }
      };

    } catch (error) {
      console.error('Moderation queue error:', error);
      throw error;
    }
  }

  /**
   * Validate report data
   * @param {Object} reportData - Report data to validate
   * @throws {Error} If validation fails
   */
  validateReportData(reportData) {
    const { submission_id, reported_by, report_type, description } = reportData;

    if (!submission_id || typeof submission_id !== 'string') {
      throw new Error('Submission ID is required');
    }

    if (!reported_by || typeof reported_by !== 'string') {
      throw new Error('Reporter ID is required');
    }

    if (!report_type || !this.validReportTypes.includes(report_type)) {
      throw new Error(`Invalid report type. Must be one of: ${this.validReportTypes.join(', ')}`);
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      throw new Error('Description is required');
    }

    if (description.trim().length > 1000) {
      throw new Error('Description must be 1000 characters or less');
    }
  }

  /**
   * Validate report updates
   * @param {Object} updates - Updates to validate
   * @throws {Error} If validation fails
   */
  validateReportUpdates(updates) {
    if (updates.status && !this.validStatuses.includes(updates.status)) {
      throw new Error(`Invalid status. Must be one of: ${this.validStatuses.join(', ')}`);
    }

    if (updates.priority && !this.validPriorities.includes(updates.priority)) {
      throw new Error(`Invalid priority. Must be one of: ${this.validPriorities.join(', ')}`);
    }

    if (updates.resolution_notes && typeof updates.resolution_notes !== 'string') {
      throw new Error('Resolution notes must be a string');
    }
  }

  /**
   * Check for duplicate report from same user
   * @param {string} submissionId - Submission ID
   * @param {string} reportedBy - Reporter user ID
   * @returns {Promise<Object|null>} Existing report or null
   */
  async checkDuplicateReport(submissionId, reportedBy) {
    try {
      const { data, error } = await supabase
        .from('abuse_reports')
        .select('id, created_at')
        .eq('submission_id', submissionId)
        .eq('reported_by', reportedBy)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Duplicate report check error:', error);
      return null;
    }
  }

  /**
   * Check for existing auto-flag on submission
   * @param {string} submissionId - Submission ID
   * @returns {Promise<Object|null>} Existing auto-flag or null
   */
  async checkExistingAutoFlag(submissionId) {
    try {
      const { data, error } = await supabase
        .from('abuse_reports')
        .select('id, created_at')
        .eq('submission_id', submissionId)
        .is('reported_by', null) // Auto-generated reports have null reported_by
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Auto-flag check error:', error);
      return null;
    }
  }

  /**
   * Calculate priority based on report type
   * @param {string} reportType - Type of report
   * @param {number} [overridePriority] - Manual priority override
   * @returns {number} Priority level
   */
  calculatePriority(reportType, overridePriority = null) {
    if (overridePriority && this.validPriorities.includes(overridePriority)) {
      return overridePriority;
    }

    return this.typePriorityMap[reportType] || 1;
  }

  /**
   * Calculate priority for auto-flagged content
   * @param {number} confidence - Confidence score (0-100)
   * @returns {number} Priority level
   */
  calculateAutoFlagPriority(confidence) {
    if (confidence >= 95) return 4; // Critical
    if (confidence >= 85) return 3; // High
    if (confidence >= 70) return 2; // Medium
    return 1; // Low
  }

  /**
   * Determine report type for auto-flagged content
   * @param {Object} criteria - Flagging criteria
   * @returns {string} Report type
   */
  determineAutoFlagType(criteria) {
    const { rule_triggered, reason } = criteria;

    if (rule_triggered?.includes('spam') || reason?.toLowerCase().includes('spam')) {
      return 'spam';
    }

    if (rule_triggered?.includes('inappropriate') || reason?.toLowerCase().includes('inappropriate')) {
      return 'inappropriate';
    }

    return 'other';
  }

  /**
   * Parse timeframe string to milliseconds
   * @param {string} timeframe - Timeframe string
   * @returns {number} Milliseconds
   */
  parseTimeframe(timeframe) {
    const units = {
      day: 24 * 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      months: 30 * 24 * 60 * 60 * 1000
    };

    const match = timeframe.match(/^(\d+)\s+(day|days|week|weeks|month|months)$/);
    if (!match) {
      return 30 * 24 * 60 * 60 * 1000; // Default to 30 days
    }

    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }
}

// Export singleton instance
export const abuseReportingService = new AbuseReportingService();