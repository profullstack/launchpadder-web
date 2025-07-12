/**
 * AI Metadata Rewriting Service
 * Uses OpenAI API to rewrite product metadata for uniqueness and SEO optimization
 */

import OpenAI from 'openai';

export class AIRewriter {
  constructor(options = {}) {
    if (!options.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({
      apiKey: options.apiKey,
    });

    this.model = options.model || 'gpt-3.5-turbo';
    this.maxTokens = options.maxTokens || 500;
    this.temperature = options.temperature || 0.7;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.maxInputLength = options.maxInputLength || 2000;
  }

  /**
   * Validates metadata before processing
   * @param {Object} metadata - The metadata to validate
   * @throws {Error} If metadata is invalid
   */
  validateMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      throw new Error('Metadata must be an object');
    }

    if (!metadata.title || typeof metadata.title !== 'string' || metadata.title.trim() === '') {
      throw new Error('Title is required');
    }

    if (!metadata.description || typeof metadata.description !== 'string' || metadata.description.trim() === '') {
      throw new Error('Description is required');
    }

    if (!metadata.url || typeof metadata.url !== 'string' || metadata.url.trim() === '') {
      throw new Error('URL is required');
    }
  }

  /**
   * Rewrites metadata using OpenAI API
   * @param {Object} originalMetadata - The original metadata to rewrite
   * @returns {Promise<Object>} The rewritten metadata
   */
  async rewriteMetadata(originalMetadata) {
    this.validateMetadata(originalMetadata);

    // Truncate long content to stay within token limits
    const truncatedMetadata = {
      ...originalMetadata,
      title: this.truncateText(originalMetadata.title, 200),
      description: this.truncateText(originalMetadata.description, 1000)
    };

    const prompt = this.buildPrompt(truncatedMetadata);
    
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert copywriter and SEO specialist. Your task is to rewrite product metadata to make it unique, engaging, and SEO-friendly while preserving the core meaning and functionality.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('Empty response from OpenAI API');
        }

        return this.parseAIResponse(content);
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          throw this.formatError(error);
        }

        // Wait before retrying
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * attempt);
        }
      }
    }

    throw this.formatError(lastError);
  }

  /**
   * Builds the prompt for the AI rewriting request
   * @param {Object} metadata - The metadata to include in the prompt
   * @returns {string} The formatted prompt
   */
  buildPrompt(metadata) {
    const additionalFields = Object.keys(metadata)
      .filter(key => !['title', 'description', 'url'].includes(key))
      .map(key => `${key}: ${metadata[key]}`)
      .join('\n');

    return `
Please rewrite the following product metadata to make it unique, engaging, and SEO-friendly. 
Maintain the core functionality and meaning while making it more compelling for users and search engines.

Original Metadata:
Title: ${metadata.title}
Description: ${metadata.description}
URL: ${metadata.url}
${additionalFields ? `Additional Info:\n${additionalFields}` : ''}

Requirements:
1. Create a new title that is catchy, SEO-friendly, and under 60 characters
2. Write a new description that is engaging, informative, and 120-160 characters
3. Generate 3-5 relevant tags/keywords for SEO
4. Ensure the rewritten content is unique and doesn't duplicate the original
5. Maintain the product's core value proposition and functionality

Return your response as a JSON object with the following structure:
{
  "title": "Rewritten title here",
  "description": "Rewritten description here", 
  "tags": ["tag1", "tag2", "tag3"]
}
`.trim();
  }

  /**
   * Parses the AI response and validates the structure
   * @param {string} response - The raw response from OpenAI
   * @returns {Object} The parsed and validated response
   */
  parseAIResponse(response) {
    try {
      // Clean up the response
      let cleanResponse = response.trim();
      
      // Extract JSON from markdown code blocks if present
      const jsonMatch = cleanResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[1];
      }

      const parsed = JSON.parse(cleanResponse);

      // Validate required fields
      if (!parsed.title || !parsed.description) {
        throw new Error('AI response missing required fields: title and description');
      }

      // Ensure tags is an array
      if (!parsed.tags || !Array.isArray(parsed.tags)) {
        parsed.tags = [];
      }

      // Clean up the response
      return {
        title: String(parsed.title).trim(),
        description: String(parsed.description).trim(),
        tags: parsed.tags.map(tag => String(tag).trim()).filter(tag => tag.length > 0)
      };
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }

  /**
   * Truncates text to a specified length, preferring word boundaries
   * @param {string} text - The text to truncate
   * @param {number} maxLength - The maximum length
   * @returns {string} The truncated text
   */
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) {
      return text;
    }

    // Try to truncate at word boundary
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    return truncated.substring(0, maxLength - 3) + '...';
  }

  /**
   * Estimates token count for text (rough approximation)
   * @param {string} text - The text to estimate tokens for
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    if (!text) return 0;
    
    // Rough estimation: ~4 characters per token for English text
    // This is a simplified approximation
    return Math.ceil(text.length / 4);
  }

  /**
   * Checks if an error should not be retried
   * @param {Error} error - The error to check
   * @returns {boolean} True if the error should not be retried
   */
  isNonRetryableError(error) {
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.response?.status;

    // Don't retry on authentication errors
    if (status === 401 || message.includes('unauthorized') || message.includes('invalid api key')) {
      return true;
    }

    // Don't retry on quota exceeded errors
    if (status === 429 && message.includes('quota')) {
      return true;
    }

    // Don't retry on invalid request errors
    if (status === 400 || message.includes('invalid request')) {
      return true;
    }

    return false;
  }

  /**
   * Formats error messages for better user experience
   * @param {Error} error - The error to format
   * @returns {Error} The formatted error
   */
  formatError(error) {
    const message = error.message || 'Unknown error';
    const status = error.status || error.response?.status;

    if (status === 429 || message.toLowerCase().includes('rate limit')) {
      return new Error('Rate limit exceeded. Please try again later.');
    }

    if (status === 401) {
      return new Error('Invalid OpenAI API key. Please check your configuration.');
    }

    if (status === 403) {
      return new Error('Access denied. Please check your OpenAI API permissions.');
    }

    if (status >= 500) {
      return new Error('OpenAI service temporarily unavailable. Please try again later.');
    }

    return new Error(`OpenAI API error: ${message}`);
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after the delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export a factory function for easy configuration
export function createAIRewriter(options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key must be provided via options or OPENAI_API_KEY environment variable');
  }

  return new AIRewriter({
    ...options,
    apiKey
  });
}

// Export a default instance
export const aiRewriter = process.env.OPENAI_API_KEY 
  ? createAIRewriter()
  : null;