/**
 * Submission Service
 * Handles URL submission workflow including metadata fetching, AI enhancement, and database operations
 */

import { PuppeteerMetadataFetcher } from './puppeteer-metadata-fetcher.js';
import { createAIRewriter } from './ai-rewriter.js';
import { createEnhancedAIService } from './enhanced-ai-service.js';

export class SubmissionService {
  constructor(options = {}) {
    this.supabase = options.supabase;
    this.metadataFetcher = options.metadataFetcher || new PuppeteerMetadataFetcher({
      timeout: 30000,
      waitForTimeout: 3000,
      enableImages: false, // Faster loading for production
      enableCaching: true
    });
    this.aiRewriter = options.aiRewriter || createAIRewriter();
    this.enhancedAIService = options.enhancedAIService !== undefined
      ? options.enhancedAIService
      : createEnhancedAIService({ aiRewriter: this.aiRewriter });
    this.useEnhancedAI = options.useEnhancedAI ?? true;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    
    if (!this.supabase) {
      throw new Error('Supabase client is required');
    }
  }

  /**
   * Validates submission data
   * @param {Object} data - The submission data to validate
   * @throws {Error} If validation fails
   */
  validateSubmissionData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Submission data must be an object');
    }

    if (!data.url || typeof data.url !== 'string' || data.url.trim() === '') {
      throw new Error('URL is required');
    }

    // Validate URL format
    try {
      new URL(data.url);
    } catch (error) {
      throw new Error('Invalid URL format');
    }
  }

  /**
   * Validates user authentication
   * @param {string} userId - The user ID
   * @throws {Error} If user is not authenticated
   */
  validateAuthentication(userId) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Authentication required');
    }
  }

  /**
   * Checks if URL has already been submitted
   * @param {string} url - The URL to check
   * @returns {Promise<Object|null>} Existing submission or null
   */
  async checkDuplicateUrl(url) {
    try {
      const { data, error } = await this.supabase
        .from('submissions')
        .select('id, url, status, created_at')
        .eq('url', url)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      if (error.code === 'PGRST116') {
        return null; // No duplicate found
      }
      throw new Error(`Failed to check for duplicate URL: ${error.message}`);
    }
  }

  /**
   * Creates a new submission
   * @param {Object} submissionData - The submission data
   * @param {string} userId - The authenticated user ID
   * @returns {Promise<Object>} The created submission
   */
  async createSubmission(submissionData, userId) {
    // Validate input
    this.validateAuthentication(userId);
    this.validateSubmissionData(submissionData);

    const { url } = submissionData;

    try {
      // Check for duplicate URL
      const existingSubmission = await this.checkDuplicateUrl(url);
      if (existingSubmission) {
        throw new Error('URL has already been submitted');
      }

      // Fetch metadata from URL
      const originalMetadata = await this.fetchMetadataWithRetry(url);

      // Generate AI-enhanced content
      const enhancedMetadata = this.useEnhancedAI
        ? await this.enhanceMetadataWithRetry(originalMetadata)
        : await this.rewriteMetadataWithRetry(originalMetadata);

      // Prepare submission data
      const submissionRecord = {
        url,
        original_meta: originalMetadata,
        rewritten_meta: this.useEnhancedAI ? enhancedMetadata : enhancedMetadata,
        ai_analysis: this.useEnhancedAI ? enhancedMetadata.aiEnhancements : null,
        submitted_by: userId,
        status: 'pending',
        tags: enhancedMetadata.tags || [],
        images: {
          main: originalMetadata.images?.[0]?.url || originalMetadata.image,
          favicon: originalMetadata.favicons?.[0]?.url || originalMetadata.favicon,
          all: originalMetadata.images || [],
          favicons: originalMetadata.favicons || []
        }
      };

      // Insert into database
      const { data, error } = await this.supabase
        .from('submissions')
        .insert(submissionRecord)
        .select('*')
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('URL has already been submitted');
        }
        throw new Error(`Failed to create submission: ${error.message}`);
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Fetches metadata with retry logic
   * @param {string} url - The URL to fetch metadata from
   * @returns {Promise<Object>} The fetched metadata
   */
  async fetchMetadataWithRetry(url) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.metadataFetcher.fetchMetadata(url);
      } catch (error) {
        lastError = error;
        
        // Don't retry on validation errors
        if (error.message.includes('Invalid URL') || error.message.includes('not allowed')) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * attempt);
        }
      }
    }

    throw new Error(`Failed to fetch metadata after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Rewrites metadata with retry logic
   * @param {Object} metadata - The original metadata
   * @returns {Promise<Object>} The rewritten metadata
   */
  async rewriteMetadataWithRetry(metadata) {
    if (!this.aiRewriter) {
      // If AI rewriter is not available, return original metadata with basic formatting
      return {
        title: metadata.title || 'Untitled',
        description: metadata.description || 'No description available',
        tags: []
      };
    }

    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.aiRewriter.rewriteMetadata(metadata);
      } catch (error) {
        lastError = error;
        
        // Don't retry on authentication or quota errors
        if (error.message.includes('Invalid OpenAI API key') || 
            error.message.includes('quota')) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * attempt);
        }
      }
    }

    throw new Error(`Failed to rewrite metadata after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Enhances metadata with comprehensive AI analysis and retry logic
   * @param {Object} metadata - The original metadata
   * @returns {Promise<Object>} The enhanced metadata with AI insights
   */
  async enhanceMetadataWithRetry(metadata) {
    if (!this.enhancedAIService) {
      // Fallback to basic rewriting if enhanced AI service is not available
      return await this.rewriteMetadataWithRetry(metadata);
    }

    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.enhancedAIService.enhanceMetadata(metadata);
      } catch (error) {
        lastError = error;
        
        // Don't retry on authentication or quota errors
        if (error.message.includes('Invalid OpenAI API key') ||
            error.message.includes('quota')) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * attempt);
        }
      }
    }

    throw new Error(`Failed to enhance metadata after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Gets submissions with filtering and pagination
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated submissions
   */
  async getSubmissions(options = {}) {
    const {
      page = 1,
      limit = 10,
      status = 'approved',
      tags = [],
      search = '',
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = options;

    try {
      let query = this.supabase
        .from('submissions')
        .select(`
          id,
          url,
          rewritten_meta,
          images,
          status,
          created_at,
          published_at,
          votes_count,
          comments_count,
          views_count,
          slug,
          tags,
          profiles:submitted_by (
            id,
            username,
            full_name,
            avatar_url
          )
        `, { count: 'exact' });

      // Filter by status
      if (status) {
        if (Array.isArray(status)) {
          query = query.in('status', status);
        } else {
          query = query.eq('status', status);
        }
      }

      // Filter by tags
      if (tags.length > 0) {
        query = query.overlaps('tags', tags);
      }

      // Search in title and description
      if (search) {
        query = query.or(`rewritten_meta->>title.ilike.%${search}%,rewritten_meta->>description.ilike.%${search}%`);
      }

      // Apply sorting
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`Failed to fetch submissions: ${error.message}`);
      }

      return {
        data: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Gets a submission by ID and increments view count
   * @param {string} submissionId - The submission ID
   * @returns {Promise<Object>} The submission
   */
  async getSubmissionById(submissionId) {
    try {
      // Get submission
      const { data, error } = await this.supabase
        .from('submissions')
        .select(`
          *,
          profiles:submitted_by (
            id,
            username,
            full_name,
            avatar_url
          )
        `)
        .eq('id', submissionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Submission not found');
        }
        throw new Error(`Failed to fetch submission: ${error.message}`);
      }

      // Increment view count
      await this.incrementViewCount(submissionId);

      return data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Increments the view count for a submission
   * @param {string} submissionId - The submission ID
   */
  async incrementViewCount(submissionId) {
    try {
      await this.supabase.rpc('increment_view_count', {
        submission_id: submissionId
      });
    } catch (error) {
      // Don't throw error for view count increment failures
      console.warn('Failed to increment view count:', error.message);
    }
  }

  /**
   * Updates a submission (for the submitter only)
   * @param {string} submissionId - The submission ID
   * @param {Object} updateData - The data to update
   * @param {string} userId - The authenticated user ID
   * @returns {Promise<Object>} The updated submission
   */
  async updateSubmission(submissionId, updateData, userId) {
    this.validateAuthentication(userId);

    try {
      const { data, error } = await this.supabase
        .from('submissions')
        .update(updateData)
        .eq('id', submissionId)
        .eq('submitted_by', userId)
        .eq('status', 'pending') // Only allow updates to pending submissions
        .select('*')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('Submission not found or cannot be updated');
        }
        throw new Error(`Failed to update submission: ${error.message}`);
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Deletes a submission (for the submitter only)
   * @param {string} submissionId - The submission ID
   * @param {string} userId - The authenticated user ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteSubmission(submissionId, userId) {
    this.validateAuthentication(userId);

    try {
      const { error } = await this.supabase
        .from('submissions')
        .delete()
        .eq('id', submissionId)
        .eq('submitted_by', userId)
        .eq('status', 'pending'); // Only allow deletion of pending submissions

      if (error) {
        throw new Error(`Failed to delete submission: ${error.message}`);
      }

      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after the delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources (especially Puppeteer browser instances)
   * Should be called when the service is no longer needed
   */
  async cleanup() {
    if (this.metadataFetcher && typeof this.metadataFetcher.cleanup === 'function') {
      await this.metadataFetcher.cleanup();
    }
    if (this.enhancedAIService && typeof this.enhancedAIService.cleanup === 'function') {
      await this.enhancedAIService.cleanup();
    }
  }
}

/**
 * Factory function to create a submission service instance
 * @param {Object} options - Configuration options
 * @returns {SubmissionService} A new submission service instance
 */
export function createSubmissionService(options = {}) {
  return new SubmissionService(options);
}
