/**
 * IP Protection Service
 * IP-based protection, geolocation restrictions, and VPN/proxy detection
 */

import { supabase } from '$lib/config/supabase.js';
import { isIP } from 'net';

/**
 * IP protection service for blacklisting, geolocation, and threat detection
 */
class IpProtectionService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 15 * 60 * 1000; // 15 minutes
    
    // External IP analysis services
    this.ipAnalysisServices = [
      {
        name: 'ipapi',
        url: 'http://ip-api.com/json/',
        fields: 'status,country,countryCode,region,city,isp,proxy,query',
        rateLimit: 45 // requests per minute
      },
      {
        name: 'ipinfo',
        url: 'https://ipinfo.io/',
        token: process.env.IPINFO_TOKEN,
        rateLimit: 50000 // requests per month
      }
    ];

    this.validReputations = ['trusted', 'neutral', 'suspicious', 'blocked'];
  }

  /**
   * Analyze IP address for threats and geolocation
   * @param {string} ipAddress - IP address to analyze
   * @param {boolean} [forceRefresh] - Force refresh from external APIs
   * @returns {Promise<Object>} IP analysis result
   */
  async analyzeIpAddress(ipAddress, forceRefresh = false) {
    try {
      if (!this.isValidIpAddress(ipAddress)) {
        throw new Error('Invalid IP address format');
      }

      // Check cache first
      if (!forceRefresh) {
        const cached = await this.getIpFromDatabase(ipAddress);
        if (cached && this.isCacheValid(cached.last_seen_at)) {
          return {
            ...cached,
            fromCache: true
          };
        }
      }

      // Analyze with external services
      const analysisResult = await this.performExternalAnalysis(ipAddress);
      
      // Calculate reputation and abuse score
      const reputation = this.calculateReputation(analysisResult);
      const abuseScore = this.calculateAbuseScore(analysisResult);

      // Store/update in database
      const ipData = await this.upsertIpData(ipAddress, {
        country_code: analysisResult.countryCode,
        is_vpn: analysisResult.vpn || false,
        is_proxy: analysisResult.proxy || false,
        is_tor: analysisResult.tor || false,
        reputation,
        abuse_score: abuseScore,
        last_seen_at: new Date().toISOString(),
        request_count: 1
      });

      return {
        ipAddress,
        countryCode: analysisResult.countryCode,
        country: analysisResult.country,
        region: analysisResult.region,
        city: analysisResult.city,
        isp: analysisResult.isp,
        isVpn: analysisResult.vpn || false,
        isProxy: analysisResult.proxy || false,
        isTor: analysisResult.tor || false,
        reputation,
        abuseScore,
        fromCache: false,
        ...ipData
      };

    } catch (error) {
      console.error('IP analysis error:', error);
      
      // Return safe defaults on error
      return {
        ipAddress,
        reputation: 'neutral',
        abuseScore: 0,
        error: `Failed to analyze IP: ${error.message}`,
        fromCache: false
      };
    }
  }

  /**
   * Check if IP is blacklisted
   * @param {string} ipAddress - IP address to check
   * @returns {Promise<Object>} Blacklist check result
   */
  async checkIpBlacklist(ipAddress) {
    try {
      const ipData = await this.getIpFromDatabase(ipAddress);

      if (!ipData) {
        return {
          isBlocked: false,
          reason: 'IP not in database',
          severity: 'none'
        };
      }

      if (ipData.reputation === 'blocked') {
        return {
          isBlocked: true,
          reason: 'IP is blacklisted',
          severity: 'high',
          abuseScore: ipData.abuse_score,
          notes: ipData.notes
        };
      }

      if (ipData.reputation === 'trusted') {
        return {
          isBlocked: false,
          reason: 'IP is trusted/whitelisted',
          severity: 'none'
        };
      }

      if (ipData.abuse_score > 80) {
        return {
          isBlocked: true,
          reason: 'High abuse score detected',
          severity: 'high',
          abuseScore: ipData.abuse_score
        };
      }

      return {
        isBlocked: false,
        reason: 'IP reputation is acceptable',
        severity: 'none',
        reputation: ipData.reputation,
        abuseScore: ipData.abuse_score
      };

    } catch (error) {
      console.error('Blacklist check error:', error);
      // Default to not blocked on error to avoid false positives
      return {
        isBlocked: false,
        reason: 'Error checking blacklist - defaulting to allow',
        severity: 'none',
        error: error.message
      };
    }
  }

  /**
   * Check geolocation restrictions
   * @param {string} ipAddress - IP address to check
   * @param {Array} restrictedCountries - Array of restricted country codes
   * @returns {Promise<Object>} Geolocation check result
   */
  async checkGeolocationRestrictions(ipAddress, restrictedCountries = []) {
    try {
      if (!restrictedCountries || restrictedCountries.length === 0) {
        return {
          isRestricted: false,
          reason: 'No geolocation restrictions configured'
        };
      }

      const ipData = await this.getIpFromDatabase(ipAddress);
      
      if (!ipData || !ipData.country_code) {
        // If we don't have country data, analyze the IP
        const analysis = await this.analyzeIpAddress(ipAddress);
        
        if (!analysis.countryCode) {
          return {
            isRestricted: false,
            reason: 'Unable to determine IP location',
            countryCode: null
          };
        }

        if (restrictedCountries.includes(analysis.countryCode)) {
          return {
            isRestricted: true,
            reason: `Access restricted from country: ${analysis.countryCode}`,
            countryCode: analysis.countryCode,
            country: analysis.country
          };
        }

        return {
          isRestricted: false,
          reason: 'Country is permitted',
          countryCode: analysis.countryCode,
          country: analysis.country
        };
      }

      if (restrictedCountries.includes(ipData.country_code)) {
        return {
          isRestricted: true,
          reason: `Access restricted from country: ${ipData.country_code}`,
          countryCode: ipData.country_code
        };
      }

      return {
        isRestricted: false,
        reason: 'Country is permitted',
        countryCode: ipData.country_code
      };

    } catch (error) {
      console.error('Geolocation check error:', error);
      return {
        isRestricted: false,
        reason: 'Error checking geolocation - defaulting to allow',
        error: error.message
      };
    }
  }

  /**
   * Update IP reputation and abuse score
   * @param {string} ipAddress - IP address to update
   * @param {Object} updates - Updates to apply
   * @returns {Promise<Object>} Update result
   */
  async updateIpReputation(ipAddress, updates) {
    try {
      // Validate updates
      this.validateIpUpdates(updates);

      const { data, error } = await supabase
        .from('ip_addresses')
        .upsert({
          ip_address: ipAddress,
          ...updates,
          last_seen_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Clear cache for this IP
      this.cache.delete(ipAddress);

      return data;

    } catch (error) {
      console.error('IP reputation update error:', error);
      throw new Error(`Failed to update IP reputation: ${error.message}`);
    }
  }

  /**
   * Add IP to blacklist
   * @param {string} ipAddress - IP address to blacklist
   * @param {string} reason - Reason for blacklisting
   * @returns {Promise<Object>} Blacklist result
   */
  async addToBlacklist(ipAddress, reason) {
    try {
      const updates = {
        reputation: 'blocked',
        abuse_score: 100,
        notes: reason
      };

      const result = await this.updateIpReputation(ipAddress, updates);

      return {
        success: true,
        ipAddress,
        reputation: result.reputation,
        message: result.reputation === 'blocked' ? 
          'IP successfully blacklisted' : 
          'IP was already blacklisted'
      };

    } catch (error) {
      console.error('Blacklist addition error:', error);
      throw error;
    }
  }

  /**
   * Remove IP from blacklist
   * @param {string} ipAddress - IP address to unblock
   * @returns {Promise<Object>} Unblock result
   */
  async removeFromBlacklist(ipAddress) {
    try {
      // Check if IP exists in database
      const existing = await this.getIpFromDatabase(ipAddress);
      
      if (!existing) {
        return {
          success: false,
          message: 'IP address not found in database'
        };
      }

      const updates = {
        reputation: 'neutral',
        abuse_score: 0,
        notes: 'Removed from blacklist'
      };

      const result = await this.updateIpReputation(ipAddress, updates);

      return {
        success: true,
        ipAddress,
        reputation: result.reputation,
        message: 'IP successfully removed from blacklist'
      };

    } catch (error) {
      console.error('Blacklist removal error:', error);
      throw error;
    }
  }

  /**
   * Get IP protection statistics
   * @param {Object} [options] - Query options
   * @returns {Promise<Object>} Statistics
   */
  async getIpStatistics(options = {}) {
    try {
      // Get reputation distribution
      const { data: reputationStats, error: repError } = await supabase
        .from('ip_addresses')
        .select('reputation')
        .then(result => {
          if (result.error) throw result.error;
          
          const stats = result.data.reduce((acc, ip) => {
            acc[ip.reputation] = (acc[ip.reputation] || 0) + 1;
            return acc;
          }, {});

          return { data: Object.entries(stats).map(([reputation, count]) => ({ reputation, count })), error: null };
        });

      if (repError) throw repError;

      // Get VPN/Proxy statistics
      const { data: vpnStats, error: vpnError } = await supabase
        .from('ip_addresses')
        .select('is_vpn, is_proxy, is_tor')
        .then(result => {
          if (result.error) throw result.error;
          
          const stats = result.data.reduce((acc, ip) => {
            if (ip.is_vpn) acc.vpn++;
            if (ip.is_proxy) acc.proxy++;
            if (ip.is_tor) acc.tor++;
            return acc;
          }, { vpn: 0, proxy: 0, tor: 0 });

          return { data: [
            { is_vpn: true, count: stats.vpn },
            { is_proxy: true, count: stats.proxy },
            { is_tor: true, count: stats.tor }
          ], error: null };
        });

      if (vpnError) throw vpnError;

      const totalIps = reputationStats.reduce((sum, stat) => sum + stat.count, 0);
      const trustedIps = reputationStats.find(s => s.reputation === 'trusted')?.count || 0;
      const blockedIps = reputationStats.find(s => s.reputation === 'blocked')?.count || 0;
      const suspiciousIps = reputationStats.find(s => s.reputation === 'suspicious')?.count || 0;

      const vpnCount = vpnStats.find(s => s.is_vpn)?.count || 0;
      const proxyCount = vpnStats.find(s => s.is_proxy)?.count || 0;
      const torCount = vpnStats.find(s => s.is_tor)?.count || 0;

      return {
        totalIps,
        trustedIps,
        blockedIps,
        suspiciousIps,
        neutralIps: totalIps - trustedIps - blockedIps - suspiciousIps,
        vpnCount,
        proxyCount,
        torCount,
        reputationDistribution: reputationStats
      };

    } catch (error) {
      console.error('IP statistics error:', error);
      throw error;
    }
  }

  /**
   * Bulk update IP reputations
   * @param {Array} updates - Array of IP updates
   * @returns {Promise<Object>} Bulk update result
   */
  async bulkUpdateIpReputations(updates) {
    try {
      // Validate all updates first
      for (const update of updates) {
        if (!this.isValidIpAddress(update.ip_address)) {
          throw new Error(`Invalid IP address: ${update.ip_address}`);
        }
        this.validateIpUpdates(update);
      }

      const { data, error } = await supabase
        .from('ip_addresses')
        .upsert(updates.map(update => ({
          ...update,
          last_seen_at: new Date().toISOString()
        })))
        .select();

      if (error) throw error;

      // Clear cache for updated IPs
      updates.forEach(update => this.cache.delete(update.ip_address));

      return {
        success: true,
        updatedCount: data?.length || 0,
        updates: data
      };

    } catch (error) {
      console.error('Bulk IP update error:', error);
      throw error;
    }
  }

  /**
   * Get top abusive IP addresses
   * @param {number} [limit] - Number of results to return
   * @returns {Promise<Array>} Top abusive IPs
   */
  async getTopAbusiveIps(limit = 10) {
    try {
      const { data, error } = await supabase
        .from('ip_addresses')
        .select('*')
        .gte('abuse_score', 50)
        .order('abuse_score', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];

    } catch (error) {
      console.error('Top abusive IPs error:', error);
      throw error;
    }
  }

  /**
   * Perform external IP analysis
   * @param {string} ipAddress - IP address to analyze
   * @returns {Promise<Object>} Analysis result
   */
  async performExternalAnalysis(ipAddress) {
    try {
      // Try ip-api.com first (free service)
      const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,country,countryCode,region,city,isp,proxy,query`, {
        timeout: 5000
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'fail') {
        throw new Error(`IP analysis failed: ${data.message}`);
      }

      return {
        country: data.country,
        countryCode: data.countryCode,
        region: data.region,
        city: data.city,
        isp: data.isp,
        proxy: data.proxy || false,
        vpn: this.detectVpnFromIsp(data.isp),
        tor: this.detectTorFromIsp(data.isp)
      };

    } catch (error) {
      console.error('External IP analysis error:', error);
      
      // Return minimal data on failure
      return {
        country: 'Unknown',
        countryCode: null,
        region: null,
        city: null,
        isp: null,
        proxy: false,
        vpn: false,
        tor: false
      };
    }
  }

  /**
   * Detect VPN from ISP name
   * @param {string} isp - ISP name
   * @returns {boolean} True if likely VPN
   */
  detectVpnFromIsp(isp) {
    if (!isp) return false;
    
    const vpnKeywords = [
      'vpn', 'virtual private', 'proxy', 'tunnel', 'anonymous',
      'nordvpn', 'expressvpn', 'surfshark', 'cyberghost', 'purevpn',
      'private internet access', 'pia', 'mullvad', 'protonvpn'
    ];

    const ispLower = isp.toLowerCase();
    return vpnKeywords.some(keyword => ispLower.includes(keyword));
  }

  /**
   * Detect Tor from ISP name
   * @param {string} isp - ISP name
   * @returns {boolean} True if likely Tor
   */
  detectTorFromIsp(isp) {
    if (!isp) return false;
    
    const torKeywords = ['tor', 'onion', 'exit node', 'relay'];
    const ispLower = isp.toLowerCase();
    return torKeywords.some(keyword => ispLower.includes(keyword));
  }

  /**
   * Calculate IP reputation based on analysis
   * @param {Object} analysis - IP analysis data
   * @returns {string} Reputation level
   */
  calculateReputation(analysis) {
    if (analysis.tor) return 'blocked';
    if (analysis.vpn || analysis.proxy) return 'suspicious';
    
    // Known good ISPs get trusted status
    const trustedIsps = ['google', 'cloudflare', 'amazon', 'microsoft'];
    if (analysis.isp && trustedIsps.some(trusted => 
      analysis.isp.toLowerCase().includes(trusted))) {
      return 'trusted';
    }

    return 'neutral';
  }

  /**
   * Calculate abuse score based on analysis
   * @param {Object} analysis - IP analysis data
   * @returns {number} Abuse score (0-100)
   */
  calculateAbuseScore(analysis) {
    let score = 0;

    if (analysis.tor) score += 90;
    else if (analysis.vpn) score += 40;
    else if (analysis.proxy) score += 30;

    // Unknown location is suspicious
    if (!analysis.countryCode) score += 20;

    return Math.min(score, 100);
  }

  /**
   * Get IP data from database
   * @param {string} ipAddress - IP address
   * @returns {Promise<Object|null>} IP data
   */
  async getIpFromDatabase(ipAddress) {
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
      console.error('Database IP lookup error:', error);
      return null;
    }
  }

  /**
   * Upsert IP data in database
   * @param {string} ipAddress - IP address
   * @param {Object} data - IP data to store
   * @returns {Promise<Object>} Stored data
   */
  async upsertIpData(ipAddress, data) {
    try {
      const { data: result, error } = await supabase
        .from('ip_addresses')
        .upsert({
          ip_address: ipAddress,
          ...data
        })
        .select()
        .single();

      if (error) throw error;

      return result;
    } catch (error) {
      console.error('IP data upsert error:', error);
      throw error;
    }
  }

  /**
   * Check if cache is still valid
   * @param {string} lastSeenAt - Last seen timestamp
   * @returns {boolean} True if cache is valid
   */
  isCacheValid(lastSeenAt) {
    const lastSeen = new Date(lastSeenAt);
    const now = new Date();
    return (now - lastSeen) < this.cacheTimeout;
  }

  /**
   * Validate IP address format
   * @param {string} ipAddress - IP address to validate
   * @returns {boolean} True if valid
   */
  isValidIpAddress(ipAddress) {
    return isIP(ipAddress) !== 0;
  }

  /**
   * Validate IP update data
   * @param {Object} updates - Updates to validate
   * @throws {Error} If validation fails
   */
  validateIpUpdates(updates) {
    if (updates.reputation && !this.validReputations.includes(updates.reputation)) {
      throw new Error(`Invalid reputation: ${updates.reputation}. Must be one of: ${this.validReputations.join(', ')}`);
    }

    if (updates.abuse_score !== undefined) {
      if (updates.abuse_score < 0 || updates.abuse_score > 100) {
        throw new Error('Invalid abuse score: must be between 0 and 100');
      }
    }
  }
}

// Export singleton instance
export const ipProtectionService = new IpProtectionService();