/**
 * API Testing Helpers
 * Utilities for testing API endpoints and HTTP interactions
 */

import request from 'supertest';
import { expect } from 'chai';
import { testAuth } from '../setup.js';

/**
 * API test helper class for making authenticated requests
 */
export class ApiTestHelper {
  constructor(app) {
    this.app = app;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Make authenticated request with user session
   */
  async authenticatedRequest(method, path, session, data = null, headers = {}) {
    const authHeaders = testAuth.getAuthHeaders(session);
    const allHeaders = { ...this.defaultHeaders, ...authHeaders, ...headers };
    
    let req = request(this.app)[method.toLowerCase()](path).set(allHeaders);
    
    if (data && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
      req = req.send(data);
    }
    
    return req;
  }

  /**
   * Make unauthenticated request
   */
  async unauthenticatedRequest(method, path, data = null, headers = {}) {
    const allHeaders = { ...this.defaultHeaders, ...headers };
    
    let req = request(this.app)[method.toLowerCase()](path).set(allHeaders);
    
    if (data && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
      req = req.send(data);
    }
    
    return req;
  }

  /**
   * Test API endpoint with various scenarios
   */
  async testEndpoint(config) {
    const {
      method = 'GET',
      path,
      requiresAuth = true,
      validData = null,
      invalidData = null,
      session = null,
      expectedStatus = 200,
      expectedFields = [],
      description = `${method} ${path}`
    } = config;

    describe(description, () => {
      if (requiresAuth) {
        it('should require authentication', async () => {
          const response = await this.unauthenticatedRequest(method, path, validData);
          expect(response.status).to.be.oneOf([401, 403]);
        });

        if (session) {
          it('should work with valid authentication', async () => {
            const response = await this.authenticatedRequest(method, path, session, validData);
            expect(response.status).to.equal(expectedStatus);
            
            if (expectedFields.length > 0) {
              expectedFields.forEach(field => {
                expect(response.body).to.have.property(field);
              });
            }
          });
        }
      } else {
        it('should work without authentication', async () => {
          const response = await this.unauthenticatedRequest(method, path, validData);
          expect(response.status).to.equal(expectedStatus);
          
          if (expectedFields.length > 0) {
            expectedFields.forEach(field => {
              expect(response.body).to.have.property(field);
            });
          }
        });
      }

      if (invalidData) {
        it('should reject invalid data', async () => {
          const makeRequest = session 
            ? () => this.authenticatedRequest(method, path, session, invalidData)
            : () => this.unauthenticatedRequest(method, path, invalidData);
          
          const response = await makeRequest();
          expect(response.status).to.be.oneOf([400, 422]);
        });
      }
    });
  }

  /**
   * Test pagination for list endpoints
   */
  async testPagination(path, session, options = {}) {
    const {
      defaultLimit = 10,
      maxLimit = 100,
      testData = []
    } = options;

    describe('Pagination', () => {
      it('should return paginated results with default limit', async () => {
        const response = await this.authenticatedRequest('GET', path, session);
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('data');
        expect(response.body).to.have.property('pagination');
        expect(response.body.pagination).to.have.property('limit', defaultLimit);
        expect(response.body.pagination).to.have.property('page', 1);
      });

      it('should respect custom limit parameter', async () => {
        const customLimit = 5;
        const response = await this.authenticatedRequest('GET', `${path}?limit=${customLimit}`, session);
        expect(response.status).to.equal(200);
        expect(response.body.pagination.limit).to.equal(customLimit);
        expect(response.body.data.length).to.be.at.most(customLimit);
      });

      it('should respect page parameter', async () => {
        const response = await this.authenticatedRequest('GET', `${path}?page=2&limit=5`, session);
        expect(response.status).to.equal(200);
        expect(response.body.pagination.page).to.equal(2);
      });

      it('should enforce maximum limit', async () => {
        const response = await this.authenticatedRequest('GET', `${path}?limit=999`, session);
        expect(response.status).to.equal(200);
        expect(response.body.pagination.limit).to.be.at.most(maxLimit);
      });

      it('should handle invalid pagination parameters gracefully', async () => {
        const response = await this.authenticatedRequest('GET', `${path}?page=-1&limit=abc`, session);
        expect(response.status).to.equal(200);
        expect(response.body.pagination.page).to.be.at.least(1);
        expect(response.body.pagination.limit).to.equal(defaultLimit);
      });
    });
  }

  /**
   * Test rate limiting for endpoints
   */
  async testRateLimit(path, session, options = {}) {
    const {
      method = 'GET',
      data = null,
      maxRequests = 100,
      windowMs = 60000
    } = options;

    describe('Rate Limiting', () => {
      it('should enforce rate limits', async function() {
        this.timeout(10000); // Allow time for rate limit testing
        
        const requests = [];
        const startTime = Date.now();
        
        // Make requests rapidly
        for (let i = 0; i < maxRequests + 10; i++) {
          const promise = session 
            ? this.authenticatedRequest(method, path, session, data)
            : this.unauthenticatedRequest(method, path, data);
          requests.push(promise);
        }
        
        const responses = await Promise.allSettled(requests);
        const rateLimitedResponses = responses.filter(
          result => result.status === 'fulfilled' && result.value.status === 429
        );
        
        expect(rateLimitedResponses.length).to.be.greaterThan(0);
      });

      it('should include rate limit headers', async () => {
        const response = await (session 
          ? this.authenticatedRequest(method, path, session, data)
          : this.unauthenticatedRequest(method, path, data));
        
        expect(response.headers).to.have.property('x-ratelimit-limit');
        expect(response.headers).to.have.property('x-ratelimit-remaining');
        expect(response.headers).to.have.property('x-ratelimit-reset');
      });
    });
  }

  /**
   * Test CORS headers
   */
  async testCors(path, options = {}) {
    const { origin = 'https://example.com' } = options;

    describe('CORS', () => {
      it('should include CORS headers', async () => {
        const response = await request(this.app)
          .options(path)
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'GET');
        
        expect(response.headers).to.have.property('access-control-allow-origin');
        expect(response.headers).to.have.property('access-control-allow-methods');
        expect(response.headers).to.have.property('access-control-allow-headers');
      });

      it('should handle preflight requests', async () => {
        const response = await request(this.app)
          .options(path)
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'POST')
          .set('Access-Control-Request-Headers', 'Content-Type,Authorization');
        
        expect(response.status).to.equal(200);
      });
    });
  }
}

