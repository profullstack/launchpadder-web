/**
 * Penalties Service
 * Progressive penalty system with warnings, restrictions, and bans
 */

import { supabase } from '$lib/config/supabase.js';

/**
 * Penalties service for progressive enforcement actions
 */
class PenaltiesService {
  constructor() {
    this.validPenaltyTypes = ['warning', 'rate_limit', 'temporary_ban', 'permanent_ban', 'ip_block'];
    this.validSeverities = [1, 2, 3, 4]; // 1=minor, 2=moderate, 3=severe, 4=critical

    // Escalation matrix based on penalty history and severity
    this.escalationMatrix = {
      0: { // No previous penalties
        1: 'warning',
        2: 'warning',
        3: 'rate_limit',
        4: 'temporary_ban'
      },
      1: { // Previous warnings
        1: 'warning',
        2: 'rate_limit',
        3: 'temporary_ban',
        4: 'temporary_ban'
      },
      2: { // Previous rate limits
        1: 'rate_limit',
        2: 'rate_limit',
        3: 'temporary_ban',
        4: 'temporary_ban'
      },
      3: { // Previous temporary bans
        1: 'temporary_ban',
        2: 'temporary_ban',
        3: 'temporary_ban',
        4: 'permanent_ban'
      },
      4: { // Previous permanent bans (shouldn't happen, but safety)
        1: 'permanent_ban',
        2: 'permanent_ban',
        3: 'permanent_ban',
        4: 'permanent_ban'
      }
    };

    // Duration mapping for temporary penalties (in milliseconds)
    this.penaltyDurations = {
      'rate_limit': {
        1: 1 * 60 * 60 * 1000,      // 1 hour
        2: 6 * 60 * 60 * 1000,      // 6 hours
        3: 24 * 60 * 60 * 1000,     // 24 hours
        4: 7 * 24 * 60 * 60 * 1000  // 7 days
      },
      'temporary_ban': {
        1: 24 * 60 * 60 * 1000,     // 1 day
        2: 3 * 24 * 60 * 60 * 1000, // 3 days
        3: 7 * 24 * 60 * 60 * 1000, // 7 days
        4: 30 * 24 * 60 * 60 * 1000 // 30 days
      }
    };
  }

