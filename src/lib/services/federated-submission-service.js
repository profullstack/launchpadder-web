/**
 * Federated Submission Service
 * 
 * Handles submission to multiple directories across the federation network.
 * Manages payment processing, status tracking, and retry mechanisms for
 * cross-platform submissions.
 */

/**
 * FederatedSubmissionService class for managing federated submissions
 */
export class FederatedSubmissionService {
  constructor(supabaseClient, federationDiscoveryService, paymentService) {
    if (!supabaseClient) {
      throw new Error('Supabase client is required');
    }
    
    if (!federationDiscoveryService) {
      throw new Error('Federation discovery service is required');
    }
    
    this.supabase = supabaseClient;
    this.federationDiscovery = federationDiscoveryService;
    this.paymentService = paymentService;
    
    // Timeout for external API calls (30 seconds)
    this.requestTimeout = 30000;
  }

  /**
   * Discover available directories from federation network
   * @param {Object} options - Discovery options
   * @param {string} options.category - Filter by directory category
   * @param {number} options.limit - Limit number of results
   * @returns {Promise<Array>} Array of available directories
   */
  async discoverAvailableDirectories(options = {}) {
    try {
      const directories = await this.federationDiscovery.discoverDirectories(options);
      return directories;
    } catch (error) {
      console.error('Error discovering directories:', error);
      throw new Error(`Failed to discover directories: ${error.message}`);
    }
  }

  /**
   * Calculate total submission cost for selected directories
   * @param {Array} selectedDirectories - Array of directory objects
   * @returns {Promise<Object>} Cost breakdown
   */
  async calculateSubmissionCost(selectedDirectories) {
    if (!selectedDirectories || selectedDirectories.length === 0) {
      throw new Error('At least one directory must be selected');
    }

    const breakdown = selectedDirectories.map(directory => ({
      directory_id: directory.id,
      cost_usd: directory.submission_fee?.usd || 0
    }));

    const totalUsd = breakdown.reduce((sum, item) => sum + item.cost_usd, 0);

    return {
      total_usd: totalUsd,
      breakdown,
      currency: 'USD'
    };
  }

  /**
   * Create a new federated submission
   * @param {Object} submissionData - Submission data
   * @param {Array} selectedDirectories - Selected directories for submission
   * @returns {Promise<Object>} Creation result
   */
  async createFederatedSubmission(submissionData, selectedDirectories) {
    // Validate submission data
    this.validateSubmissionData(submissionData);

    if (!selectedDirectories || selectedDirectories.length === 0) {
      throw new Error('At least one directory must be selected');
    }

    try {
      // Calculate total cost
      const costBreakdown = await this.calculateSubmissionCost(selectedDirectories);
      const requiresPayment = costBreakdown.total_usd > 0;

      // Create submission record
      const submissionRecord = {
        ...submissionData,
        status: requiresPayment ? 'pending_payment' : 'pending_submission',
        federation_enabled: true,
        total_cost_usd: costBreakdown.total_usd,
        selected_directories: selectedDirectories.map(d => d.id),
        created_at: new Date().toISOString()
      };

      // Insert submission into database
      const result = await this.supabase
        .from('submissions')
        .insert([submissionRecord])
        .select();

      const { data, error } = result || {};

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      const submission = data?.[0];
      if (!submission) {
        throw new Error('Failed to create submission');
      }

      // Create payment session if required
      let paymentSession = null;
      if (requiresPayment && this.paymentService) {
        paymentSession = await this.paymentService.createPaymentSession({
          submission_id: submission.id,
          amount_usd: costBreakdown.total_usd,
          description: `Federated submission to ${selectedDirectories.length} directories`,
          metadata: {
            directories: selectedDirectories.map(d => d.id),
            submission_url: submissionData.url
          }
        });
      }

      // Store federation directory mappings
      await this._storeFederationMappings(submission.id, selectedDirectories);

      // If no payment required, start submission process
      if (!requiresPayment) {
        // Start async submission process
        this._processSubmissionAsync(submission.id, submissionData, selectedDirectories);
      }

      return {
        success: true,
        submission,
        payment_session: paymentSession,
        cost_breakdown: costBreakdown,
        requires_payment: requiresPayment
      };
    } catch (error) {
      console.error('Error creating federated submission:', error);
      throw error;
    }
  }

