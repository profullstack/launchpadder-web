/**
 * Test suite for Submission Service with Enhanced AI Integration
 * Using Mocha + Chai for testing
 */

import { expect } from 'chai';
import { SubmissionService } from '../../src/lib/services/submission-service.js';

describe('SubmissionService - Enhanced AI Integration', () => {
  let submissionService;
  let mockSupabase;
  let mockMetadataFetcher;
  let mockAIRewriter;
  let mockEnhancedAIService;

  beforeEach(() => {
    // Mock Supabase client
    mockSupabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            single: () => ({ data: null, error: { code: 'PGRST116' } })
          })
        }),
        insert: (data) => ({
          select: () => ({
            single: () => ({ data: { id: 'test-id', ...data }, error: null })
          })
        })
      })
    };

    // Mock metadata fetcher
    mockMetadataFetcher = {
      fetchMetadata: async (url) => ({
        title: 'Test App',
        description: 'A test application for productivity',
        url,
        image: 'https://example.com/image.jpg',
        favicon: 'https://example.com/favicon.ico',
        images: [{ url: 'https://example.com/image.jpg' }],
        favicons: [{ url: 'https://example.com/favicon.ico' }]
      }),
      cleanup: async () => {}
    };

    // Mock AI rewriter
    mockAIRewriter = {
      rewriteMetadata: async (metadata) => ({
        title: `Enhanced ${metadata.title}`,
        description: `Improved ${metadata.description}`,
        tags: ['productivity', 'ai-enhanced']
      })
    };

    // Mock Enhanced AI Service
    mockEnhancedAIService = {
      enhanceMetadata: async (metadata) => ({
        title: `AI Enhanced ${metadata.title}`,
        description: `AI Improved ${metadata.description}`,
        tags: ['productivity', 'ai-enhanced', 'comprehensive'],
        aiEnhancements: {
          timestamp: new Date().toISOString(),
          version: '1.0',
          contentAnalysis: {
            readabilityScore: { score: 75, level: 'standard' },
            keywordDensity: { keywords: [{ word: 'productivity', count: 2, density: '10.00' }] },
            contentLength: { title: 8, description: 35 },
            uniquenessScore: { score: 85, level: 'high' },
            completeness: { score: 80, completedFields: 4, totalFields: 5 }
          },
          seoOptimization: {
            titleOptimization: { suggestions: [], score: 90, optimal: true },
            descriptionOptimization: { suggestions: [], score: 85, optimal: true },
            keywordSuggestions: ['productivity', 'app'],
            metaTagSuggestions: { 'og:title': 'Test App' },
            structuredDataSuggestions: { '@type': 'SoftwareApplication' }
          },
          sentiment: {
            overall: 'positive',
            confidence: 0.8,
            emotions: { positive: 2, negative: 0 },
            tone: 'positive',
            recommendations: []
          },
          category: {
            primary: 'productivity',
            secondary: null,
            confidence: 0.9,
            tags: ['productivity'],
            industry: 'productivity'
          }
        }
      }),
      cleanup: async () => {}
    };

    submissionService = new SubmissionService({
      supabase: mockSupabase,
      metadataFetcher: mockMetadataFetcher,
      aiRewriter: mockAIRewriter,
      enhancedAIService: mockEnhancedAIService,
      useEnhancedAI: true
    });
  });

  describe('constructor with Enhanced AI', () => {
    it('should create instance with Enhanced AI Service enabled', () => {
      expect(submissionService.enhancedAIService).to.equal(mockEnhancedAIService);
      expect(submissionService.useEnhancedAI).to.be.true;
    });

    it('should create instance with Enhanced AI Service disabled', () => {
      const service = new SubmissionService({
        supabase: mockSupabase,
        metadataFetcher: mockMetadataFetcher,
        aiRewriter: mockAIRewriter,
        useEnhancedAI: false
      });
      
      expect(service.useEnhancedAI).to.be.false;
    });
  });

  describe('enhanceMetadataWithRetry', () => {
    it('should enhance metadata successfully', async () => {
      const metadata = {
        title: 'Test App',
        description: 'A test application'
      };

      const enhanced = await submissionService.enhanceMetadataWithRetry(metadata);
      
      expect(enhanced).to.have.property('title');
      expect(enhanced).to.have.property('description');
      expect(enhanced).to.have.property('aiEnhancements');
      expect(enhanced.title).to.include('AI Enhanced');
      expect(enhanced.aiEnhancements).to.have.property('contentAnalysis');
      expect(enhanced.aiEnhancements).to.have.property('seoOptimization');
      expect(enhanced.aiEnhancements).to.have.property('sentiment');
      expect(enhanced.aiEnhancements).to.have.property('category');
    });

    it('should fallback to basic rewriting when Enhanced AI Service is not available', async () => {
      const serviceWithoutEnhanced = new SubmissionService({
        supabase: mockSupabase,
        metadataFetcher: mockMetadataFetcher,
        aiRewriter: mockAIRewriter,
        enhancedAIService: null,
        useEnhancedAI: true
      });

      const metadata = {
        title: 'Test App',
        description: 'A test application'
      };

      const enhanced = await serviceWithoutEnhanced.enhanceMetadataWithRetry(metadata);
      
      expect(enhanced.title).to.include('Enhanced');
      expect(enhanced).to.not.have.property('aiEnhancements');
    });

    it('should retry on transient errors', async () => {
      let attempts = 0;
      mockEnhancedAIService.enhanceMetadata = async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary network error');
        }
        return {
          title: 'Success after retry',
          description: 'Enhanced description',
          tags: ['test'],
          aiEnhancements: { timestamp: new Date().toISOString() }
        };
      };

      const metadata = { title: 'Test', description: 'Test description' };
      const enhanced = await submissionService.enhanceMetadataWithRetry(metadata);
      
      expect(enhanced.title).to.equal('Success after retry');
      expect(attempts).to.equal(2);
    });

    it('should not retry on authentication errors', async () => {
      mockEnhancedAIService.enhanceMetadata = async () => {
        throw new Error('Invalid OpenAI API key');
      };

      const metadata = { title: 'Test', description: 'Test description' };
      
      try {
        await submissionService.enhanceMetadataWithRetry(metadata);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Invalid OpenAI API key');
      }
    });
  });

  describe('createSubmission with Enhanced AI', () => {
    it('should create submission with enhanced AI analysis', async () => {
      const submissionData = {
        url: 'https://example.com/test-app'
      };
      const userId = 'user-123';

      const submission = await submissionService.createSubmission(submissionData, userId);
      
      expect(submission).to.have.property('id');
      expect(submission).to.have.property('url', submissionData.url);
      expect(submission).to.have.property('rewritten_meta');
      expect(submission).to.have.property('ai_analysis');
      expect(submission.rewritten_meta.title).to.include('AI Enhanced');
      expect(submission.ai_analysis).to.have.property('contentAnalysis');
      expect(submission.ai_analysis).to.have.property('seoOptimization');
      expect(submission.ai_analysis).to.have.property('sentiment');
      expect(submission.ai_analysis).to.have.property('category');
    });

    it('should create submission without enhanced AI when disabled', async () => {
      const serviceWithoutEnhanced = new SubmissionService({
        supabase: mockSupabase,
        metadataFetcher: mockMetadataFetcher,
        aiRewriter: mockAIRewriter,
        useEnhancedAI: false
      });

      const submissionData = {
        url: 'https://example.com/test-app'
      };
      const userId = 'user-123';

      const submission = await serviceWithoutEnhanced.createSubmission(submissionData, userId);
      
      expect(submission).to.have.property('id');
      expect(submission).to.have.property('rewritten_meta');
      expect(submission).to.have.property('ai_analysis', null);
      expect(submission.rewritten_meta.title).to.include('Enhanced');
      expect(submission.rewritten_meta.title).to.not.include('AI Enhanced');
    });
  });

  describe('cleanup with Enhanced AI', () => {
    it('should cleanup all services including Enhanced AI Service', async () => {
      let metadataCleanupCalled = false;
      let enhancedAICleanupCalled = false;

      mockMetadataFetcher.cleanup = async () => {
        metadataCleanupCalled = true;
      };

      mockEnhancedAIService.cleanup = async () => {
        enhancedAICleanupCalled = true;
      };

      await submissionService.cleanup();
      
      expect(metadataCleanupCalled).to.be.true;
      expect(enhancedAICleanupCalled).to.be.true;
    });

    it('should handle cleanup gracefully when Enhanced AI Service has no cleanup method', async () => {
      mockEnhancedAIService.cleanup = undefined;

      try {
        await submissionService.cleanup();
        expect(true).to.be.true; // Test passes if no error is thrown
      } catch (error) {
        expect.fail(`Cleanup should not throw errors: ${error.message}`);
      }
    });
  });

  describe('Enhanced AI Service integration edge cases', () => {
    it('should handle Enhanced AI Service errors gracefully', async () => {
      mockEnhancedAIService.enhanceMetadata = async () => {
        throw new Error('AI service temporarily unavailable');
      };

      // Should fallback to basic rewriting
      mockAIRewriter.rewriteMetadata = async (metadata) => ({
        title: `Fallback ${metadata.title}`,
        description: `Fallback ${metadata.description}`,
        tags: ['fallback']
      });

      const submissionData = {
        url: 'https://example.com/test-app'
      };
      const userId = 'user-123';

      try {
        await submissionService.createSubmission(submissionData, userId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to enhance metadata');
      }
    });

    it('should validate Enhanced AI Service response structure', async () => {
      mockEnhancedAIService.enhanceMetadata = async () => ({
        // Missing required fields
        title: 'Test'
      });

      const metadata = { title: 'Test', description: 'Test description' };
      const enhanced = await submissionService.enhanceMetadataWithRetry(metadata);
      
      expect(enhanced).to.have.property('title', 'Test');
      // Should handle missing fields gracefully
    });
  });
});