/**
 * Test suite for URL submission service
 * Using Mocha + Chai for testing
 */

import { expect } from 'chai';
import nock from 'nock';
import { SubmissionService } from '../../src/lib/services/submission-service.js';

describe('Submission Service', () => {
  let submissionService;

  beforeEach(() => {
    submissionService = new SubmissionService({
      supabase: mockSupabase(),
      metadataFetcher: mockMetadataFetcher(),
      aiRewriter: mockAIRewriter()
    });
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('createSubmission', () => {
    it('should create a new submission with valid URL', async () => {
      const submissionData = {
        url: 'https://example.com/product'
      };

      const result = await submissionService.createSubmission(submissionData, 'user-123');

      expect(result).to.have.property('id');
      expect(result).to.have.property('url', 'https://example.com/product');
      expect(result).to.have.property('status', 'pending');
      expect(result).to.have.property('original_meta');
      expect(result).to.have.property('rewritten_meta');
      expect(result).to.have.property('submitted_by', 'user-123');
    });

    it('should reject invalid URLs', async () => {
      const submissionData = {
        url: 'not-a-valid-url'
      };

      try {
        await submissionService.createSubmission(submissionData, 'user-123');
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid URL format');
      }
    });

    it('should reject missing URL', async () => {
      const submissionData = {};

      try {
        await submissionService.createSubmission(submissionData, 'user-123');
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('URL is required');
      }
    });

    it('should handle metadata fetching errors gracefully', async () => {
      const submissionData = {
        url: 'https://unreachable.example.com'
      };

      // Mock metadata fetcher to throw error
      const failingService = new SubmissionService({
        supabase: mockSupabase(),
        metadataFetcher: {
          fetchMetadata: async () => {
            throw new Error('Failed to fetch metadata');
          }
        },
        aiRewriter: mockAIRewriter()
      });

      try {
        await failingService.createSubmission(submissionData, 'user-123');
        expect.fail('Should have thrown metadata error');
      } catch (error) {
        expect(error.message).to.include('Failed to fetch metadata');
      }
    });

    it('should handle AI rewriting errors gracefully', async () => {
      const submissionData = {
        url: 'https://example.com/product'
      };

      // Mock AI rewriter to throw error
      const failingService = new SubmissionService({
        supabase: mockSupabase(),
        metadataFetcher: mockMetadataFetcher(),
        aiRewriter: {
          rewriteMetadata: async () => {
            throw new Error('AI service unavailable');
          }
        }
      });

      try {
        await failingService.createSubmission(submissionData, 'user-123');
        expect.fail('Should have thrown AI error');
      } catch (error) {
        expect(error.message).to.include('AI service unavailable');
      }
    });

    it('should prevent duplicate URL submissions', async () => {
      const submissionData = {
        url: 'https://example.com/duplicate'
      };

      // Mock Supabase to return existing submission
      const duplicateService = new SubmissionService({
        supabase: {
          from: () => ({
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { id: 'existing-id', url: 'https://example.com/duplicate' },
                  error: null
                })
              })
            }),
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { code: '23505', message: 'duplicate key value' }
                })
              })
            })
          })
        },
        metadataFetcher: mockMetadataFetcher(),
        aiRewriter: mockAIRewriter()
      });

      try {
        await duplicateService.createSubmission(submissionData, 'user-123');
        expect.fail('Should have thrown duplicate error');
      } catch (error) {
        expect(error.message).to.include('URL has already been submitted');
      }
    });

    it('should require authentication', async () => {
      const submissionData = {
        url: 'https://example.com/product'
      };

      try {
        await submissionService.createSubmission(submissionData, null);
        expect.fail('Should have thrown authentication error');
      } catch (error) {
        expect(error.message).to.include('Authentication required');
      }
    });
  });

  describe('getSubmissions', () => {
    it('should return paginated submissions', async () => {
      const result = await submissionService.getSubmissions({
        page: 1,
        limit: 10,
        status: 'approved'
      });

      expect(result).to.have.property('data');
      expect(result).to.have.property('pagination');
      expect(result.data).to.be.an('array');
      expect(result.pagination).to.have.property('page', 1);
      expect(result.pagination).to.have.property('limit', 10);
    });

    it('should filter by status', async () => {
      const result = await submissionService.getSubmissions({
        status: 'pending'
      });

      expect(result.data.every(sub => sub.status === 'pending')).to.be.true;
    });

    it('should filter by tags', async () => {
      const result = await submissionService.getSubmissions({
        tags: ['productivity', 'saas']
      });

      expect(result.data).to.be.an('array');
    });
  });

  describe('getSubmissionById', () => {
    it('should return submission by ID', async () => {
      const submissionId = 'test-submission-id';
      const result = await submissionService.getSubmissionById(submissionId);

      expect(result).to.have.property('id', submissionId);
      expect(result).to.have.property('url');
      expect(result).to.have.property('status');
    });

    it('should return 404 for non-existent submission', async () => {
      try {
        await submissionService.getSubmissionById('non-existent-id');
        expect.fail('Should have thrown not found error');
      } catch (error) {
        expect(error.message).to.include('Submission not found');
      }
    });

    it('should increment view count', async () => {
      const submissionId = 'test-submission-id';
      const result = await submissionService.getSubmissionById(submissionId);

      expect(result.views_count).to.be.a('number');
    });
  });
});