  /**
   * Submit to federated directories
   * @param {string} submissionId - Local submission ID
   * @param {Object} submissionData - Submission data
   * @param {Array} directories - Target directories
   * @returns {Promise<Array>} Array of submission results
   */
  async submitToFederatedDirectories(submissionId, submissionData, directories) {
    const results = [];

    // Submit to each directory in parallel
    const submissionPromises = directories.map(async (directory) => {
      try {
        const result = await this._submitToSingleDirectory(
          submissionId,
          submissionData,
          directory
        );
        
        // Store result in database
        await this._storeFederationResult(submissionId, directory, result);
        
        return {
          directory_id: directory.id,
          instance_url: directory.instance_url,
          success: true,
          remote_submission_id: result.submission_id,
          status: result.status || 'submitted',
          submitted_at: new Date().toISOString()
        };
      } catch (error) {
        console.error(`Submission failed for ${directory.id}:`, error.message);
        
        // Store error result
        await this._storeFederationResult(submissionId, directory, {
          success: false,
          error: error.message
        });
        
        return {
          directory_id: directory.id,
          instance_url: directory.instance_url,
          success: false,
          error: error.message,
          submitted_at: new Date().toISOString()
        };
      }
    });

    const submissionResults = await Promise.allSettled(submissionPromises);

    // Extract results from settled promises
    for (const result of submissionResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error('Submission promise failed:', result.reason);
        results.push({
          success: false,
          error: result.reason.message || 'Unknown error'
        });
      }
    }

    // Update submission status
    const successCount = results.filter(r => r.success).length;
    const newStatus = successCount > 0 ? 'submitted' : 'failed';
    
    await this._updateSubmissionStatus(submissionId, newStatus);