  /**
   * Apply penalty to user with progressive escalation
   * @param {string} userId - User ID to penalize
   * @param {Object} penaltyData - Penalty details
   * @returns {Promise<Object>} Penalty application result
   */
  async applyPenalty(userId, penaltyData) {
    try {
      // Validate penalty data
      this.validatePenaltyData(penaltyData);

      const { reason, severity, evidence, applied_by } = penaltyData;

      // Get user's penalty history to determine escalation
      const penaltyHistory = await this.getUserPenaltyHistory(userId);
      const escalationLevel = this.calculateEscalationLevel(penaltyHistory);
      
      // Determine penalty type based on escalation matrix
      const penaltyType = this.determinePenaltyType(escalationLevel, severity);
      
      // Calculate expiration time for temporary penalties
      const expiresAt = this.calculateExpirationTime(penaltyType, severity);

      // Apply the penalty
      const { data, error } = await supabase
        .from('user_penalties')
        .insert({
          user_id: userId,
          penalty_type: penaltyType,
          reason: reason.trim(),
          severity,
          is_active: true,
          starts_at: new Date().toISOString(),
          expires_at: expiresAt ? expiresAt.toISOString() : null,
          applied_by: applied_by || null,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Check if this was an escalation
      const escalated = escalationLevel > 0;

      return {
        success: true,
        penaltyId: data.id,
        penaltyType: data.penalty_type,
        severity: data.severity,
        expiresAt: data.expires_at ? new Date(data.expires_at) : null,
        escalated,
        escalationLevel,
        evidence
      };

    } catch (error) {
      console.error('Penalty application error:', error);
      throw new Error(`Failed to apply penalty: ${error.message}`);
    }
  }

  /**
   * Check user's current active penalties
   * @param {string} userId - User ID to check
   * @returns {Promise<Object>} User penalty status
   */
  async checkUserPenalties(userId) {
    try {
      const { data, error } = await supabase
        .from('user_penalties')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const penalties = data || [];
      
      // Filter out expired penalties
      const now = new Date();
      const activePenalties = penalties.filter(penalty => {
        if (!penalty.expires_at) return true; // Permanent penalties
        return new Date(penalty.expires_at) > now;
      });

      // Determine user status
      const hasActivePenalties = activePenalties.length > 0;
      const highestSeverity = activePenalties.reduce((max, p) => Math.max(max, p.severity), 0);
      
      // Check for bans
      const banPenalty = activePenalties.find(p => 
        p.penalty_type === 'temporary_ban' || p.penalty_type === 'permanent_ban'
      );
      
      const isBanned = !!banPenalty;
      const banType = banPenalty ? 
        (banPenalty.penalty_type === 'permanent_ban' ? 'permanent' : 'temporary') : 
        null;

      // Check for rate limiting
      const rateLimitPenalty = activePenalties.find(p => p.penalty_type === 'rate_limit');
      const isRateLimited = !!rateLimitPenalty;

      return {
        hasActivePenalties,
        penalties: activePenalties,
        highestSeverity,
        isBanned,
        banType,
        isRateLimited,
        rateLimitLevel: rateLimitPenalty?.severity || 0
      };

    } catch (error) {
      console.error('User penalty check error:', error);
      throw error;
    }
  }

  /**
   * Remove/deactivate a penalty
   * @param {string} penaltyId - Penalty ID to remove
   * @param {string} reason - Reason for removal
   * @returns {Promise<Object>} Removal result
   */
  async removePenalty(penaltyId, reason) {
    try {
      const { data, error } = await supabase
        .from('user_penalties')
        .update({
          is_active: false,
          appeal_notes: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', penaltyId)
        .select()
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!data) {
        return {
          success: false,
          error: 'Penalty not found'
        };
      }

      return {
        success: true,
        penaltyId,
        reason
      };

    } catch (error) {
      console.error('Penalty removal error:', error);
      throw error;
    }
  }

  /**
   * Get user's penalty history
   * @param {string} userId - User ID
   * @param {Object} [options] - Query options
   * @returns {Promise<Object>} Penalty history
   */
  async getPenaltyHistory(userId, options = {}) {
    try {
      const { page = 1, limit = 20, includeInactive = true } = options;

      let query = supabase
        .from('user_penalties')
        .select(`
          *,
          applied_by_user:profiles!applied_by(id, username, full_name)
        `)
        .eq('user_id', userId);

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      query = query
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      const history = data || [];
      
      // Calculate escalation pattern
      const escalationPattern = history
        .reverse() // Chronological order
        .map(p => p.penalty_type);

      const isEscalating = this.isEscalatingPattern(escalationPattern);

      return {
        history: history.reverse(), // Back to reverse chronological
        totalPenalties: count || history.length,
        escalationPattern,
        isEscalating,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };

    } catch (error) {
      console.error('Penalty history error:', error);
      throw error;
    }
  }

  /**
   * Clean up expired penalties
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupExpiredPenalties() {
    try {
      const { data, error } = await supabase
        .from('user_penalties')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('is_active', true)
        .lt('expires_at', new Date().toISOString())
        .select();

      if (error) {
        throw error;
      }

      return {
        deactivatedCount: data?.length || 0
      };

    } catch (error) {
      console.error('Penalty cleanup error:', error);
      throw new Error(`Failed to cleanup expired penalties: ${error.message}`);
    }
  }

  /**
   * Get penalty statistics
   * @param {Object} [options] - Query options
   * @returns {Promise<Object>} Statistics
   */
  async getPenaltyStatistics(options = {}) {
    try {
      const timeframe = options.timeframe || '30 days';
      const cutoffTime = new Date(Date.now() - this.parseTimeframe(timeframe)).toISOString();

      // Get total penalties
      const { data: totalData, error: totalError } = await supabase
        .from('user_penalties')
        .select('*', { count: 'exact' })
        .gte('created_at', cutoffTime);

      if (totalError) throw totalError;

      // Get active penalties
      const { data: activeData, error: activeError } = await supabase
        .from('user_penalties')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .gte('created_at', cutoffTime);

      if (activeError) throw activeError;

      // Get penalty type distribution
      const { data: typeDistribution, error: typeError } = await supabase
        .from('user_penalties')
        .select('penalty_type')
        .gte('created_at', cutoffTime)
        .then(result => {
          if (result.error) throw result.error;
          
          const distribution = result.data.reduce((acc, penalty) => {
            acc[penalty.penalty_type] = (acc[penalty.penalty_type] || 0) + 1;
            return acc;
          }, {});

          return {
            data: Object.entries(distribution).map(([penalty_type, count]) => ({ penalty_type, count })),
            error: null
          };
        });

      if (typeError) throw typeError;

      const totalPenalties = totalData?.length || 0;
      const activePenalties = activeData?.length || 0;
      
      // Calculate escalation rate (non-warning penalties / total penalties)
      const warningCount = typeDistribution.find(t => t.penalty_type === 'warning')?.count || 0;
      const escalatedCount = totalPenalties - warningCount;
      const escalationRate = totalPenalties > 0 ? Math.round((escalatedCount / totalPenalties) * 100) : 0;

      return {
        totalPenalties,
        activePenalties,
        escalationRate,
        penaltyTypeDistribution: typeDistribution,
        timeframe
      };

    } catch (error) {
      console.error('Penalty statistics error:', error);
      throw error;
    }
  }

  /**
   * Apply penalties to multiple users
   * @param {Array} penalties - Array of penalty data
   * @returns {Promise<Object>} Bulk application result
   */
  async bulkApplyPenalties(penalties) {
    try {
      // Validate all penalties first
      for (const penalty of penalties) {
        if (!penalty.user_id || typeof penalty.user_id !== 'string') {
          throw new Error('Invalid user ID in bulk penalty data');
        }
        this.validatePenaltyData(penalty);
      }

      const penaltyRecords = penalties.map(penalty => ({
        user_id: penalty.user_id,
        penalty_type: penalty.penalty_type || 'warning',
        reason: penalty.reason.trim(),
        severity: penalty.severity,
        is_active: true,
        starts_at: new Date().toISOString(),
        expires_at: penalty.expires_at || null,
        applied_by: penalty.applied_by || null,
        created_at: new Date().toISOString()
      }));

      const { data, error } = await supabase
        .from('user_penalties')
        .insert(penaltyRecords)
        .select();

      if (error) {
        throw error;
      }

      return {
        success: true,
        appliedCount: data?.length || 0,
        penalties: data
      };

    } catch (error) {
      console.error('Bulk penalty application error:', error);
      throw error;
    }
  }

  /**
   * Get escalation path for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Escalation path information
   */
  async getEscalationPath(userId) {
    try {
      const penaltyHistory = await this.getUserPenaltyHistory(userId);
      const currentLevel = this.calculateEscalationLevel(penaltyHistory);
      
      // Determine next penalty type for each severity level
      const nextPenalties = {};
      for (let severity = 1; severity <= 4; severity++) {
        const nextType = this.determinePenaltyType(currentLevel, severity);
        nextPenalties[severity] = nextType;
      }

      const atMaximum = currentLevel >= 4;
      const nextPenalty = atMaximum ? null : nextPenalties[2]; // Default severity 2

      return {
        currentLevel,
        nextPenalty,
        nextPenalties,
        atMaximum,
        escalationHistory: penaltyHistory.map(p => p.penalty_type)
      };

    } catch (error) {
      console.error('Escalation path error:', error);
      throw error;
    }
  }

  /**
   * Submit penalty appeal
   * @param {string} penaltyId - Penalty ID to appeal
   * @param {string} appealReason - Reason for appeal
   * @returns {Promise<Object>} Appeal result
   */
  async appealPenalty(penaltyId, appealReason) {
    try {
      // Check if penalty exists and hasn't been appealed
      const { data: existing, error: fetchError } = await supabase
        .from('user_penalties')
        .select('id, appeal_notes')
        .eq('id', penaltyId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (!existing) {
        return {
          success: false,
          error: 'Penalty not found'
        };
      }

      if (existing.appeal_notes) {
        return {
          success: false,
          error: 'This penalty has already been appealed'
        };
      }

      // Submit appeal
      const { data, error } = await supabase
        .from('user_penalties')
        .update({
          appeal_notes: appealReason.trim(),
          appeal_submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', penaltyId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        success: true,
        penaltyId,
        appealReason: appealReason.trim(),
        submittedAt: new Date(data.appeal_submitted_at)
      };

    } catch (error) {
      console.error('Penalty appeal error:', error);
      throw error;
    }
  }

  /**
   * Get user's penalty history for escalation calculation
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Penalty history
   */
  async getUserPenaltyHistory(userId) {
    try {
      const { data, error } = await supabase
        .from('user_penalties')
        .select('penalty_type, severity, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Penalty history fetch error:', error);
      return [];
    }
  }

  /**
   * Calculate escalation level based on penalty history
   * @param {Array} penaltyHistory - User's penalty history
   * @returns {number} Escalation level (0-4)
   */
  calculateEscalationLevel(penaltyHistory) {
    if (penaltyHistory.length === 0) return 0;

    // Find the highest penalty type in history
    const penaltyTypeValues = {
      'warning': 1,
      'rate_limit': 2,
      'temporary_ban': 3,
      'permanent_ban': 4,
      'ip_block': 4
    };

    const maxLevel = penaltyHistory.reduce((max, penalty) => {
      const level = penaltyTypeValues[penalty.penalty_type] || 0;
      return Math.max(max, level);
    }, 0);

    return maxLevel;
  }

  /**
   * Determine penalty type based on escalation level and severity
   * @param {number} escalationLevel - Current escalation level
   * @param {number} severity - Violation severity
   * @returns {string} Penalty type
   */
  determinePenaltyType(escalationLevel, severity) {
    const matrix = this.escalationMatrix[Math.min(escalationLevel, 4)];
    return matrix[severity] || 'warning';
  }

  /**
   * Calculate expiration time for temporary penalties
   * @param {string} penaltyType - Type of penalty
   * @param {number} severity - Severity level
   * @returns {Date|null} Expiration date or null for permanent
   */
  calculateExpirationTime(penaltyType, severity) {
    if (penaltyType === 'permanent_ban' || penaltyType === 'warning') {
      return null; // Permanent or no expiration
    }

    const durations = this.penaltyDurations[penaltyType];
    if (!durations) return null;

    const duration = durations[severity] || durations[1]; // Default to severity 1
    return new Date(Date.now() + duration);
  }

  /**
   * Check if penalty pattern is escalating
   * @param {Array} pattern - Array of penalty types in chronological order
   * @returns {boolean} True if escalating
   */
  isEscalatingPattern(pattern) {
    if (pattern.length < 2) return false;

    const typeValues = {
      'warning': 1,
      'rate_limit': 2,
      'temporary_ban': 3,
      'permanent_ban': 4,
      'ip_block': 4
    };

    for (let i = 1; i < pattern.length; i++) {
      const prevValue = typeValues[pattern[i - 1]] || 0;
      const currValue = typeValues[pattern[i]] || 0;
      
      if (currValue > prevValue) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate penalty data
   * @param {Object} penaltyData - Penalty data to validate
   * @throws {Error} If validation fails
   */
  validatePenaltyData(penaltyData) {
    const { reason, severity } = penaltyData;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error('Invalid reason: must be a non-empty string');
    }

    if (reason.trim().length > 500) {
      throw new Error('Invalid reason: must be 500 characters or less');
    }

    if (!severity || !this.validSeverities.includes(severity)) {
      throw new Error(`Invalid severity: must be one of ${this.validSeverities.join(', ')}`);
    }
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
export const penaltiesService = new PenaltiesService();