// Mock helper functions
function mockSupabase() {
  const createQueryBuilder = () => {
    const queryBuilder = {
      data: [],
      error: null,
      count: 0,
      
      select: function(columns) {
        return this;
      },
      
      eq: function(column, value) {
        if (column === 'id' && value === 'test-submission-id') {
          this.data = {
            id: 'test-submission-id',
            url: 'https://example.com/test',
            status: 'approved',
            views_count: 42,
            profiles: {
              id: 'user-123',
              username: 'testuser'
            }
          };
        } else if (column === 'id' && value === 'non-existent-id') {
          this.error = { code: 'PGRST116', message: 'No rows found' };
          this.data = null;
        } else if (column === 'url') {
          // For URL checks, only return data for specific duplicate URLs
          if (value === 'https://example.com/duplicate') {
            this.data = {
              id: 'existing-id',
              url: 'https://example.com/duplicate',
              status: 'approved'
            };
          } else {
            // For other URLs, return null (no duplicate found)
            this.error = { code: 'PGRST116', message: 'No rows found' };
            this.data = null;
          }
        }
        return this;
      },
      
      in: function(column, values) {
        return this;
      },
      
      overlaps: function(column, values) {
        return this;
      },
      
      or: function(condition) {
        return this;
      },
      
      order: function(column, options) {
        return this;
      },
      
      range: function(start, end) {
        return this;
      },
      
      limit: function(count) {
        return this;
      },
      
      offset: function(count) {
        return this;
      },
      
      single: async function() {
        return {
          data: this.data,
          error: this.error
        };
      }
    };
    
    // Make the query builder callable to return results
    queryBuilder[Symbol.asyncIterator] = async function* () {
      yield {
        data: this.data,
        error: this.error,
        count: this.count
      };
    };
    
    // Add then method to make it thenable
    queryBuilder.then = function(resolve) {
      resolve({
        data: this.data,
        error: this.error,
        count: this.count
      });
      return this;
    };
    
    return queryBuilder;
  };

  return {
    from: (table) => ({
      select: (columns) => {
        const builder = createQueryBuilder();
        return builder;
      },
      
      insert: (data) => ({
        select: (columns) => ({
          single: async () => ({
            data: {
              id: 'test-id',
              ...data,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            error: null
          })
        })
      }),
      
      update: (data) => ({
        eq: (column, value) => ({
          select: (columns) => ({
            single: async () => ({
              data: { id: value, ...data },
              error: null
            })
          })
        })
      }),
      
      delete: () => ({
        eq: (column, value) => ({
          eq: (column2, value2) => ({
            eq: (column3, value3) => async () => ({
              error: null
            })
          })
        })
      })
    }),
    
    rpc: (functionName, params) => async () => ({
      data: null,
      error: null
    })
  };
}

function mockMetadataFetcher() {
  return {
    fetchMetadata: async (url) => ({
      url,
      title: 'Test Product',
      description: 'A test product description',
      image: 'https://example.com/image.jpg',
      favicon: 'https://example.com/favicon.ico',
      openGraph: {
        title: 'Test Product',
        description: 'A test product description'
      },
      twitter: {},
      jsonLd: []
    })
  };
}

function mockAIRewriter() {
  return {
    rewriteMetadata: async (metadata) => ({
      title: 'AI Rewritten: ' + metadata.title,
      description: 'AI enhanced: ' + metadata.description,
      tags: ['ai-generated', 'product']
    })
  };
}