    return results;
  }

  /**
   * Get federated submission status
   * @param {string} submissionId - Submission ID
   * @returns {Promise<Object|null>} Submission status with federation results
   */
  async getFederatedSubmissionStatus(submissionId) {
    try {
      // Get submission
      const submissionResult = await this.supabase
        .from('submissions')
        .select('*')
        .eq('id', submissionId);

      const { data: submissionData, error: submissionError } = submissionResult || {};

      if (submissionError || !submissionData || submissionData.length === 0) {
        return null;
      }

      const submission = submissionData[0];

      // Get federation results
      const federationResult = await this.supabase
        .from('federation_submission_results')
        .select('*')
        .eq('submission_id', submissionId);

      const { data: federationResults, error: federationError } = federationResult || {};

      if (federationError) {
        console.error('Error fetching federation results:', federationError);
      }

      // Calculate summary
      const results = federationResults || [];
      const summary = {
        total_directories: results.length,
        approved_count: results.filter(r => r.status === 'approved').length,
        pending_count: results.filter(r => r.status === 'pending_review' || r.status === 'submitted').length,
        rejected_count: results.filter(r => r.status === 'rejected').length,
        failed_count: results.filter(r => r.status === 'failed').length
      };

      return {
        submission,
        federation_results: results,
        summary
      };
    } catch (error) {
      console.error('Error getting submission status:', error);
      throw error;
    }
  }

  /**
   * Retry failed submissions
   * @param {string} submissionId - Submission ID
   * @returns {Promise<Array>} Array of retry results
   */
  async retryFailedSubmissions(submissionId) {
    try {
      // Get failed federation results
      const failedResult = await this.supabase
        .from('federation_submission_results')
        .select('*')
        .eq('submission_id', submissionId)
        .eq('status', 'failed');

      const { data: failedResults, error } = failedResult || {};

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      if (!failedResults || failedResults.length === 0) {
        return [];
      }

      // Get original submission data
      const submissionResult = await this.supabase
        .from('submissions')
        .select('url, title, description, tags')
        .eq('id', submissionId);

      const { data: submissionDataArray, error: submissionError } = submissionResult || {};

      if (submissionError || !submissionDataArray || submissionDataArray.length === 0) {
        throw new Error('Original submission not found');
      }

      const submissionData = submissionDataArray[0];

      // Retry each failed submission
      const retryResults = [];
      for (const failedResult of failedResults) {
        try {
          const directory = {
            id: failedResult.directory_id,
            instance_url: failedResult.instance_url
          };

          const result = await this._submitToSingleDirectory(
            submissionId,
            submissionData,
            directory
          );

          // Update result in database
          await this.supabase
            .from('federation_submission_results')
            .update({
              status: 'submitted',
              remote_submission_id: result.submission_id,
              error_message: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', failedResult.id);

          retryResults.push({
            directory_id: directory.id,
            success: true,
            remote_submission_id: result.submission_id
          });
        } catch (error) {
          console.error(`Retry failed for ${failedResult.directory_id}:`, error.message);
          retryResults.push({
            directory_id: failedResult.directory_id,
            success: false,
            error: error.message
          });
        }
      }

      return retryResults;
    } catch (error) {
      console.error('Error retrying failed submissions:', error);
      throw error;
    }
  }

  /**
   * Validate submission data
   * @param {Object} data - Submission data to validate
   * @throws {Error} If validation fails
   */
  validateSubmissionData(data) {
    if (!data.url) {
      throw new Error('URL is required');
    }

    if (!this._isValidUrl(data.url)) {
      throw new Error('Invalid URL format');
    }

    if (!data.user_id) {
      throw new Error('User ID is required');
    }

    // Optional fields validation
    if (data.title && typeof data.title !== 'string') {
      throw new Error('Title must be a string');
    }

    if (data.description && typeof data.description !== 'string') {
      throw new Error('Description must be a string');
    }
  }

  /**
   * Submit to a single directory
   * @param {string} submissionId - Local submission ID
   * @param {Object} submissionData - Submission data
   * @param {Object} directory - Target directory
   * @returns {Promise<Object>} Submission result
   * @private
   */
  async _submitToSingleDirectory(submissionId, submissionData, directory) {
    const submissionEndpoint = `${directory.instance_url}/api/federation/submit`;
    
    const payload = {
      url: submissionData.url,
      title: submissionData.title,
      description: submissionData.description,
      tags: submissionData.tags,
      directory_id: directory.id,
      source_instance: 'launchpadder',
      federation_submission_id: submissionId
    };

    const response = await this._fetchWithTimeout(submissionEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LaunchPadder-Federation/1.0'
      },
      body: JSON.stringify(payload),
      timeout: this.requestTimeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Submission failed');
    }

    return result;
  }

  /**
   * Store federation directory mappings
   * @param {string} submissionId - Submission ID
   * @param {Array} directories - Selected directories
   * @private
   */
  async _storeFederationMappings(submissionId, directories) {
    const mappings = directories.map(directory => ({
      submission_id: submissionId,
      directory_id: directory.id,
      instance_url: directory.instance_url,
      status: 'pending',
      created_at: new Date().toISOString()
    }));

    await this.supabase
      .from('federation_submission_results')
      .insert(mappings);
  }

  /**
   * Store federation submission result
   * @param {string} submissionId - Submission ID
   * @param {Object} directory - Directory info
   * @param {Object} result - Submission result
   * @private
   */
  async _storeFederationResult(submissionId, directory, result) {
    const updateData = {
      status: result.success ? 'submitted' : 'failed',
      remote_submission_id: result.submission_id || null,
      error_message: result.error || null,
      updated_at: new Date().toISOString()
    };

    await this.supabase
      .from('federation_submission_results')
      .update(updateData)
      .eq('submission_id', submissionId)
      .eq('directory_id', directory.id);
  }

  /**
   * Update submission status
   * @param {string} submissionId - Submission ID
   * @param {string} status - New status
   * @private
   */
  async _updateSubmissionStatus(submissionId, status) {
    await this.supabase
      .from('submissions')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', submissionId);
  }

  /**
   * Process submission asynchronously (for free submissions)
   * @param {string} submissionId - Submission ID
   * @param {Object} submissionData - Submission data
   * @param {Array} directories - Target directories
   * @private
   */
  async _processSubmissionAsync(submissionId, submissionData, directories) {
    // Run in background without blocking
    setTimeout(async () => {
      try {
        await this.submitToFederatedDirectories(submissionId, submissionData, directories);
      } catch (error) {
        console.error('Async submission processing failed:', error);
      }
    }, 100);
  }

  /**
   * Fetch with timeout support
   * @param {string} url - URL to fetch
   * @param {Object} options - Fetch options with timeout
   * @returns {Promise<Response>} Fetch response
   * @private
   */
  async _fetchWithTimeout(url, options = {}) {
    const { timeout = this.requestTimeout, ...fetchOptions } = options;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid URL
   * @private
   */
  _isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

// Export singleton instance factory
export function createFederatedSubmissionService(supabaseClient, federationDiscoveryService, paymentService) {
  return new FederatedSubmissionService(supabaseClient, federationDiscoveryService, paymentService);
}

// Default export
export default FederatedSubmissionService;