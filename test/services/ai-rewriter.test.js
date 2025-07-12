/**
 * Test suite for AI metadata rewriting service
 * Using Mocha + Chai for testing
 */

import { expect } from 'chai';
import nock from 'nock';
import { AIRewriter } from '../../src/lib/services/ai-rewriter.js';

describe('AIRewriter', () => {
  let rewriter;

  beforeEach(() => {
    rewriter = new AIRewriter({
      apiKey: 'test-api-key',
      model: 'gpt-3.5-turbo',
      maxTokens: 500,
      temperature: 0.7,
      maxRetries: 1,
      retryDelay: 10
    });
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('constructor', () => {
    it('should create an instance with default options', () => {
      const defaultRewriter = new AIRewriter({ apiKey: 'test-key' });
      expect(defaultRewriter).to.be.an.instanceOf(AIRewriter);
      expect(defaultRewriter.model).to.equal('gpt-3.5-turbo');
      expect(defaultRewriter.maxTokens).to.equal(500);
      expect(defaultRewriter.temperature).to.equal(0.7);
    });

    it('should accept custom options', () => {
      expect(rewriter.model).to.equal('gpt-3.5-turbo');
      expect(rewriter.maxTokens).to.equal(500);
      expect(rewriter.temperature).to.equal(0.7);
    });

    it('should throw error if no API key provided', () => {
      expect(() => new AIRewriter()).to.throw('OpenAI API key is required');
    });
  });

  describe('validateMetadata', () => {
    it('should accept valid metadata', () => {
      const metadata = {
        title: 'Test Product',
        description: 'A test product description',
        url: 'https://example.com'
      };
      
      expect(() => rewriter.validateMetadata(metadata)).to.not.throw();
    });

    it('should require title', () => {
      const metadata = {
        description: 'A test product description',
        url: 'https://example.com'
      };
      
      expect(() => rewriter.validateMetadata(metadata)).to.throw('Title is required');
    });

    it('should require description', () => {
      const metadata = {
        title: 'Test Product',
        url: 'https://example.com'
      };
      
      expect(() => rewriter.validateMetadata(metadata)).to.throw('Description is required');
    });

    it('should require URL', () => {
      const metadata = {
        title: 'Test Product',
        description: 'A test product description'
      };
      
      expect(() => rewriter.validateMetadata(metadata)).to.throw('URL is required');
    });

    it('should reject empty strings', () => {
      const metadata = {
        title: '',
        description: 'A test product description',
        url: 'https://example.com'
      };
      
      expect(() => rewriter.validateMetadata(metadata)).to.throw('Title is required');
    });
  });

  describe('rewriteMetadata', () => {
    const originalMetadata = {
      title: 'Example Product',
      description: 'This is an example product that does amazing things.',
      url: 'https://example.com/product',
      image: 'https://example.com/image.jpg'
    };

    it('should rewrite metadata successfully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Revolutionary Example Product - Transform Your Workflow',
              description: 'Discover the groundbreaking Example Product that revolutionizes how you work. This innovative solution delivers exceptional results with cutting-edge technology.',
              tags: ['productivity', 'innovation', 'technology']
            })
          }
        }],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 75,
          total_tokens: 225
        }
      };

      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, mockResponse);

      const result = await rewriter.rewriteMetadata(originalMetadata);

      expect(result).to.have.property('title');
      expect(result).to.have.property('description');
      expect(result).to.have.property('tags');
      expect(result.title).to.include('Revolutionary Example Product');
      expect(result.description).to.include('groundbreaking');
      expect(result.tags).to.be.an('array');
      expect(result.tags).to.include('productivity');
    });

    it('should handle OpenAI API errors gracefully', async () => {
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(500, { error: { message: 'Internal server error' } });

      try {
        await rewriter.rewriteMetadata(originalMetadata);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('OpenAI API error');
      }
    });

    it('should handle rate limiting', async () => {
      // Create a more specific nock that matches the exact request
      const scope = nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(429, {
          error: {
            message: 'Rate limit exceeded for requests',
            type: 'rate_limit_exceeded',
            code: 'rate_limit_exceeded'
          }
        });

      try {
        await rewriter.rewriteMetadata(originalMetadata);
        expect.fail('Should have thrown an error');
      } catch (error) {
        // Check that the nock was actually called
        expect(scope.isDone()).to.be.true;
        // The error should be properly formatted by our formatError method
        expect(error.message).to.include('Rate limit exceeded');
      }
    });

    it('should handle invalid JSON response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      };

      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, mockResponse);

      try {
        await rewriter.rewriteMetadata(originalMetadata);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to parse AI response');
      }
    });

    it('should retry on temporary failures', async () => {
      // First request fails
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(503, { error: { message: 'Service temporarily unavailable' } });

      // Second request succeeds
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Retried Example Product',
              description: 'Successfully retried the request.',
              tags: ['retry', 'success']
            })
          }
        }]
      };

      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, mockResponse);

      const result = await rewriter.rewriteMetadata(originalMetadata);
      expect(result.title).to.equal('Retried Example Product');
    });

    it('should respect token limits', async () => {
      const longMetadata = {
        title: 'A'.repeat(1000),
        description: 'B'.repeat(5000),
        url: 'https://example.com'
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Truncated Title',
              description: 'Truncated description due to length.',
              tags: ['truncated']
            })
          }
        }]
      };

      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, mockResponse);

      const result = await rewriter.rewriteMetadata(longMetadata);
      expect(result.title).to.equal('Truncated Title');
    });
  });

  describe('buildPrompt', () => {
    it('should build a proper prompt for rewriting', () => {
      const metadata = {
        title: 'Test Product',
        description: 'A simple test product',
        url: 'https://example.com'
      };

      const prompt = rewriter.buildPrompt(metadata);
      
      expect(prompt).to.include('Test Product');
      expect(prompt).to.include('A simple test product');
      expect(prompt).to.include('https://example.com');
      expect(prompt).to.include('JSON');
      expect(prompt).to.include('title');
      expect(prompt).to.include('description');
      expect(prompt).to.include('tags');
    });

    it('should handle metadata with additional fields', () => {
      const metadata = {
        title: 'Test Product',
        description: 'A simple test product',
        url: 'https://example.com',
        image: 'https://example.com/image.jpg',
        category: 'Software'
      };

      const prompt = rewriter.buildPrompt(metadata);
      expect(prompt).to.include('Software');
    });
  });

  describe('parseAIResponse', () => {
    it('should parse valid JSON response', () => {
      const response = {
        title: 'Parsed Title',
        description: 'Parsed description',
        tags: ['tag1', 'tag2']
      };

      const result = rewriter.parseAIResponse(JSON.stringify(response));
      expect(result).to.deep.equal(response);
    });

    it('should handle response with extra whitespace', () => {
      const response = {
        title: 'Parsed Title',
        description: 'Parsed description',
        tags: ['tag1', 'tag2']
      };

      const result = rewriter.parseAIResponse(`\n\n${JSON.stringify(response)}\n\n`);
      expect(result).to.deep.equal(response);
    });

    it('should extract JSON from markdown code blocks', () => {
      const response = {
        title: 'Markdown Title',
        description: 'Markdown description',
        tags: ['markdown']
      };

      const markdownResponse = `\`\`\`json\n${JSON.stringify(response)}\n\`\`\``;
      const result = rewriter.parseAIResponse(markdownResponse);
      expect(result).to.deep.equal(response);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => rewriter.parseAIResponse('invalid json')).to.throw('Failed to parse AI response');
    });

    it('should validate required fields in response', () => {
      const incompleteResponse = {
        title: 'Only Title'
      };

      expect(() => rewriter.parseAIResponse(JSON.stringify(incompleteResponse)))
        .to.throw('AI response missing required fields');
    });
  });

  describe('truncateText', () => {
    it('should truncate text to specified length', () => {
      const longText = 'A'.repeat(1000);
      const truncated = rewriter.truncateText(longText, 100);
      
      expect(truncated.length).to.be.at.most(100);
      expect(truncated).to.include('...');
    });

    it('should not truncate text shorter than limit', () => {
      const shortText = 'Short text';
      const result = rewriter.truncateText(shortText, 100);
      
      expect(result).to.equal(shortText);
    });

    it('should truncate at word boundaries when possible', () => {
      const text = 'This is a long sentence that should be truncated at word boundaries';
      const truncated = rewriter.truncateText(text, 30);
      
      expect(truncated).to.not.include('truncat'); // Should not cut mid-word
      expect(truncated).to.include('...');
    });
  });

  describe('estimateTokens', () => {
    it('should estimate token count for text', () => {
      const text = 'This is a sample text for token estimation';
      const tokens = rewriter.estimateTokens(text);
      
      expect(tokens).to.be.a('number');
      expect(tokens).to.be.greaterThan(0);
      expect(tokens).to.be.lessThan(text.length); // Tokens should be less than characters
    });

    it('should handle empty text', () => {
      const tokens = rewriter.estimateTokens('');
      expect(tokens).to.equal(0);
    });

    it('should handle special characters', () => {
      const text = '🚀 Special characters and emojis! @#$%^&*()';
      const tokens = rewriter.estimateTokens(text);
      
      expect(tokens).to.be.a('number');
      expect(tokens).to.be.greaterThan(0);
    });
  });
});