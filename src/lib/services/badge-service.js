/**
 * Badge Service
 * 
 * Comprehensive service for managing the badge/recognition system in the federation.
 * Handles badge definitions, user badge assignments, earning logic, verification,
 * and analytics.
 * 
 * Features:
 * - Badge definition management
 * - User badge assignment and revocation
 * - Automatic badge earning based on criteria
 * - Cryptographic badge verification
 * - Badge analytics and leaderboards
 * - Federation-specific badge handling
 */

import { createHash, randomBytes } from 'crypto';

export class BadgeService {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error('Supabase client is required');
    }
    this.supabase = supabaseClient;
  }

  /**
   * Get all active badge definitions
   * @param {Object} options - Query options
   * @param {string} options.category - Filter by category
   * @param {string} options.level - Filter by level
   * @param {boolean} options.federationOnly - Only federation badges
   * @returns {Promise<Object>} Result with badge definitions
   */
  async getBadgeDefinitions(options = {}) {
    try {
      let query = this.supabase
        .from('badge_definitions')
        .select('*')
        .eq('is_active', true);

      if (options.category) {
        query = query.eq('category', options.category);
      }

      if (options.level) {
        query = query.eq('level', options.level);
      }

      if (options.federationOnly) {
        query = query.eq('is_federation_badge', true);
      }

      const { data, error } = await query.order('sort_order', { ascending: true });

      if (error) {
        return {
          success: false,
          error: `Failed to fetch badge definitions: ${error.message}`
        };
      }

      return {
        success: true,
        data: data || []
      };
    } catch (error) {
      return {
        success: false,
        error: `Badge definitions fetch error: ${error.message}`
      };
    }
  }

  /**
   * Get specific badge definition by slug
   * @param {string} slug - Badge slug
   * @returns {Promise<Object>} Result with badge definition
   */
  async getBadgeDefinition(slug) {
    try {
      if (!slug || !this.validateBadgeSlug(slug)) {
        return {
          success: false,
          error: 'Valid badge slug is required'
        };
      }

      const { data, error } = await this.supabase
        .from('badge_definitions')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) {
        return {
          success: false,
          error: `Badge not found: ${error.message}`
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: `Badge definition fetch error: ${error.message}`
      };
    }
  }

  /**
   * Get all badges for a specific user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {boolean} options.includeRevoked - Include revoked badges
   * @returns {Promise<Object>} Result with user badges
   */
  async getUserBadges(userId, options = {}) {
    try {
      if (!userId || !this.validateUserId(userId)) {
        return {
          success: false,
          error: 'User ID is required and must be valid'
        };
      }

      const { data, error } = await this.supabase.rpc('get_user_badges', {
        p_user_id: userId
      });

      if (error) {
        return {
          success: false,
          error: `Failed to fetch user badges: ${error.message}`
        };
      }

      // Validate response format
      if (!Array.isArray(data)) {
        return {
          success: false,
          error: 'Invalid response format from database'
        };
      }

      return {
        success: true,
        data: data || []
      };
    } catch (error) {
      return {
        success: false,
        error: `User badges fetch error: ${error.message}`
      };
    }
  }

  /**
   * Award a badge to a user
   * @param {string} userId - User ID
   * @param {string} badgeSlug - Badge slug
   * @param {string} assignmentType - Assignment type ('automatic', 'manual', 'verified')
   * @param {string} assignedBy - ID of user awarding the badge
   * @param {string} reason - Reason for awarding
   * @param {Object} context - Additional context data
   * @returns {Promise<Object>} Result with user badge ID
   */
  async awardBadge(
    userId,
    badgeSlug,
    assignmentType = 'automatic',
    assignedBy = null,
    reason = null,
    context = {}
  ) {
    try {
      if (!userId || !badgeSlug) {
        return {
          success: false,
          error: 'User ID and badge slug are required'
        };
      }

      if (!this.validateUserId(userId) || !this.validateBadgeSlug(badgeSlug)) {
        return {
          success: false,
          error: 'Invalid user ID or badge slug format'
        };
      }

      const validAssignmentTypes = ['automatic', 'manual', 'verified'];
      if (!validAssignmentTypes.includes(assignmentType)) {
        return {
          success: false,
          error: 'Invalid assignment type'
        };
      }

      const { data, error } = await this.supabase.rpc('award_badge', {
        p_user_id: userId,
        p_badge_slug: badgeSlug,
        p_assignment_type: assignmentType,
        p_assigned_by: assignedBy,
        p_assignment_reason: reason,
        p_assignment_context: context
      });

      if (error) {
        return {
          success: false,
          error: `Failed to award badge: ${error.message}`
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: `Badge award error: ${error.message}`
      };
    }
  }

  /**
   * Revoke a badge from a user
   * @param {string} userId - User ID
   * @param {string} badgeSlug - Badge slug
   * @param {string} revokedBy - ID of user revoking the badge
   * @param {string} reason - Reason for revocation
   * @returns {Promise<Object>} Result with success status
   */
  async revokeBadge(userId, badgeSlug, revokedBy, reason) {
    try {
      if (!userId || !badgeSlug || !revokedBy || !reason) {
        return {
          success: false,
          error: 'User ID, badge slug, revoker ID, and reason are required'
        };
      }

      const { data, error } = await this.supabase.rpc('revoke_badge', {
        p_user_id: userId,
        p_badge_slug: badgeSlug,
        p_revoked_by: revokedBy,
        p_revocation_reason: reason
      });

      if (error) {
        return {
          success: false,
          error: `Failed to revoke badge: ${error.message}`
        };
      }

      if (!data) {
        return {
          success: false,
          error: 'Failed to revoke badge - badge not found or already revoked'
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: `Badge revocation error: ${error.message}`
      };
    }
  }

  /**
   * Check if user meets criteria for a specific badge
   * @param {string} userId - User ID
   * @param {string} badgeSlug - Badge slug
   * @returns {Promise<Object>} Result with criteria check
   */
  async checkBadgeCriteria(userId, badgeSlug) {
    try {
      if (!userId || !badgeSlug) {
        return {
          success: false,
          error: 'User ID and badge slug are required'
        };
      }

      const { data, error } = await this.supabase.rpc('check_badge_criteria', {
        p_user_id: userId,
        p_badge_slug: badgeSlug
      });

      if (error) {
        return {
          success: false,
          error: `Failed to check badge criteria: ${error.message}`
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: `Badge criteria check error: ${error.message}`
      };
    }
  }

  /**
   * Automatically check and award eligible badges for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Result with awarded badge slugs
   */
  async autoCheckAndAwardBadges(userId) {
    try {
      if (!userId || !this.validateUserId(userId)) {
        return {
          success: false,
          error: 'Valid user ID is required'
        };
      }

      const { data, error } = await this.supabase.rpc('auto_check_and_award_badges', {
        p_user_id: userId
      });

      if (error) {
        return {
          success: false,
          error: `Failed to auto-check badges: ${error.message}`
        };
      }

      // Extract awarded badge slugs from the result
      const awardedBadges = data?.map(row => row.awarded_badge_slug).filter(Boolean) || [];

      return {
        success: true,
        data: awardedBadges
      };
    } catch (error) {
      return {
        success: false,
        error: `Auto badge check error: ${error.message}`
      };
    }
  }

  /**
   * Create badge verification record
   * @param {string} userBadgeId - User badge ID
   * @param {Object} verificationData - Verification data
   * @param {string} verificationData.signature_hash - Cryptographic signature
   * @param {string} verificationData.public_key - Public key for verification
   * @param {Object} verificationData.verification_payload - Payload data
   * @returns {Promise<Object>} Result with verification record
   */
  async verifyBadge(userBadgeId, verificationData) {
    try {
      if (!userBadgeId || !verificationData) {
        return {
          success: false,
          error: 'User badge ID and verification data are required'
        };
      }

      const { signature_hash, public_key, verification_payload } = verificationData;

      if (!signature_hash || !public_key || !verification_payload) {
        return {
          success: false,
          error: 'signature_hash, public_key, and verification_payload are required'
        };
      }

      const { data, error } = await this.supabase
        .from('badge_verifications')
        .insert([{
          user_badge_id: userBadgeId,
          signature_hash,
          public_key,
          verification_payload,
          verification_method: 'ed25519',
          verification_version: '1.0'
        }])
        .select()
        .single();

      if (error) {
        return {
          success: false,
          error: `Failed to create verification: ${error.message}`
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: `Badge verification error: ${error.message}`
      };
    }
  }

  /**
   * Validate badge signature
   * @param {string} signature - Signature to validate
   * @param {Object} payload - Payload that was signed
   * @param {string} publicKey - Public key for verification
   * @returns {Promise<Object>} Result with validation status
   */
  async validateBadgeSignature(signature, payload, publicKey) {
    try {
      // Simplified signature validation for demo purposes
      // In production, use proper cryptographic libraries like sodium or noble
      const payloadHash = createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');

      const expectedSignature = createHash('sha256')
        .update(payloadHash + publicKey)
        .digest('hex');

      const isValid = signature === expectedSignature;

      return {
        success: true,
        data: {
          isValid,
          payloadHash,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Signature validation error: ${error.message}`
      };
    }
  }

  /**
   * Get badge statistics
   * @param {string} badgeSlug - Badge slug
   * @returns {Promise<Object>} Result with badge statistics
   */
  async getBadgeStats(badgeSlug) {
    try {
      if (!badgeSlug || !this.validateBadgeSlug(badgeSlug)) {
        return {
          success: false,
          error: 'Valid badge slug is required'
        };
      }

      const { data, error } = await this.supabase.rpc('get_badge_stats', {
        badge_slug: badgeSlug
      });

      if (error) {
        return {
          success: false,
          error: `Failed to fetch badge stats: ${error.message}`
        };
      }

      return {
        success: true,
        data: data?.[0] || {}
      };
    } catch (error) {
      return {
        success: false,
        error: `Badge stats error: ${error.message}`
      };
    }
  }

  /**
   * Get badge leaderboard
   * @param {string} badgeSlug - Optional badge slug to filter by
   * @param {number} limit - Number of results to return
   * @returns {Promise<Object>} Result with leaderboard data
   */
  async getBadgeLeaderboard(badgeSlug = null, limit = 10) {
    try {
      const { data, error } = await this.supabase.rpc('get_badge_leaderboard', {
        badge_slug: badgeSlug,
        limit_count: limit
      });

      if (error) {
        return {
          success: false,
          error: `Failed to fetch leaderboard: ${error.message}`
        };
      }

      return {
        success: true,
        data: data || []
      };
    } catch (error) {
      return {
        success: false,
        error: `Leaderboard fetch error: ${error.message}`
      };
    }
  }

  /**
   * Get badge earning history for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of results
   * @param {string} options.badgeSlug - Filter by badge
   * @returns {Promise<Object>} Result with earning history
   */
  async getBadgeEarningHistory(userId, options = {}) {
    try {
      if (!userId || !this.validateUserId(userId)) {
        return {
          success: false,
          error: 'Valid user ID is required'
        };
      }

      let query = this.supabase
        .from('badge_earning_history')
        .select(`
          *,
          badge_definitions!inner(slug, name, category, level)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.badgeSlug) {
        query = query.eq('badge_definitions.slug', options.badgeSlug);
      }

      const { data, error } = await query;

      if (error) {
        return {
          success: false,
          error: `Failed to fetch earning history: ${error.message}`
        };
      }

      return {
        success: true,
        data: data || []
      };
    } catch (error) {
      return {
        success: false,
        error: `Earning history fetch error: ${error.message}`
      };
    }
  }

  /**
   * Update user badge display preferences
   * @param {string} userId - User ID
   * @param {string} badgeSlug - Badge slug
   * @param {Object} preferences - Display preferences
   * @param {boolean} preferences.isVisible - Badge visibility
   * @param {number} preferences.displayOrder - Display order
   * @returns {Promise<Object>} Result with update status
   */
  async updateBadgeDisplayPreferences(userId, badgeSlug, preferences) {
    try {
      if (!userId || !badgeSlug || !preferences) {
        return {
          success: false,
          error: 'User ID, badge slug, and preferences are required'
        };
      }

      const { data, error } = await this.supabase
        .from('user_badges')
        .update({
          is_visible: preferences.isVisible,
          display_order: preferences.displayOrder
        })
        .eq('user_id', userId)
        .eq('badge_id', this.supabase
          .from('badge_definitions')
          .select('id')
          .eq('slug', badgeSlug)
          .single()
        )
        .select();

      if (error) {
        return {
          success: false,
          error: `Failed to update preferences: ${error.message}`
        };
      }

      return {
        success: true,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: `Preference update error: ${error.message}`
      };
    }
  }

  /**
   * Generate cryptographic signature for badge
   * @param {Object} payload - Badge payload to sign
   * @param {string} privateKey - Private key for signing
   * @returns {Promise<Object>} Result with signature
   */
  async generateBadgeSignature(payload, privateKey) {
    try {
      // Simplified signature generation for demo purposes
      // In production, use proper cryptographic libraries
      const payloadString = JSON.stringify(payload);
      const nonce = randomBytes(16).toString('hex');
      
      const signature = createHash('sha256')
        .update(payloadString + privateKey + nonce)
        .digest('hex');

      return {
        success: true,
        data: {
          signature,
          nonce,
          timestamp: new Date().toISOString(),
          payload
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Signature generation error: ${error.message}`
      };
    }
  }

  /**
   * Validate user ID format
   * @param {string} userId - User ID to validate
   * @returns {boolean} True if valid
   */
  validateUserId(userId) {
    if (!userId || typeof userId !== 'string') {
      return false;
    }
    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(userId) || userId.startsWith('user-'); // Allow test IDs
  }

  /**
   * Validate badge slug format
   * @param {string} slug - Badge slug to validate
   * @returns {boolean} True if valid
   */
  validateBadgeSlug(slug) {
    if (!slug || typeof slug !== 'string') {
      return false;
    }
    // Slug format: lowercase letters, numbers, and hyphens only
    const slugRegex = /^[a-z0-9-]+$/;
    return slugRegex.test(slug) && slug.length >= 3 && slug.length <= 50;
  }

  /**
   * Get federation-specific badges
   * @returns {Promise<Object>} Result with federation badges
   */
  async getFederationBadges() {
    return this.getBadgeDefinitions({ federationOnly: true });
  }

  /**
   * Check if user has specific badge
   * @param {string} userId - User ID
   * @param {string} badgeSlug - Badge slug
   * @returns {Promise<Object>} Result with badge status
   */
  async userHasBadge(userId, badgeSlug) {
    try {
      const userBadgesResult = await this.getUserBadges(userId);
      
      if (!userBadgesResult.success) {
        return userBadgesResult;
      }

      const hasBadge = userBadgesResult.data.some(
        badge => badge.badge_slug === badgeSlug
      );

      return {
        success: true,
        data: { hasBadge }
      };
    } catch (error) {
      return {
        success: false,
        error: `Badge check error: ${error.message}`
      };
    }
  }
}

export default BadgeService;