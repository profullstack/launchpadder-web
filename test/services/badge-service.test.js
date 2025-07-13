// Badge Service Test Suite
// Testing Framework: Mocha with Chai assertions
// This test suite covers the badge service functionality including
// badge management, earning logic, verification, and analytics

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { BadgeService } from '../../src/lib/services/badge-service.js';

describe('BadgeService', () => {
  let badgeService;
  let mockSupabaseClient;
  let mockUserId;
  let mockBadgeId;

  beforeEach(() => {
    // Mock user and badge IDs
    mockUserId = 'user-123-456-789';
    mockBadgeId = 'badge-123-456-789';

    // Mock Supabase client
    mockSupabaseClient = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
            limit: () => Promise.resolve({ data: [], error: null })
          }),
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null })
          }),
          limit: () => Promise.resolve({ data: [], error: null })
        }),
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => ({
          eq: () => Promise.resolve({ data: null, error: null })
        }),
        delete: () => ({
          eq: () => Promise.resolve({ data: null, error: null })
        })
      }),
      rpc: () => Promise.resolve({ data: null, error: null })
    };

    badgeService = new BadgeService(mockSupabaseClient);
  });

  afterEach(() => {
    // Clean up any test data
    badgeService = null;
  });

  describe('Constructor', () => {
    it('should create a BadgeService instance with supabase client', () => {
      expect(badgeService).to.be.instanceOf(BadgeService);
      expect(badgeService.supabase).to.equal(mockSupabaseClient);
    });

    it('should throw error if no supabase client provided', () => {
      expect(() => new BadgeService()).to.throw('Supabase client is required');
    });
  });

  describe('Badge Definitions Management', () => {
    describe('getBadgeDefinitions()', () => {
      it('should return all active badge definitions', async () => {
        const mockBadges = [
          {
            id: 'badge-1',
            slug: 'verified-federation-partner',
            name: 'Verified Federation Partner',
            category: 'federation',
            level: 'gold'
          }
        ];

        mockSupabaseClient.from = () => ({
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: mockBadges, error: null })
            })
          })
        });

        const result = await badgeService.getBadgeDefinitions();
        expect(result.success).to.be.true;
        expect(result.data).to.deep.equal(mockBadges);
      });

      it('should handle database errors gracefully', async () => {
        mockSupabaseClient.from = () => ({
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ 
                data: null, 
                error: { message: 'Database error' } 
              })
            })
          })
        });

        const result = await badgeService.getBadgeDefinitions();
        expect(result.success).to.be.false;
        expect(result.error).to.include('Database error');
      });
    });

    describe('getBadgeDefinition()', () => {
      it('should return specific badge definition by slug', async () => {
        const mockBadge = {
          id: 'badge-1',
          slug: 'verified-federation-partner',
          name: 'Verified Federation Partner'
        };

        mockSupabaseClient.from = () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: mockBadge, error: null })
            })
          })
        });

        const result = await badgeService.getBadgeDefinition('verified-federation-partner');
        expect(result.success).to.be.true;
        expect(result.data).to.deep.equal(mockBadge);
      });

      it('should return error for non-existent badge', async () => {
        mockSupabaseClient.from = () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ 
                data: null, 
                error: { message: 'Badge not found' } 
              })
            })
          })
        });

        const result = await badgeService.getBadgeDefinition('non-existent-badge');
        expect(result.success).to.be.false;
        expect(result.error).to.include('Badge not found');
      });
    });
  });

  describe('User Badge Management', () => {
    describe('getUserBadges()', () => {
      it('should return all badges for a user', async () => {
        const mockUserBadges = [
          {
            badge_id: 'badge-1',
            badge_slug: 'active-community-member',
            badge_name: 'Active Community Member',
            earned_at: '2025-01-01T00:00:00Z'
          }
        ];

        mockSupabaseClient.rpc = () => Promise.resolve({ 
          data: mockUserBadges, 
          error: null 
        });

        const result = await badgeService.getUserBadges(mockUserId);
        expect(result.success).to.be.true;
        expect(result.data).to.deep.equal(mockUserBadges);
      });

      it('should handle invalid user ID', async () => {
        const result = await badgeService.getUserBadges(null);
        expect(result.success).to.be.false;
        expect(result.error).to.include('User ID is required');
      });
    });

    describe('awardBadge()', () => {
      it('should successfully award a badge to a user', async () => {
        const mockUserBadgeId = 'user-badge-123';
        
        mockSupabaseClient.rpc = () => Promise.resolve({ 
          data: mockUserBadgeId, 
          error: null 
        });

        const result = await badgeService.awardBadge(
          mockUserId,
          'active-community-member',
          'automatic',
          null,
          'Met community engagement criteria'
        );

        expect(result.success).to.be.true;
        expect(result.data).to.equal(mockUserBadgeId);
      });

      it('should handle badge awarding errors', async () => {
        mockSupabaseClient.rpc = () => Promise.resolve({ 
          data: null, 
          error: { message: 'User already has this badge' } 
        });

        const result = await badgeService.awardBadge(
          mockUserId,
          'active-community-member'
        );

        expect(result.success).to.be.false;
        expect(result.error).to.include('User already has this badge');
      });

      it('should validate required parameters', async () => {
        const result = await badgeService.awardBadge(null, 'badge-slug');
        expect(result.success).to.be.false;
        expect(result.error).to.include('User ID and badge slug are required');
      });
    });

    describe('revokeBadge()', () => {
      it('should successfully revoke a badge from a user', async () => {
        mockSupabaseClient.rpc = () => Promise.resolve({ 
          data: true, 
          error: null 
        });

        const result = await badgeService.revokeBadge(
          mockUserId,
          'active-community-member',
          'admin-123',
          'Policy violation'
        );

        expect(result.success).to.be.true;
        expect(result.data).to.be.true;
      });

      it('should handle revocation errors', async () => {
        mockSupabaseClient.rpc = () => Promise.resolve({ 
          data: false, 
          error: null 
        });

        const result = await badgeService.revokeBadge(
          mockUserId,
          'non-existent-badge',
          'admin-123',
          'Test reason'
        );

        expect(result.success).to.be.false;
        expect(result.error).to.include('Failed to revoke badge');
      });
    });
  });

  describe('Badge Criteria and Earning Logic', () => {
    describe('checkBadgeCriteria()', () => {
      it('should check if user meets badge criteria', async () => {
        const mockCriteriaResult = {
          min_submissions: { required: 3, current: 5, met: true },
          min_votes_given: { required: 20, current: 25, met: true },
          all_criteria_met: true
        };

        mockSupabaseClient.rpc = () => Promise.resolve({ 
          data: mockCriteriaResult, 
          error: null 
        });

        const result = await badgeService.checkBadgeCriteria(
          mockUserId,
          'active-community-member'
        );

        expect(result.success).to.be.true;
        expect(result.data.all_criteria_met).to.be.true;
      });

      it('should handle criteria check errors', async () => {
        mockSupabaseClient.rpc = () => Promise.resolve({ 
          data: null, 
          error: { message: 'Badge not found' } 
        });

        const result = await badgeService.checkBadgeCriteria(
          mockUserId,
          'non-existent-badge'
        );

        expect(result.success).to.be.false;
        expect(result.error).to.include('Badge not found');
      });
    });

    describe('autoCheckAndAwardBadges()', () => {
      it('should automatically check and award eligible badges', async () => {
        const mockAwardedBadges = ['active-community-member'];

        mockSupabaseClient.rpc = () => Promise.resolve({ 
          data: mockAwardedBadges, 
          error: null 
        });

        const result = await badgeService.autoCheckAndAwardBadges(mockUserId);
        expect(result.success).to.be.true;
        expect(result.data).to.deep.equal(mockAwardedBadges);
      });
    });
  });

  describe('Badge Verification', () => {
    describe('verifyBadge()', () => {
      it('should create badge verification record', async () => {
        const mockVerificationData = {
          signature_hash: 'abc123',
          public_key: 'key123',
          verification_payload: { badge_id: mockBadgeId, user_id: mockUserId }
        };

        mockSupabaseClient.from = () => ({
          insert: () => Promise.resolve({ 
            data: [{ id: 'verification-123' }], 
            error: null 
          })
        });

        const result = await badgeService.verifyBadge(
          'user-badge-123',
          mockVerificationData
        );

        expect(result.success).to.be.true;
        expect(result.data).to.have.property('id');
      });

      it('should validate verification data', async () => {
        const result = await badgeService.verifyBadge('user-badge-123', {});
        expect(result.success).to.be.false;
        expect(result.error).to.include('signature_hash is required');
      });
    });

    describe('validateBadgeSignature()', () => {
      it('should validate badge signature', async () => {
        const mockSignature = 'valid-signature-hash';
        const mockPayload = { badge_id: mockBadgeId, user_id: mockUserId };

        // Mock crypto validation (simplified for testing)
        const result = await badgeService.validateBadgeSignature(
          mockSignature,
          mockPayload,
          'public-key-123'
        );

        expect(result.success).to.be.true;
        expect(result.data.isValid).to.be.a('boolean');
      });
    });
  });

  describe('Badge Analytics', () => {
    describe('getBadgeStats()', () => {
      it('should return badge statistics', async () => {
        const mockStats = {
          total_awarded: 150,
          total_active: 145,
          unique_recipients: 140,
          recent_awards: 5
        };

        mockSupabaseClient.rpc = () => Promise.resolve({ 
          data: [mockStats], 
          error: null 
        });

        const result = await badgeService.getBadgeStats('active-community-member');
        expect(result.success).to.be.true;
        expect(result.data.total_awarded).to.equal(150);
      });
    });

    describe('getBadgeLeaderboard()', () => {
      it('should return badge leaderboard', async () => {
        const mockLeaderboard = [
          {
            user_id: 'user-1',
            username: 'alice',
            badge_count: 5,
            latest_badge_earned_at: '2025-01-01T00:00:00Z'
          }
        ];

        mockSupabaseClient.rpc = () => Promise.resolve({ 
          data: mockLeaderboard, 
          error: null 
        });

        const result = await badgeService.getBadgeLeaderboard();
        expect(result.success).to.be.true;
        expect(result.data).to.deep.equal(mockLeaderboard);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockSupabaseClient.from = () => {
        throw new Error('Network error');
      };

      const result = await badgeService.getBadgeDefinitions();
      expect(result.success).to.be.false;
      expect(result.error).to.include('Network error');
    });

    it('should handle malformed responses', async () => {
      mockSupabaseClient.rpc = () => Promise.resolve({ 
        data: 'invalid-data', 
        error: null 
      });

      const result = await badgeService.getUserBadges(mockUserId);
      expect(result.success).to.be.false;
      expect(result.error).to.include('Invalid response format');
    });
  });

  describe('Input Validation', () => {
    it('should validate user ID format', () => {
      const isValid = badgeService.validateUserId('user-123-456-789');
      expect(isValid).to.be.true;

      const isInvalid = badgeService.validateUserId('invalid-id');
      expect(isInvalid).to.be.false;
    });

    it('should validate badge slug format', () => {
      const isValid = badgeService.validateBadgeSlug('active-community-member');
      expect(isValid).to.be.true;

      const isInvalid = badgeService.validateBadgeSlug('Invalid Badge Slug!');
      expect(isInvalid).to.be.false;
    });
  });
});