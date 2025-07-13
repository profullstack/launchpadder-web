/**
 * Spam Detection Service
 * Content analysis and spam pattern detection with configurable rules
 */

import { supabase } from '$lib/config/supabase.js';

/**
 * Spam detection service with content analysis and pattern matching
 */
class SpamDetectionService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Analyze content for spam patterns
   * @param {string} content - Content to analyze
   * @param {Object} [options] - Analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeContent(content, options = {}) {
    try {
      if (!content || typeof content !== 'string') {
        return {
          isSpam: false,
          confidence: 0,
          detections: [],
          action: 'allow'
        };
      }

      // Get content-specific spam rules
      const rules = await this.getSpamRules('content');
      const detections = [];
      let totalConfidence = 0;
      let highestAction = 'allow';

      for (const rule of rules) {
        const detection = this.applyContentRule(content, rule);
        if (detection.matched) {
          detections.push({
            ruleId: rule.id,
            ruleName: rule.name,
            confidence: detection.confidence,
            matchedContent: detection.matchedContent,
            action: rule.action,
            weight: rule.weight
          });

          // Calculate weighted confidence
          totalConfidence += detection.confidence * rule.weight;

          // Determine highest severity action
          if (this.getActionSeverity(rule.action) > this.getActionSeverity(highestAction)) {
            highestAction = rule.action;
          }
        }
      }

      // Normalize confidence score (max 100)
      const normalizedConfidence = Math.min(totalConfidence, 100);
      const isSpam = detections.length > 0 && normalizedConfidence >= 50;

      return {
        isSpam,
        confidence: Math.round(normalizedConfidence * 100) / 100,
        detections,
        action: isSpam ? highestAction : 'allow'
      };

    } catch (error) {
      console.error('Content analysis error:', error);
      throw new Error(`Failed to analyze content: ${error.message}`);
    }
  }

  /**
   * Analyze URL for suspicious patterns
   * @param {string} url - URL to analyze
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeUrl(url) {
    try {
      if (!url || typeof url !== 'string') {
        return {
          isSpam: false,
          confidence: 0,
          detections: []
        };
      }

      // Get URL-specific spam rules
      const rules = await this.getSpamRules('url');
      const detections = [];
      let totalConfidence = 0;

      for (const rule of rules) {
        const detection = this.applyUrlRule(url, rule);
        if (detection.matched) {
          detections.push({
            ruleId: rule.id,
            ruleName: rule.name,
            confidence: detection.confidence,
            matchedContent: url,
            action: rule.action,
            weight: rule.weight
          });

          totalConfidence += detection.confidence * rule.weight;
        }
      }

      const normalizedConfidence = Math.min(totalConfidence, 100);
      const isSpam = detections.length > 0 && normalizedConfidence >= 50;

      return {
        isSpam,
        confidence: Math.round(normalizedConfidence * 100) / 100,
        detections
      };

    } catch (error) {
      console.error('URL analysis error:', error);
      throw error;
    }
  }

  /**
   * Check for duplicate submissions
   * @param {string} url - URL to check
   * @param {Object} [metadata] - Optional metadata for content similarity
   * @returns {Promise<Object>} Duplicate check result
   */
  async checkDuplicateSubmission(url, metadata = null) {
    try {
      // Check for exact URL duplicates
      const { data: urlDuplicates, error: urlError } = await supabase
        .from('submissions')
        .select('id, url')
        .eq('url', url)
        .limit(1);

      if (urlError) throw urlError;

      if (urlDuplicates && urlDuplicates.length > 0) {
        return {
          isDuplicate: true,
          type: 'url',
          existingSubmissionId: urlDuplicates[0].id,
          similarity: 1.0
        };
      }

      // Check for content similarity if metadata provided
      if (metadata && (metadata.title || metadata.description)) {
        const similarityResult = await this.checkContentSimilarity(metadata);
        if (similarityResult.isDuplicate) {
          return similarityResult;
        }
      }

      return {
        isDuplicate: false,
        type: null,
        similarity: 0
      };

    } catch (error) {
      console.error('Duplicate check error:', error);
      throw error;
    }
  }

  /**
   * Check content similarity against existing submissions
   * @param {Object} metadata - Content metadata
   * @returns {Promise<Object>} Similarity check result
   */
  async checkContentSimilarity(metadata) {
    try {
      const { data: submissions, error } = await supabase
        .from('submissions')
        .select('id, rewritten_meta, original_meta')
        .not('rewritten_meta', 'is', null)
        .limit(100); // Check against recent submissions

      if (error) throw error;

      let highestSimilarity = 0;
      let mostSimilarId = null;

      for (const submission of submissions) {
        const existingMeta = submission.rewritten_meta || submission.original_meta;
        if (!existingMeta) continue;

        const similarity = this.calculateTextSimilarity(
          `${metadata.title || ''} ${metadata.description || ''}`,
          `${existingMeta.title || ''} ${existingMeta.description || ''}`
        );

        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          mostSimilarId = submission.id;
        }
      }

      const isDuplicate = highestSimilarity > 0.85; // 85% similarity threshold

      return {
        isDuplicate,
        type: 'content',
        existingSubmissionId: mostSimilarId,
        similarity: Math.round(highestSimilarity * 1000) / 1000
      };

    } catch (error) {
      console.error('Content similarity check error:', error);
      throw error;
    }
  }

  /**
   * Analyze user behavior patterns for spam detection
   * @param {string} userId - User ID to analyze
   * @param {string} [behaviorType] - Type of behavior to analyze
   * @returns {Promise<Object>} Behavior analysis result
   */
  async analyzeBehaviorPattern(userId, behaviorType = 'submission') {
    try {
      const timeWindow = 10 * 60 * 1000; // 10 minutes
      const cutoffTime = new Date(Date.now() - timeWindow).toISOString();

      let tableName, rapidThreshold;
      
      switch (behaviorType) {
        case 'voting':
          tableName = 'votes';
          rapidThreshold = 10; // 10 votes in 10 minutes
          break;
        case 'commenting':
          tableName = 'comments';
          rapidThreshold = 5; // 5 comments in 10 minutes
          break;
        default:
          tableName = 'submissions';
          rapidThreshold = 3; // 3 submissions in 10 minutes
      }

      const { data: recentActivity, error } = await supabase
        .from(tableName)
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', cutoffTime)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const activityCount = recentActivity?.length || 0;
      const isRapid = activityCount >= rapidThreshold;

      if (!isRapid) {
        return {
          isSpam: false,
          confidence: 0,
          pattern: 'normal',
          activityCount
        };
      }

      // Calculate confidence based on how much it exceeds threshold
      const excessRatio = activityCount / rapidThreshold;
      const confidence = Math.min(75 + (excessRatio - 1) * 25, 100);

      return {
        isSpam: true,
        confidence: Math.round(confidence),
        pattern: `rapid_${behaviorType}`,
        activityCount,
        timeWindow: '10 minutes'
      };

    } catch (error) {
      console.error('Behavior analysis error:', error);
      throw error;
    }
  }

  /**
   * Apply content rule to text
   * @param {string} content - Content to check
   * @param {Object} rule - Spam detection rule
   * @returns {Object} Rule application result
   */
  applyContentRule(content, rule) {
    try {
      const regex = new RegExp(rule.pattern, 'g');
      const matches = content.match(regex);

      if (!matches) {
        return { matched: false, confidence: 0 };
      }

      // Calculate confidence based on match count and rule threshold
      const matchCount = matches.length;
      const baseConfidence = rule.threshold;
      const bonusConfidence = Math.min(matchCount * 5, 20); // Bonus for multiple matches
      const confidence = Math.min(baseConfidence + bonusConfidence, 100);

      return {
        matched: true,
        confidence,
        matchedContent: matches[0] // Return first match as example
      };

    } catch (error) {
      console.error('Error applying content rule:', error);
      return { matched: false, confidence: 0 };
    }
  }

  /**
   * Apply URL rule to URL
   * @param {string} url - URL to check
   * @param {Object} rule - Spam detection rule
   * @returns {Object} Rule application result
   */
  applyUrlRule(url, rule) {
    try {
      const regex = new RegExp(rule.pattern, 'i');
      const matches = url.match(regex);

      if (!matches) {
        return { matched: false, confidence: 0 };
      }

      return {
        matched: true,
        confidence: rule.threshold
      };

    } catch (error) {
      console.error('Error applying URL rule:', error);
      return { matched: false, confidence: 0 };
    }
  }

  /**
   * Calculate text similarity using simple algorithm
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Similarity score (0-1)
   */
  calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    // Normalize texts
    const normalize = (text) => text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const norm1 = normalize(text1);
    const norm2 = normalize(text2);

    if (norm1 === norm2) return 1;

    // Simple word-based similarity
    const words1 = new Set(norm1.split(/\s+/));
    const words2 = new Set(norm2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Get action severity level
   * @param {string} action - Action name
   * @returns {number} Severity level
   */
  getActionSeverity(action) {
    const severityMap = {
      'allow': 0,
      'flag': 1,
      'quarantine': 2,
      'block': 3
    };
    return severityMap[action] || 0;
  }

  /**
   * Record spam detection results
   * @param {string} submissionId - Submission ID
   * @param {Array} detections - Detection results
   * @returns {Promise<Object>} Recording result
   */
  async recordSpamDetection(submissionId, detections) {
    try {
      if (!detections || detections.length === 0) {
        return { success: true, recordedCount: 0 };
      }

      const records = detections.map(detection => ({
        submission_id: submissionId,
        rule_id: detection.ruleId,
        confidence_score: detection.confidence,
        matched_content: detection.matchedContent,
        action_taken: detection.action,
        detected_at: new Date().toISOString()
      }));

      const { data, error } = await supabase
        .from('spam_detections')
        .insert(records)
        .select();

      if (error) throw error;

      return {
        success: true,
        recordedCount: data?.length || 0
      };

    } catch (error) {
      console.error('Error recording spam detection:', error);
      throw new Error(`Failed to record spam detection: ${error.message}`);
    }
  }

  /**
   * Get spam detection rules
   * @param {string} [ruleType] - Filter by rule type
   * @returns {Promise<Array>} Spam detection rules
   */
  async getSpamRules(ruleType = null) {
    try {
      const cacheKey = `spam_rules_${ruleType || 'all'}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          return cached.data;
        }
      }

      let query = supabase
        .from('spam_detection_rules')
        .select('*')
        .eq('is_active', true)
        .order('weight', { ascending: false });

      if (ruleType) {
        query = query.eq('rule_type', ruleType);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Cache the results
      this.cache.set(cacheKey, {
        data: data || [],
        timestamp: Date.now()
      });

      return data || [];

    } catch (error) {
      console.error('Error fetching spam rules:', error);
      throw error;
    }
  }

  /**
   * Update spam detection rule
   * @param {string} ruleId - Rule ID
   * @param {Object} updates - Rule updates
   * @returns {Promise<Object>} Updated rule
   */
  async updateSpamRule(ruleId, updates) {
    try {
      // Validate updates
      this.validateRuleUpdates(updates);

      const { data, error } = await supabase
        .from('spam_detection_rules')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', ruleId)
        .select()
        .single();

      if (error) throw error;

      // Clear cache
      this.cache.clear();

      return data;

    } catch (error) {
      console.error('Error updating spam rule:', error);
      throw error;
    }
  }

  /**
   * Validate rule updates
   * @param {Object} updates - Updates to validate
   * @throws {Error} If validation fails
   */
  validateRuleUpdates(updates) {
    if (updates.threshold !== undefined) {
      if (updates.threshold < 0 || updates.threshold > 100) {
        throw new Error('Invalid threshold: must be between 0 and 100');
      }
    }

    if (updates.weight !== undefined) {
      if (updates.weight < 1) {
        throw new Error('Invalid weight: must be at least 1');
      }
    }

    if (updates.pattern !== undefined) {
      try {
        new RegExp(updates.pattern);
      } catch (error) {
        throw new Error(`Invalid regex pattern: ${error.message}`);
      }
    }
  }

  /**
   * Get spam detection statistics
   * @param {Object} [options] - Query options
   * @returns {Promise<Array>} Statistics
   */
  async getSpamStatistics(options = {}) {
    try {
      const timeframe = options.timeframe || '30 days';
      const cutoffTime = new Date(Date.now() - this.parseTimeframe(timeframe)).toISOString();

      const { data, error } = await supabase
        .from('spam_statistics')
        .select('*')
        .gte('detection_date', cutoffTime.split('T')[0])
        .order('detection_date', { ascending: false });

      if (error) throw error;

      return data || [];

    } catch (error) {
      console.error('Error fetching spam statistics:', error);
      throw error;
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
export const spamDetectionService = new SpamDetectionService();