/**
 * Response validation helpers
 */
export const responseValidators = {
  /**
   * Validate standard API response structure
   */
  validateApiResponse: (response, expectedStatus = 200) => {
    expect(response.status).to.equal(expectedStatus);
    expect(response.body).to.be.an('object');
    
    if (expectedStatus >= 400) {
      expect(response.body).to.have.property('error');
      expect(response.body.error).to.have.property('message');
    }
  },

  /**
   * Validate paginated response
   */
  validatePaginatedResponse: (response, expectedFields = []) => {
    responseValidators.validateApiResponse(response);
    expect(response.body).to.have.property('data');
    expect(response.body).to.have.property('pagination');
    expect(response.body.data).to.be.an('array');
    expect(response.body.pagination).to.have.property('page');
    expect(response.body.pagination).to.have.property('limit');
    expect(response.body.pagination).to.have.property('total');
    
    if (expectedFields.length > 0 && response.body.data.length > 0) {
      expectedFields.forEach(field => {
        expect(response.body.data[0]).to.have.property(field);
      });
    }
  },

  /**
   * Validate submission response
   */
  validateSubmissionResponse: (response, expectedStatus = 200) => {
    responseValidators.validateApiResponse(response, expectedStatus);
    
    if (expectedStatus < 400) {
      expect(response.body).to.have.property('id');
      expect(response.body).to.have.property('url');
      expect(response.body).to.have.property('status');
      expect(response.body).to.have.property('original_meta');
      expect(response.body).to.have.property('rewritten_meta');
      expect(response.body).to.have.property('created_at');
    }
  },

  /**
   * Validate user profile response
   */
  validateProfileResponse: (response, expectedStatus = 200) => {
    responseValidators.validateApiResponse(response, expectedStatus);
    
    if (expectedStatus < 400) {
      expect(response.body).to.have.property('id');
      expect(response.body).to.have.property('username');
      expect(response.body).to.have.property('full_name');
      expect(response.body).to.have.property('created_at');
    }
  },

  /**
   * Validate federation instance response
   */
  validateFederationResponse: (response, expectedStatus = 200) => {
    responseValidators.validateApiResponse(response, expectedStatus);
    
    if (expectedStatus < 400) {
      expect(response.body).to.have.property('id');
      expect(response.body).to.have.property('name');
      expect(response.body).to.have.property('url');
      expect(response.body).to.have.property('status');
      expect(response.body).to.have.property('created_at');
    }
  }
};

/**
 * Mock external services for testing
 */
export const mockServices = {
  /**
   * Mock metadata fetcher responses
   */
  mockMetadataFetcher: (nock, baseUrl = 'https://example.com') => {
    return nock(baseUrl)
      .get('/')
      .reply(200, `
        <html>
          <head>
            <title>Test Product</title>
            <meta name="description" content="A test product description">
            <meta property="og:title" content="Test Product">
            <meta property="og:description" content="A test product description">
            <meta property="og:image" content="${baseUrl}/image.jpg">
          </head>
          <body>
            <h1>Test Product</h1>
            <p>This is a test product page.</p>
          </body>
        </html>
      `, {
        'Content-Type': 'text/html'
      });
  },

  /**
   * Mock AI service responses
   */
  mockAiService: (nock, baseUrl = 'https://api.openai.com') => {
    return nock(baseUrl)
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [{
          message: {
            content: JSON.stringify({
              title: '🚀 Revolutionary Test Product - Game Changer!',
              description: 'Discover this amazing product that will transform your workflow!',
              tags: ['revolutionary', 'game-changer', 'productivity']
            })
          }
        }]
      });
  },

  /**
   * Mock payment service responses
   */
  mockPaymentService: (nock, baseUrl = 'https://api.stripe.com') => {
    return nock(baseUrl)
      .post('/v1/payment_intents')
      .reply(200, {
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
        status: 'requires_payment_method'
      });
  },

  /**
   * Mock federation service responses
   */
  mockFederationService: (nock, baseUrl = 'https://federation.example.com') => {
    return nock(baseUrl)
      .get('/api/v1/federation/info')
      .reply(200, {
        name: 'Test Federation',
        version: '1.0.0',
        total_submissions: 100
      })
      .post('/api/v1/submissions')
      .reply(201, {
        id: 'fed_sub_123',
        status: 'accepted'
      });
  }
};

export default ApiTestHelper;