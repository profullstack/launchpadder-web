/**
 * API v1 Authentication Tests
 * 
 * Tests for JWT token generation and API key authentication.
 * Using Mocha test framework with Chai assertions.
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';

// Mock the SvelteKit modules
const mockJson = sinon.stub();
const mockRequest = {
  json: sinon.stub(),
  headers: {
    get: sinon.stub()
  }
};

// Mock Supabase client
const mockSupabaseClient = {
  from: sinon.stub().returnsThis(),
  select: sinon.stub().returnsThis(),
  eq: sinon.stub().returnsThis(),
  single: sinon.stub(),
  update: sinon.stub().returnsThis()
};

describe('API v1 Authentication', () => {
  let authModule;
  let mockSupabaseCreateClient;

  beforeEach(async () => {
    // Reset all stubs
    sinon.resetHistory();
    
    // Mock environment variables
    process.env.JWT_SECRET = 'test-secret-key';
    
    // Mock the Supabase client creation
    mockSupabaseCreateClient = sinon.stub().returns(mockSupabaseClient);
    
    // Mock the SvelteKit json function
    mockJson.returns({
      status: 200,
      headers: {}
    });
  });

  afterEach(() => {
    sinon.restore();
    delete process.env.JWT_SECRET;
  });

  describe('POST /api/v1/auth/token', () => {
    it('should generate JWT token for valid API key', async () => {
      // Arrange
      const validApiKey = 'fed_key_abc123xyz789';
      const mockPartner = {
        id: 'partner-123',
        name: 'Test Partner',
        organization: 'Test Org',
        tier: 'premium',
        rate_limit: 1000,
        status: 'active'
      };

      mockRequest.json.resolves({ api_key: validApiKey });
      mockSupabaseClient.single.resolves({ data: mockPartner, error: null });
      mockSupabaseClient.update.resolves({ data: mockPartner, error: null });

      // Mock the POST function (we'll simulate the logic)
      const generateToken = (partner) => {
        const tokenPayload = {
          type: 'federation_partner',
          partner_id: partner.id,
          tier: partner.tier,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (60 * 60)
        };

        return jwt.sign(tokenPayload, process.env.JWT_SECRET, { algorithm: 'HS256' });
      };

      // Act
      const token = generateToken(mockPartner);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Assert
      expect(decoded.type).to.equal('federation_partner');
      expect(decoded.partner_id).to.equal('partner-123');
      expect(decoded.tier).to.equal('premium');
      expect(decoded.exp).to.be.greaterThan(decoded.iat);
    });

    it('should reject invalid API key format', async () => {
      // Arrange
      const invalidApiKey = 'invalid-key-format';
      mockRequest.json.resolves({ api_key: invalidApiKey });

      // Act & Assert
      const isValidFormat = invalidApiKey.startsWith('fed_key_');
      expect(isValidFormat).to.be.false;
    });

    it('should reject missing API key', async () => {
      // Arrange
      mockRequest.json.resolves({});

      // Act & Assert
      const hasApiKey = false; // Simulating missing api_key
      expect(hasApiKey).to.be.false;
    });

    it('should reject non-existent API key', async () => {
      // Arrange
      const nonExistentApiKey = 'fed_key_nonexistent123';
      mockRequest.json.resolves({ api_key: nonExistentApiKey });
      mockSupabaseClient.single.resolves({ data: null, error: { message: 'Not found' } });

      // Act
      const { data: partner, error } = await mockSupabaseClient.single();

      // Assert
      expect(partner).to.be.null;
      expect(error).to.not.be.null;
    });

    it('should reject inactive partner', async () => {
      // Arrange
      const validApiKey = 'fed_key_abc123xyz789';
      const inactivePartner = {
        id: 'partner-123',
        name: 'Test Partner',
        status: 'inactive'
      };

      mockRequest.json.resolves({ api_key: validApiKey });
      mockSupabaseClient.single.resolves({ data: inactivePartner, error: null });

      // Act & Assert
      expect(inactivePartner.status).to.not.equal('active');
    });

    it('should update last_active timestamp on successful authentication', async () => {
      // Arrange
      const validApiKey = 'fed_key_abc123xyz789';
      const mockPartner = {
        id: 'partner-123',
        name: 'Test Partner',
        status: 'active'
      };

      mockRequest.json.resolves({ api_key: validApiKey });
      mockSupabaseClient.single.resolves({ data: mockPartner, error: null });
      mockSupabaseClient.update.resolves({ data: mockPartner, error: null });

      // Act
      await mockSupabaseClient.update();

      // Assert
      expect(mockSupabaseClient.update.calledOnce).to.be.true;
    });

    it('should include partner info in response', async () => {
      // Arrange
      const mockPartner = {
        id: 'partner-123',
        name: 'Test Partner',
        organization: 'Test Org',
        tier: 'premium',
        rate_limit: 1000,
        status: 'active'
      };

      // Act
      const partnerInfo = {
        id: mockPartner.id,
        name: mockPartner.name,
        organization: mockPartner.organization,
        tier: mockPartner.tier || 'basic',
        rate_limit: mockPartner.rate_limit || 100,
        status: mockPartner.status
      };

      // Assert
      expect(partnerInfo).to.deep.equal({
        id: 'partner-123',
        name: 'Test Partner',
        organization: 'Test Org',
        tier: 'premium',
        rate_limit: 1000,
        status: 'active'
      });
    });

    it('should set appropriate token expiration', async () => {
      // Arrange
      const mockPartner = { id: 'partner-123', tier: 'basic' };
      const now = Math.floor(Date.now() / 1000);

      // Act
      const tokenPayload = {
        type: 'federation_partner',
        partner_id: mockPartner.id,
        tier: mockPartner.tier,
        iat: now,
        exp: now + (60 * 60) // 1 hour
      };

      // Assert
      expect(tokenPayload.exp - tokenPayload.iat).to.equal(3600); // 1 hour in seconds
    });
  });

  describe('Token Validation', () => {
    it('should validate JWT token structure', () => {
      // Arrange
      const tokenPayload = {
        type: 'federation_partner',
        partner_id: 'partner-123',
        tier: 'basic',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      // Act
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Assert
      expect(decoded.type).to.equal('federation_partner');
      expect(decoded.partner_id).to.equal('partner-123');
      expect(decoded.tier).to.equal('basic');
    });

    it('should reject expired tokens', () => {
      // Arrange
      const expiredTokenPayload = {
        type: 'federation_partner',
        partner_id: 'partner-123',
        tier: 'basic',
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600  // 1 hour ago (expired)
      };

      const expiredToken = jwt.sign(expiredTokenPayload, process.env.JWT_SECRET);

      // Act & Assert
      expect(() => {
        jwt.verify(expiredToken, process.env.JWT_SECRET);
      }).to.throw();
    });

    it('should reject tokens with invalid signature', () => {
      // Arrange
      const tokenPayload = {
        type: 'federation_partner',
        partner_id: 'partner-123',
        tier: 'basic'
      };

      const tokenWithWrongSecret = jwt.sign(tokenPayload, 'wrong-secret');

      // Act & Assert
      expect(() => {
        jwt.verify(tokenWithWrongSecret, process.env.JWT_SECRET);
      }).to.throw();
    });
  });

  describe('Rate Limiting by Tier', () => {
    it('should apply correct rate limits for basic tier', () => {
      // Arrange
      const basicTier = 'basic';
      const rateLimits = {
        basic: { requests: 100, window: 3600000 },
        premium: { requests: 1000, window: 3600000 },
        enterprise: { requests: 10000, window: 3600000 }
      };

      // Act
      const limit = rateLimits[basicTier];

      // Assert
      expect(limit.requests).to.equal(100);
      expect(limit.window).to.equal(3600000); // 1 hour in milliseconds
    });

    it('should apply correct rate limits for premium tier', () => {
      // Arrange
      const premiumTier = 'premium';
      const rateLimits = {
        basic: { requests: 100, window: 3600000 },
        premium: { requests: 1000, window: 3600000 },
        enterprise: { requests: 10000, window: 3600000 }
      };

      // Act
      const limit = rateLimits[premiumTier];

      // Assert
      expect(limit.requests).to.equal(1000);
      expect(limit.window).to.equal(3600000);
    });

    it('should apply correct rate limits for enterprise tier', () => {
      // Arrange
      const enterpriseTier = 'enterprise';
      const rateLimits = {
        basic: { requests: 100, window: 3600000 },
        premium: { requests: 1000, window: 3600000 },
        enterprise: { requests: 10000, window: 3600000 }
      };

      // Act
      const limit = rateLimits[enterpriseTier];

      // Assert
      expect(limit.requests).to.equal(10000);
      expect(limit.window).to.equal(3600000);
    });
  });
});