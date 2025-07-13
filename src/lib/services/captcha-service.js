/**
 * CAPTCHA Service
 * Integration with multiple CAPTCHA providers (reCAPTCHA, hCaptcha, Turnstile)
 */

import { supabase } from '$lib/config/supabase.js';
import { randomBytes } from 'crypto';

/**
 * CAPTCHA service for challenge generation and verification
 */
class CaptchaService {
  constructor() {
    this.config = {
      recaptcha: {
        enabled: process.env.RECAPTCHA_ENABLED === 'true',
        siteKey: process.env.RECAPTCHA_SITE_KEY,
        secretKey: process.env.RECAPTCHA_SECRET_KEY,
        threshold: parseFloat(process.env.RECAPTCHA_THRESHOLD || '0.5'),
        verifyUrl: 'https://www.google.com/recaptcha/api/siteverify'
      },
      hcaptcha: {
        enabled: process.env.HCAPTCHA_ENABLED === 'true',
        siteKey: process.env.HCAPTCHA_SITE_KEY,
        secretKey: process.env.HCAPTCHA_SECRET_KEY,
        verifyUrl: 'https://hcaptcha.com/siteverify'
      },
      turnstile: {
        enabled: process.env.TURNSTILE_ENABLED === 'true',
        siteKey: process.env.TURNSTILE_SITE_KEY,
        secretKey: process.env.TURNSTILE_SECRET_KEY,
        verifyUrl: 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
      }
    };

    this.challengeExpiration = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Generate a CAPTCHA challenge
   * @param {Object} challengeData - Challenge data
   * @returns {Promise<Object>} Challenge result
   */
  async generateChallenge(challengeData) {
    try {
      const { ip_address, user_id, action_type } = challengeData;

      if (!ip_address || !action_type) {
        throw new Error('IP address and action type are required');
      }

      // Generate unique challenge token
      const challengeToken = this.generateChallengeToken();
      
      // Determine CAPTCHA type based on configuration and action
      const challengeType = this.selectCaptchaType(action_type);
      
      // Set expiration time
      const expiresAt = new Date(Date.now() + this.challengeExpiration);

      // Store challenge in database
      const { data, error } = await supabase
        .from('captcha_challenges')
        .insert({
          challenge_token: challengeToken,
          ip_address,
          user_id: user_id || null,
          challenge_type: challengeType,
          action_type,
          expires_at: expiresAt.toISOString(),
          is_solved: false
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        success: true,
        challengeToken,
        challengeType,
        actionType: action_type,
        expiresAt,
        siteKey: this.config[challengeType].siteKey
      };

    } catch (error) {
      console.error('CAPTCHA challenge generation error:', error);
      throw new Error(`Failed to generate CAPTCHA challenge: ${error.message}`);
    }
  }

  /**
   * Verify a CAPTCHA challenge response
   * @param {string} challengeToken - Challenge token
   * @param {string} captchaResponse - CAPTCHA response from client
   * @param {string} [ipAddress] - Client IP address
   * @returns {Promise<Object>} Verification result
   */
  async verifyChallenge(challengeToken, captchaResponse, ipAddress = null) {
    try {
      if (!challengeToken || !captchaResponse) {
        return {
          success: false,
          error: 'Challenge token and CAPTCHA response are required'
        };
      }

      // Get challenge from database
      const { data: challenge, error: fetchError } = await supabase
        .from('captcha_challenges')
        .select('*')
        .eq('challenge_token', challengeToken)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (!challenge) {
        return {
          success: false,
          error: 'Challenge not found or invalid'
        };
      }

      // Check if challenge has expired
      if (new Date(challenge.expires_at) < new Date()) {
        return {
          success: false,
          error: 'Challenge has expired'
        };
      }

      // Check if challenge has already been solved
      if (challenge.is_solved) {
        return {
          success: false,
          error: 'Challenge has already been solved'
        };
      }

      // Verify CAPTCHA response with provider
      const verificationResult = await this.verifyCaptchaResponse(
        challenge.challenge_type,
        captchaResponse,
        ipAddress || challenge.ip_address
      );

      if (!verificationResult.success) {
        return {
          success: false,
          error: `CAPTCHA verification failed: ${verificationResult.error}`,
          challengeType: challenge.challenge_type
        };
      }

      // Mark challenge as solved
      await this.markChallengeSolved(challenge.id, verificationResult);

      return {
        success: true,
        challengeType: challenge.challenge_type,
        actionType: challenge.action_type,
        score: verificationResult.score,
        verifiedAt: new Date()
      };

    } catch (error) {
      console.error('CAPTCHA verification error:', error);
      throw new Error(`Failed to verify CAPTCHA: ${error.message}`);
    }
  }

  /**
   * Check if CAPTCHA is required for an action
   * @param {string} ipAddress - Client IP address
   * @param {string} actionType - Type of action
   * @param {string} [userId] - User ID if authenticated
   * @returns {Promise<Object>} Requirement check result
   */
  async requiresCaptcha(ipAddress, actionType, userId = null) {
    try {
      // Check IP reputation
      const ipInfo = await this.getIpInfo(ipAddress);
      
      // High abuse score always requires CAPTCHA
      if (ipInfo && ipInfo.abuse_score > 70) {
        return {
          required: true,
          reason: 'High abuse score detected',
          severity: 'high'
        };
      }

      // Blocked or suspicious IPs require CAPTCHA
      if (ipInfo && ['blocked', 'suspicious'].includes(ipInfo.reputation)) {
        return {
          required: true,
          reason: 'Suspicious IP reputation',
          severity: 'high'
        };
      }

      // Check for rapid activity patterns
      const rapidActivity = await this.checkRapidActivity(ipAddress, userId, actionType);
      if (rapidActivity.isRapid) {
        return {
          required: true,
          reason: `Rapid ${actionType}s detected`,
          severity: 'medium'
        };
      }

      // Sensitive actions for anonymous users
      const sensitiveActions = ['registration', 'password_reset', 'contact'];
      if (!userId && sensitiveActions.includes(actionType)) {
        return {
          required: true,
          reason: `Anonymous ${actionType} requires verification`,
          severity: 'low'
        };
      }

      // Trusted users and IPs don't need CAPTCHA
      if (ipInfo && ipInfo.reputation === 'trusted') {
        return {
          required: false,
          reason: 'Trusted IP address'
        };
      }

      return {
        required: false,
        reason: 'Normal activity pattern'
      };

    } catch (error) {
      console.error('CAPTCHA requirement check error:', error);
      // Default to requiring CAPTCHA on error for security
      return {
        required: true,
        reason: 'Error checking requirements - defaulting to secure',
        severity: 'medium'
      };
    }
  }

  /**
   * Generate a unique challenge token
   * @returns {string} Challenge token
   */
  generateChallengeToken() {
    return randomBytes(32).toString('hex');
  }

  /**
   * Select appropriate CAPTCHA type based on action and configuration
   * @param {string} actionType - Type of action
   * @returns {string} CAPTCHA type
   */
  selectCaptchaType(actionType) {
    // Priority order: reCAPTCHA > hCaptcha > Turnstile
    if (this.config.recaptcha.enabled) {
      return 'recaptcha';
    }
    
    if (this.config.hcaptcha.enabled) {
      return 'hcaptcha';
    }
    
    if (this.config.turnstile.enabled) {
      return 'turnstile';
    }

    throw new Error('No CAPTCHA provider is enabled');
  }

  /**
   * Verify CAPTCHA response with the appropriate provider
   * @param {string} challengeType - CAPTCHA provider type
   * @param {string} response - CAPTCHA response
   * @param {string} ipAddress - Client IP address
   * @returns {Promise<Object>} Verification result
   */
  async verifyCaptchaResponse(challengeType, response, ipAddress) {
    try {
      const config = this.config[challengeType];
      if (!config || !config.enabled) {
        throw new Error(`CAPTCHA provider ${challengeType} is not enabled`);
      }

      const verifyData = new URLSearchParams({
        secret: config.secretKey,
        response,
        remoteip: ipAddress
      });

      const verifyResponse = await fetch(config.verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: verifyData
      });

      if (!verifyResponse.ok) {
        throw new Error(`HTTP error: ${verifyResponse.status}`);
      }

      const result = await verifyResponse.json();

      if (challengeType === 'recaptcha') {
        return this.processRecaptchaResult(result);
      } else if (challengeType === 'hcaptcha') {
        return this.processHcaptchaResult(result);
      } else if (challengeType === 'turnstile') {
        return this.processTurnstileResult(result);
      }

      throw new Error(`Unknown CAPTCHA type: ${challengeType}`);

    } catch (error) {
      console.error(`${challengeType} verification error:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process reCAPTCHA verification result
   * @param {Object} result - reCAPTCHA API result
   * @returns {Object} Processed result
   */
  processRecaptchaResult(result) {
    if (!result.success) {
      return {
        success: false,
        error: `reCAPTCHA failed: ${result['error-codes']?.join(', ') || 'Unknown error'}`
      };
    }

    // Check score threshold for v3
    if (result.score !== undefined && result.score < this.config.recaptcha.threshold) {
      return {
        success: false,
        error: `Score too low: ${result.score} < ${this.config.recaptcha.threshold}`
      };
    }

    return {
      success: true,
      score: result.score,
      action: result.action,
      hostname: result.hostname
    };
  }

  /**
   * Process hCaptcha verification result
   * @param {Object} result - hCaptcha API result
   * @returns {Object} Processed result
   */
  processHcaptchaResult(result) {
    if (!result.success) {
      return {
        success: false,
        error: `hCaptcha failed: ${result['error-codes']?.join(', ') || 'Unknown error'}`
      };
    }

    return {
      success: true,
      hostname: result.hostname
    };
  }

  /**
   * Process Turnstile verification result
   * @param {Object} result - Turnstile API result
   * @returns {Object} Processed result
   */
  processTurnstileResult(result) {
    if (!result.success) {
      return {
        success: false,
        error: `Turnstile failed: ${result['error-codes']?.join(', ') || 'Unknown error'}`
      };
    }

    return {
      success: true,
      hostname: result.hostname,
      action: result.action
    };
  }

  /**
   * Mark challenge as solved in database
   * @param {string} challengeId - Challenge ID
   * @param {Object} verificationResult - Verification result data
   * @returns {Promise<void>}
   */
  async markChallengeSolved(challengeId, verificationResult) {
    try {
      const { error } = await supabase
        .from('captcha_challenges')
        .update({
          is_solved: true,
          solution_data: verificationResult,
          solved_at: new Date().toISOString()
        })
        .eq('id', challengeId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error marking challenge as solved:', error);
      throw error;
    }
  }

  /**
   * Get IP information from database
   * @param {string} ipAddress - IP address
   * @returns {Promise<Object|null>} IP information
   */
  async getIpInfo(ipAddress) {
    try {
      const { data, error } = await supabase
        .from('ip_addresses')
        .select('*')
        .eq('ip_address', ipAddress)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching IP info:', error);
      return null;
    }
  }

  /**
   * Check for rapid activity patterns
   * @param {string} ipAddress - IP address
   * @param {string} userId - User ID
   * @param {string} actionType - Action type
   * @returns {Promise<Object>} Rapid activity check result
   */
  async checkRapidActivity(ipAddress, userId, actionType) {
    try {
      const timeWindow = 10 * 60 * 1000; // 10 minutes
      const cutoffTime = new Date(Date.now() - timeWindow).toISOString();

      let tableName, thresholds;
      
      switch (actionType) {
        case 'submission':
          tableName = 'submissions';
          thresholds = { ip: 3, user: 5 };
          break;
        case 'voting':
          tableName = 'votes';
          thresholds = { ip: 20, user: 30 };
          break;
        case 'commenting':
          tableName = 'comments';
          thresholds = { ip: 10, user: 15 };
          break;
        default:
          return { isRapid: false };
      }

      // Check IP-based activity
      const { data: ipActivity, error: ipError } = await supabase
        .from(tableName)
        .select('created_at', { count: 'exact' })
        .gte('created_at', cutoffTime);

      if (ipError) throw ipError;

      const ipCount = ipActivity?.length || 0;
      if (ipCount >= thresholds.ip) {
        return {
          isRapid: true,
          type: 'ip',
          count: ipCount,
          threshold: thresholds.ip
        };
      }

      // Check user-based activity if user is provided
      if (userId) {
        const { data: userActivity, error: userError } = await supabase
          .from(tableName)
          .select('created_at', { count: 'exact' })
          .eq('user_id', userId)
          .gte('created_at', cutoffTime);

        if (userError) throw userError;

        const userCount = userActivity?.length || 0;
        if (userCount >= thresholds.user) {
          return {
            isRapid: true,
            type: 'user',
            count: userCount,
            threshold: thresholds.user
          };
        }
      }

      return { isRapid: false };

    } catch (error) {
      console.error('Error checking rapid activity:', error);
      return { isRapid: false };
    }
  }

  /**
   * Clean up expired CAPTCHA challenges
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupExpiredChallenges() {
    try {
      const { data, error } = await supabase
        .from('captcha_challenges')
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (error) {
        throw error;
      }

      return {
        deletedCount: data?.length || 0
      };

    } catch (error) {
      console.error('Error cleaning up expired challenges:', error);
      throw new Error(`Failed to cleanup expired challenges: ${error.message}`);
    }
  }

  /**
   * Get CAPTCHA usage statistics
   * @param {Object} [options] - Query options
   * @returns {Promise<Object>} Statistics
   */
  async getCaptchaStats(options = {}) {
    try {
      const timeframe = options.timeframe || '24 hours';
      const cutoffTime = new Date(Date.now() - this.parseTimeframe(timeframe)).toISOString();

      // Get total challenges
      const { data: totalData, error: totalError } = await supabase
        .from('captcha_challenges')
        .select('*', { count: 'exact' })
        .gte('created_at', cutoffTime);

      if (totalError) throw totalError;

      // Get solved challenges
      const { data: solvedData, error: solvedError } = await supabase
        .from('captcha_challenges')
        .select('*', { count: 'exact' })
        .eq('is_solved', true)
        .gte('created_at', cutoffTime);

      if (solvedError) throw solvedError;

      // Get failed challenges (expired without solving)
      const { data: failedData, error: failedError } = await supabase
        .from('captcha_challenges')
        .select('*', { count: 'exact' })
        .eq('is_solved', false)
        .lt('expires_at', new Date().toISOString())
        .gte('created_at', cutoffTime);

      if (failedError) throw failedError;

      const totalChallenges = totalData?.length || 0;
      const solvedChallenges = solvedData?.length || 0;
      const failedChallenges = failedData?.length || 0;

      return {
        totalChallenges,
        solvedChallenges,
        failedChallenges,
        successRate: totalChallenges > 0 ? Math.round((solvedChallenges / totalChallenges) * 100) : 0,
        timeframe
      };

    } catch (error) {
      console.error('Error fetching CAPTCHA stats:', error);
      throw error;
    }
  }

  /**
   * Update CAPTCHA configuration
   * @param {Object} config - Configuration updates
   * @returns {Promise<Object>} Update result
   */
  async updateCaptchaConfig(config) {
    try {
      // Validate configuration
      this.validateConfig(config);

      // Update internal configuration
      Object.keys(config).forEach(key => {
        if (key.startsWith('recaptcha_')) {
          const configKey = key.replace('recaptcha_', '');
          if (configKey in this.config.recaptcha) {
            this.config.recaptcha[configKey] = config[key];
          }
        } else if (key.startsWith('hcaptcha_')) {
          const configKey = key.replace('hcaptcha_', '');
          if (configKey in this.config.hcaptcha) {
            this.config.hcaptcha[configKey] = config[key];
          }
        } else if (key.startsWith('turnstile_')) {
          const configKey = key.replace('turnstile_', '');
          if (configKey in this.config.turnstile) {
            this.config.turnstile[configKey] = config[key];
          }
        }
      });

      return {
        success: true,
        config: this.config
      };

    } catch (error) {
      console.error('Error updating CAPTCHA config:', error);
      throw error;
    }
  }

  /**
   * Validate CAPTCHA configuration
   * @param {Object} config - Configuration to validate
   * @throws {Error} If validation fails
   */
  validateConfig(config) {
    if (config.recaptcha_threshold !== undefined) {
      if (config.recaptcha_threshold < 0 || config.recaptcha_threshold > 1) {
        throw new Error('Invalid threshold: must be between 0 and 1');
      }
    }
  }

  /**
   * Parse timeframe string to milliseconds
   * @param {string} timeframe - Timeframe string
   * @returns {number} Milliseconds
   */
  parseTimeframe(timeframe) {
    const units = {
      hour: 60 * 60 * 1000,
      hours: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000
    };

    const match = timeframe.match(/^(\d+)\s+(hour|hours|day|days)$/);
    if (!match) {
      return 24 * 60 * 60 * 1000; // Default to 24 hours
    }

    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }
}

// Export singleton instance
export const captchaService = new CaptchaService();