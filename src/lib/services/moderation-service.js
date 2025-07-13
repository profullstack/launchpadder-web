/**
 * Moderation Service
 * Handles content moderation, approval workflows, and admin management
 */

export class ModerationService {
  constructor(options = {}) {
    if (!options.supabase) {
      throw new Error('Supabase client is required');
    }
    
    this.supabase = options.supabase;
    this.aiService = options.aiService || null;
    
    // Valid moderation decisions
    this.validDecisions = ['approved', 'rejected', 'escalated'];
    
    // Bulk operation limits
    this.maxBulkOperations = 100;
  }

  /**
   * Submit a submission for moderation review
   * @param {string} submissionId - Submission ID
   * @param {string} userId - User ID who owns the submission
   * @returns {Promise<Object>} Updated submission
   */
  async submitForReview(submissionId, userId) {
    if (!submissionId) {
      throw new Error('Submission ID is required');
    }
    
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    try {
      const { data, error } = await this.supabase
        .from('submissions')
        .update({
          status: 'pending_review',
          submitted_for_review_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', submissionId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) {
        throw new Error(`Failed to submit for review: ${error.message}`);
      }
      
      return data;
      
    } catch (error) {
      throw new Error(`Failed to submit for review: ${error.message}`);
    }
  }

  /**
   * Review a submission (approve/reject)
   * @param {string} submissionId - Submission ID
   * @param {string} moderatorId - Moderator ID
   * @param {string} decision - 'approved' or 'rejected'
   * @param {string} notes - Moderation notes
   * @returns {Promise<Object>} Updated submission
   */
  async reviewSubmission(submissionId, moderatorId, decision, notes = '') {
    this.validateModerationDecision(decision, notes);
    
    try {
      // Update submission status
      const { data: submission, error: updateError } = await this.supabase
        .from('submissions')
        .update({
          status: decision,
          reviewed_by: moderatorId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', submissionId)
        .select()
        .single();
      
      if (updateError) {
        throw new Error(`Failed to update submission: ${updateError.message}`);
      }
      
      // Record moderation review
      const { error: reviewError } = await this.supabase
        .from('moderation_reviews')
        .insert({
          submission_id: submissionId,
          moderator_id: moderatorId,
          decision,
          notes,
          reviewed_at: new Date().toISOString()
        });
      
      if (reviewError) {
        console.error('Failed to record moderation review:', reviewError);
      }
      
      return submission;
      
    } catch (error) {
      throw new Error(`Failed to review submission: ${error.message}`);
    }
  }

  /**
   * Get pending submissions for moderation
   * @param {number} offset - Pagination offset
   * @param {number} limit - Number of items per page
   * @returns {Promise<Object>} Paginated submissions
   */
  async getPendingSubmissions(offset = 0, limit = 10) {
    try {
      const { data: submissions, error, count } = await this.supabase
        .from('submissions')
        .select(`
          *,
          users:user_id (
            id,
            email,
            username
          )
        `, { count: 'exact' })
        .eq('status', 'pending_review')
        .order('submitted_for_review_at', { ascending: true })
        .range(offset, offset + limit - 1);
      
      if (error) {
        throw new Error(`Failed to fetch pending submissions: ${error.message}`);
      }
      
      return {
        submissions: submissions || [],
        total: count || 0,
        offset,
        limit
      };
      
    } catch (error) {
      throw new Error(`Failed to get pending submissions: ${error.message}`);
    }
  }

  /**
   * Get moderation history for a submission
   * @param {string} submissionId - Submission ID
   * @returns {Promise<Array>} Moderation history
   */
  async getModerationHistory(submissionId) {
    try {
      const { data, error } = await this.supabase
        .from('moderation_reviews')
        .select(`
          *,
          moderator:moderator_id (
            id,
            email,
            username
          )
        `)
        .eq('submission_id', submissionId)
        .order('reviewed_at', { ascending: false });
      
      if (error) {
        throw new Error(`Failed to fetch moderation history: ${error.message}`);
      }
      
      return data || [];
      
    } catch (error) {
      throw new Error(`Failed to get moderation history: ${error.message}`);
    }
  }

  /**
   * Automatically moderate content using AI
   * @param {Object} submission - Submission to moderate
   * @returns {Promise<Object>} Moderation result
   */
  async autoModerate(submission) {
    if (!this.aiService) {
      return {
        action: 'manual_review',
        reason: 'AI service not available',
        confidence: 0
      };
    }
    
    try {
      const contentToAnalyze = {
        title: submission.title,
        description: submission.description,
        url: submission.url
      };
      
      const analysis = await this.aiService.detectInappropriateContent(contentToAnalyze);
      
      if (analysis.isInappropriate) {
        return {
          action: 'flag',
          confidence: analysis.confidence,
          categories: analysis.categories,
          reasons: analysis.reasons,
          requiresHumanReview: true
        };
      } else {
        return {
          action: 'approve',
          confidence: analysis.confidence,
          categories: analysis.categories || [],
          reasons: analysis.reasons || []
        };
      }
      
    } catch (error) {
      console.error('Auto-moderation error:', error);
      return {
        action: 'manual_review',
        error: error.message,
        confidence: 0
      };
    }
  }

  /**
   * Get moderation statistics
   * @returns {Promise<Object>} Moderation stats
   */
  async getModerationStats() {
    try {
      const { data, error } = await this.supabase
        .rpc('get_moderation_stats');
      
      if (error) {
        throw new Error(`Failed to fetch moderation stats: ${error.message}`);
      }
      
      return data;
      
    } catch (error) {
      throw new Error(`Failed to get moderation stats: ${error.message}`);
    }
  }

  /**
   * Assign a moderator to a submission
   * @param {string} submissionId - Submission ID
   * @param {string} moderatorId - Moderator ID
   * @returns {Promise<Object>} Updated submission
   */
  async assignModerator(submissionId, moderatorId) {
    try {
      const { data, error } = await this.supabase
        .from('submissions')
        .update({
          assigned_moderator: moderatorId,
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', submissionId)
        .select()
        .single();
      
      if (error) {
        throw new Error(`Failed to assign moderator: ${error.message}`);
      }
      
      return data;
      
    } catch (error) {
      throw new Error(`Failed to assign moderator: ${error.message}`);
    }
  }

  /**
   * Escalate a submission to senior moderator
   * @param {string} submissionId - Submission ID
   * @param {string} reason - Escalation reason
   * @param {string} escalatedBy - Moderator who escalated
   * @returns {Promise<Object>} Updated submission
   */
  async escalateSubmission(submissionId, reason, escalatedBy) {
    try {
      // Update submission status
      const { data: submission, error: updateError } = await this.supabase
        .from('submissions')
        .update({
          status: 'escalated',
          escalated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', submissionId)
        .select()
        .single();
      
      if (updateError) {
        throw new Error(`Failed to escalate submission: ${updateError.message}`);
      }
      
      // Record escalation
      const { error: escalationError } = await this.supabase
        .from('moderation_escalations')
        .insert({
          submission_id: submissionId,
          reason,
          escalated_by: escalatedBy,
          escalated_at: new Date().toISOString()
        });
      
      if (escalationError) {
        console.error('Failed to record escalation:', escalationError);
      }
      
      return submission;
      
    } catch (error) {
      throw new Error(`Failed to escalate submission: ${error.message}`);
    }
  }

  /**
   * Moderate multiple submissions at once
   * @param {Array} submissionIds - Array of submission IDs
   * @param {string} moderatorId - Moderator ID
   * @param {string} decision - Moderation decision
   * @param {string} notes - Moderation notes
   * @returns {Promise<Object>} Bulk operation result
   */
  async bulkModerate(submissionIds, moderatorId, decision, notes = '') {
    if (submissionIds.length > this.maxBulkOperations) {
      throw new Error(`Cannot moderate more than ${this.maxBulkOperations} submissions at once`);
    }
    
    this.validateModerationDecision(decision, notes);
    
    try {
      // Update submissions
      const { data: submissions, error: updateError } = await this.supabase
        .from('submissions')
        .update({
          status: decision,
          reviewed_by: moderatorId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in('id', submissionIds)
        .select();
      
      if (updateError) {
        throw new Error(`Failed to bulk update submissions: ${updateError.message}`);
      }
      
      // Record moderation reviews
      const reviews = submissionIds.map(id => ({
        submission_id: id,
        moderator_id: moderatorId,
        decision,
        notes,
        reviewed_at: new Date().toISOString()
      }));
      
      const { error: reviewError } = await this.supabase
        .from('moderation_reviews')
        .insert(reviews);
      
      if (reviewError) {
        console.error('Failed to record bulk moderation reviews:', reviewError);
      }
      
      return {
        updated: submissions?.length || 0,
        submissions: submissions || []
      };
      
    } catch (error) {
      throw new Error(`Failed to bulk moderate: ${error.message}`);
    }
  }

  /**
   * Get moderator workload statistics
   * @param {string} moderatorId - Moderator ID
   * @returns {Promise<Object>} Workload stats
   */
  async getModeratorWorkload(moderatorId) {
    try {
      const { data, error } = await this.supabase
        .rpc('get_moderator_workload', {
          moderator_uuid: moderatorId
        });
      
      if (error) {
        throw new Error(`Failed to fetch moderator workload: ${error.message}`);
      }
      
      return data;
      
    } catch (error) {
      throw new Error(`Failed to get moderator workload: ${error.message}`);
    }
  }

  /**
   * Validate moderation decision
   * @param {string} decision - Decision to validate
   * @param {string} notes - Moderation notes
   * @throws {Error} If validation fails
   */
  validateModerationDecision(decision, notes) {
    if (!this.validDecisions.includes(decision)) {
      throw new Error('Invalid decision. Must be one of: ' + this.validDecisions.join(', '));
    }
    
    if (decision === 'rejected' && (!notes || notes.trim().length === 0)) {
      throw new Error('Notes are required for rejection');
    }
  }

  /**
   * Get submissions by status with filtering
   * @param {string} status - Submission status
   * @param {Object} filters - Additional filters
   * @param {number} offset - Pagination offset
   * @param {number} limit - Number of items per page
   * @returns {Promise<Object>} Filtered submissions
   */
  async getSubmissionsByStatus(status, filters = {}, offset = 0, limit = 10) {
    try {
      let query = this.supabase
        .from('submissions')
        .select(`
          *,
          users:user_id (
            id,
            email,
            username
          ),
          moderator:reviewed_by (
            id,
            email,
            username
          )
        `, { count: 'exact' })
        .eq('status', status);
      
      // Apply filters
      if (filters.moderatorId) {
        query = query.eq('reviewed_by', filters.moderatorId);
      }
      
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }
      
      if (filters.category) {
        query = query.contains('tags', [filters.category]);
      }
      
      const { data: submissions, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (error) {
        throw new Error(`Failed to fetch submissions: ${error.message}`);
      }
      
      return {
        submissions: submissions || [],
        total: count || 0,
        offset,
        limit
      };
      
    } catch (error) {
      throw new Error(`Failed to get submissions by status: ${error.message}`);
    }
  }

  /**
   * Get moderation queue with priority sorting
   * @param {string} moderatorId - Optional moderator ID for assigned items
   * @param {number} offset - Pagination offset
   * @param {number} limit - Number of items per page
   * @returns {Promise<Object>} Prioritized moderation queue
   */
  async getModerationQueue(moderatorId = null, offset = 0, limit = 10) {
    try {
      let query = this.supabase
        .from('submissions')
        .select(`
          *,
          users:user_id (
            id,
            email,
            username
          )
        `, { count: 'exact' })
        .in('status', ['pending_review', 'escalated']);
      
      if (moderatorId) {
        query = query.eq('assigned_moderator', moderatorId);
      }
      
      const { data: submissions, error, count } = await query
        .order('status', { ascending: false }) // escalated first
        .order('submitted_for_review_at', { ascending: true }) // oldest first
        .range(offset, offset + limit - 1);
      
      if (error) {
        throw new Error(`Failed to fetch moderation queue: ${error.message}`);
      }
      
      return {
        submissions: submissions || [],
        total: count || 0,
        offset,
        limit
      };
      
    } catch (error) {
      throw new Error(`Failed to get moderation queue: ${error.message}`);
    }
  }
}