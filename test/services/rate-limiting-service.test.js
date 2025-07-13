/**
 * Rate Limiting Service Tests
 * Tests for comprehensive rate limiting with multiple tiers
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { rateLimitingService } from '../../src/lib/services/rate-limiting-service.js';

describe('Rate Limiting Service', () => {
  let supabaseStub;
  let clockStub;

  beforeEach(() => {
    // Mock Supabase client
    supabaseStub = {
      from: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      insert: sinon.stub().returnsThis(),
      update: sinon.stub().returnsThis(),
      upsert: sinon.stub().returnsThis(),
      delete: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      gte: sinon.stub().returnsThis(),
      lt: sinon.stub().returnsThis(),
      single: sinon.stub(),
      data: null,
      error: null
    };

    // Mock time for consistent testing
    clockStub = sinon.useFakeTimers(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    sinon.restore();
    clockStub.restore();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', async () => {
      // Mock rate limit config
      supabaseStub.single.resolves({
        data: {
          id: 'config-1',
          max_requests: 10,
          window_seconds: 60,
          burst_allowance: 2
        },
        error: null
      });

      // Mock tracking data - no existing record
      supabaseStub.single.onSecondCall().resolves({
        data: null,
        error: null
      });

      // Mock successful insert
      supabaseStub.single.onThirdCall().resolves({
        data: { id: 'tracking-1' },
        error: null
      });

      const result = await rateLimitingService.checkRateLimit('192.168.1.1', 'ip');

      expect(result.allowed).to.be.true;
      expect(result.remaining).to.equal(9);
      expect(result.resetTime).to.be.a('date');
    });

    it('should block requests exceeding rate limit', async () => {
      // Mock rate limit config
      supabaseStub.single.resolves({
        data: {
          id: 'config-1',
          max_requests: 10,
          window_seconds: 60,
          burst_allowance: 2
        },
        error: null
      });

      // Mock tracking data - at limit
      supabaseStub.single.onSecondCall().resolves({
        data: {
          id: 'tracking-1',
          request_count: 10,
          window_start: new Date('2024-01-01T00:00:00Z'),
          is_blocked: false
        },
        error: null
      });

      const result = await rateLimitingService.checkRateLimit('192.168.1.1', 'ip');

      expect(result.allowed).to.be.false;
      expect(result.remaining).to.equal(0);
      expect(result.retryAfter).to.be.a('number');
    });

    it('should handle burst allowance correctly', async () => {
      // Mock rate limit config with burst
      supabaseStub.single.resolves({
        data: {
          id: 'config-1',
          max_requests: 10,
          window_seconds: 60,
          burst_allowance: 5
        },
        error: null
      });

      // Mock tracking data - at normal limit but within burst
      supabaseStub.single.onSecondCall().resolves({
        data: {
          id: 'tracking-1',
          request_count: 12,
          window_start: new Date('2024-01-01T00:00:00Z'),
          is_blocked: false
        },
        error: null
      });

      const result = await rateLimitingService.checkRateLimit('192.168.1.1', 'ip');

      expect(result.allowed).to.be.true;
      expect(result.remaining).to.equal(3); // 15 total - 12 used = 3
    });

    it('should reset window when expired', async () => {
      // Mock rate limit config
      supabaseStub.single.resolves({
        data: {
          id: 'config-1',
          max_requests: 10,
          window_seconds: 60,
          burst_allowance: 2
        },
        error: null
      });

      // Mock tracking data - expired window
      supabaseStub.single.onSecondCall().resolves({
        data: {
          id: 'tracking-1',
          request_count: 10,
          window_start: new Date('2023-12-31T23:58:00Z'), // 2 minutes ago
          is_blocked: false
        },
        error: null
      });

      const result = await rateLimitingService.checkRateLimit('192.168.1.1', 'ip');

      expect(result.allowed).to.be.true;
      expect(result.remaining).to.equal(9);
    });

    it('should handle different rate limit types', async () => {
      const testCases = [
        { identifier: '192.168.1.1', type: 'ip' },
        { identifier: 'user-123', type: 'user' },
        { identifier: 'api-key-456', type: 'api_key' },
        { identifier: 'global', type: 'global' }
      ];

      for (const testCase of testCases) {
        supabaseStub.single.resolves({
          data: {
            id: 'config-1',
            max_requests: 100,
            window_seconds: 3600,
            burst_allowance: 10
          },
          error: null
        });

        supabaseStub.single.onSecondCall().resolves({
          data: null,
          error: null
        });

        const result = await rateLimitingService.checkRateLimit(
          testCase.identifier,
          testCase.type
        );

        expect(result.allowed).to.be.true;
        expect(result.type).to.equal(testCase.type);
      }
    });

    it('should handle database errors gracefully', async () => {
      supabaseStub.single.resolves({
        data: null,
        error: { message: 'Database connection failed' }
      });

      try {
        await rateLimitingService.checkRateLimit('192.168.1.1', 'ip');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to check rate limit');
      }
    });
  });

  describe('getRateLimitConfig', () => {
    it('should retrieve rate limit configuration by type', async () => {
      const mockConfig = {
        id: 'config-1',
        name: 'ip_anonymous_basic',
        type: 'ip',
        max_requests: 10,
        window_seconds: 60,
        burst_allowance: 2,
        is_active: true
      };

      supabaseStub.single.resolves({
        data: mockConfig,
        error: null
      });

      const result = await rateLimitingService.getRateLimitConfig('ip');

      expect(result).to.deep.equal(mockConfig);
    });

    it('should return null for non-existent config', async () => {
      supabaseStub.single.resolves({
        data: null,
        error: null
      });

      const result = await rateLimitingService.getRateLimitConfig('nonexistent');

      expect(result).to.be.null;
    });
  });

  describe('updateRateLimitConfig', () => {
    it('should update rate limit configuration', async () => {
      const configId = 'config-1';
      const updates = {
        max_requests: 20,
        window_seconds: 120
      };

      supabaseStub.single.resolves({
        data: { id: configId, ...updates },
        error: null
      });

      const result = await rateLimitingService.updateRateLimitConfig(configId, updates);

      expect(result.max_requests).to.equal(20);
      expect(result.window_seconds).to.equal(120);
    });

    it('should validate configuration updates', async () => {
      const configId = 'config-1';
      const invalidUpdates = {
        max_requests: -5, // Invalid negative value
        window_seconds: 0   // Invalid zero value
      };

      try {
        await rateLimitingService.updateRateLimitConfig(configId, invalidUpdates);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid configuration');
      }
    });
  });

  describe('cleanupExpiredTracking', () => {
    it('should remove expired tracking records', async () => {
      supabaseStub.data = { count: 5 };
      supabaseStub.error = null;

      const result = await rateLimitingService.cleanupExpiredTracking();

      expect(result.deletedCount).to.equal(5);
      expect(supabaseStub.from.calledWith('rate_limit_tracking')).to.be.true;
    });

    it('should handle cleanup errors gracefully', async () => {
      supabaseStub.data = null;
      supabaseStub.error = { message: 'Cleanup failed' };

      try {
        await rateLimitingService.cleanupExpiredTracking();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to cleanup expired tracking');
      }
    });
  });

  describe('getActiveBlocks', () => {
    it('should retrieve currently blocked identifiers', async () => {
      const mockBlocks = [
        {
          identifier: '192.168.1.100',
          blocked_until: new Date('2024-01-01T01:00:00Z'),
          config_name: 'ip_anonymous_basic'
        },
        {
          identifier: 'user-456',
          blocked_until: new Date('2024-01-01T02:00:00Z'),
          config_name: 'user_authenticated'
        }
      ];

      supabaseStub.data = mockBlocks;
      supabaseStub.error = null;

      const result = await rateLimitingService.getActiveBlocks();

      expect(result).to.have.length(2);
      expect(result[0].identifier).to.equal('192.168.1.100');
      expect(result[1].identifier).to.equal('user-456');
    });
  });

  describe('unblockIdentifier', () => {
    it('should remove block for specific identifier', async () => {
      supabaseStub.single.resolves({
        data: { id: 'tracking-1', is_blocked: false },
        error: null
      });

      const result = await rateLimitingService.unblockIdentifier('192.168.1.100');

      expect(result.success).to.be.true;
      expect(result.identifier).to.equal('192.168.1.100');
    });

    it('should handle non-existent identifier gracefully', async () => {
      supabaseStub.single.resolves({
        data: null,
        error: null
      });

      const result = await rateLimitingService.unblockIdentifier('nonexistent');

      expect(result.success).to.be.false;
      expect(result.message).to.include('not found');
    });
  });

  describe('getRateLimitStats', () => {
    it('should return comprehensive rate limiting statistics', async () => {
      const mockStats = {
        total_requests: 1000,
        blocked_requests: 50,
        active_blocks: 5,
        top_blocked_ips: [
          { ip_address: '192.168.1.100', block_count: 10 },
          { ip_address: '192.168.1.101', block_count: 8 }
        ]
      };

      // Mock multiple database calls for stats
      supabaseStub.single
        .onFirstCall().resolves({ data: { count: 1000 }, error: null })
        .onSecondCall().resolves({ data: { count: 50 }, error: null })
        .onThirdCall().resolves({ data: { count: 5 }, error: null });

      supabaseStub.data = mockStats.top_blocked_ips;
      supabaseStub.error = null;

      const result = await rateLimitingService.getRateLimitStats();

      expect(result.totalRequests).to.equal(1000);
      expect(result.blockedRequests).to.equal(50);
      expect(result.activeBlocks).to.equal(5);
      expect(result.blockRate).to.equal(5); // 50/1000 * 100
    });
  });
});