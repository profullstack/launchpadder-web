/**
 * Penalties Service Tests
 * Tests for progressive penalty system with warnings, restrictions, and bans
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { penaltiesService } from '../../src/lib/services/penalties-service.js';

describe('Penalties Service', () => {
  let supabaseStub;
  let clockStub;

  beforeEach(() => {
    // Mock Supabase client
    supabaseStub = {
      from: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      insert: sinon.stub().returnsThis(),
      update: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      gte: sinon.stub().returnsThis(),
      lt: sinon.stub().returnsThis(),
      order: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
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

  describe('applyPenalty', () => {
    it('should apply warning penalty for first offense', async () => {
      const userId = 'user-123';
      const penaltyData = {
        reason: 'Spam submission detected',
        severity: 1,
        evidence: { spam_score: 85 }
      };

      // Mock no previous penalties
      supabaseStub.data = [];
      supabaseStub.error = null;

      // Mock penalty insertion
      supabaseStub.single.resolves({
        data: {
          id: 'penalty-1',
          user_id: userId,
          penalty_type: 'warning',
          reason: penaltyData.reason,
          severity: 1,
          is_active: true,
          starts_at: new Date().toISOString()
        },
        error: null
      });

      const result = await penaltiesService.applyPenalty(userId, penaltyData);

      expect(result.success).to.be.true;
      expect(result.penaltyType).to.equal('warning');
      expect(result.severity).to.equal(1);
      expect(result.escalated).to.be.false;
    });

    it('should escalate to rate limiting for repeat offenses', async () => {
      const userId = 'user-456';
      const penaltyData = {
        reason: 'Multiple spam submissions',
        severity: 2
      };

      // Mock previous warning
      supabaseStub.data = [
        {
          id: 'penalty-1',
          penalty_type: 'warning',
          severity: 1,
          created_at: new Date(Date.now() - 86400000).toISOString() // 1 day ago
        }
      ];
      supabaseStub.error = null;

      supabaseStub.single.resolves({
        data: {
          id: 'penalty-2',
          user_id: userId,
          penalty_type: 'rate_limit',
          severity: 2,
          expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour
        },
        error: null
      });

      const result = await penaltiesService.applyPenalty(userId, penaltyData);

      expect(result.success).to.be.true;
      expect(result.penaltyType).to.equal('rate_limit');
      expect(result.escalated).to.be.true;
      expect(result.expiresAt).to.be.a('date');
    });

    it('should apply temporary ban for severe violations', async () => {
      const userId = 'user-789';
      const penaltyData = {
        reason: 'Harassment and abuse',
        severity: 4
      };

      // Mock previous penalties
      supabaseStub.data = [
        { penalty_type: 'warning', severity: 1 },
        { penalty_type: 'rate_limit', severity: 2 }
      ];
      supabaseStub.error = null;

      supabaseStub.single.resolves({
        data: {
          id: 'penalty-3',
          user_id: userId,
          penalty_type: 'temporary_ban',
          severity: 4,
          expires_at: new Date(Date.now() + 7 * 24 * 3600000).toISOString() // 7 days
        },
        error: null
      });

      const result = await penaltiesService.applyPenalty(userId, penaltyData);

      expect(result.success).to.be.true;
      expect(result.penaltyType).to.equal('temporary_ban');
      expect(result.severity).to.equal(4);
    });

    it('should apply permanent ban for extreme violations', async () => {
      const userId = 'user-999';
      const penaltyData = {
        reason: 'Repeated severe violations',
        severity: 4
      };

      // Mock extensive penalty history
      supabaseStub.data = [
        { penalty_type: 'warning', severity: 1 },
        { penalty_type: 'rate_limit', severity: 2 },
        { penalty_type: 'temporary_ban', severity: 3 },
        { penalty_type: 'temporary_ban', severity: 4 }
      ];
      supabaseStub.error = null;

      supabaseStub.single.resolves({
        data: {
          id: 'penalty-4',
          user_id: userId,
          penalty_type: 'permanent_ban',
          severity: 4,
          expires_at: null // Permanent
        },
        error: null
      });

      const result = await penaltiesService.applyPenalty(userId, penaltyData);

      expect(result.success).to.be.true;
      expect(result.penaltyType).to.equal('permanent_ban');
      expect(result.expiresAt).to.be.null;
    });

    it('should validate penalty data', async () => {
      const userId = 'user-123';
      const invalidPenalties = [
        { reason: '', severity: 1 }, // Empty reason
        { reason: 'Test', severity: 0 }, // Invalid severity
        { reason: 'Test', severity: 5 } // Invalid severity
      ];

      for (const invalidPenalty of invalidPenalties) {
        try {
          await penaltiesService.applyPenalty(userId, invalidPenalty);
          expect.fail('Should have thrown validation error');
        } catch (error) {
          expect(error.message).to.include('Invalid');
        }
      }
    });

    it('should handle database errors gracefully', async () => {
      const userId = 'user-123';
      const penaltyData = { reason: 'Test', severity: 1 };

      supabaseStub.data = null;
      supabaseStub.error = { message: 'Database connection failed' };

      try {
        await penaltiesService.applyPenalty(userId, penaltyData);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to apply penalty');
      }
    });
  });

  describe('checkUserPenalties', () => {
    it('should return active penalties for user', async () => {
      const userId = 'user-123';

      const mockPenalties = [
        {
          id: 'penalty-1',
          penalty_type: 'rate_limit',
          severity: 2,
          is_active: true,
          expires_at: new Date(Date.now() + 3600000).toISOString()
        },
        {
          id: 'penalty-2',
          penalty_type: 'warning',
          severity: 1,
          is_active: true,
          expires_at: null
        }
      ];

      supabaseStub.data = mockPenalties;
      supabaseStub.error = null;

      const result = await penaltiesService.checkUserPenalties(userId);

      expect(result.hasActivePenalties).to.be.true;
      expect(result.penalties).to.have.length(2);
      expect(result.highestSeverity).to.equal(2);
      expect(result.isBanned).to.be.false;
    });

    it('should detect banned users', async () => {
      const userId = 'user-456';

      const mockPenalties = [
        {
          id: 'penalty-1',
          penalty_type: 'permanent_ban',
          severity: 4,
          is_active: true,
          expires_at: null
        }
      ];

      supabaseStub.data = mockPenalties;
      supabaseStub.error = null;

      const result = await penaltiesService.checkUserPenalties(userId);

      expect(result.hasActivePenalties).to.be.true;
      expect(result.isBanned).to.be.true;
      expect(result.banType).to.equal('permanent');
    });

    it('should handle users with no penalties', async () => {
      const userId = 'user-789';

      supabaseStub.data = [];
      supabaseStub.error = null;

      const result = await penaltiesService.checkUserPenalties(userId);

      expect(result.hasActivePenalties).to.be.false;
      expect(result.penalties).to.have.length(0);
      expect(result.highestSeverity).to.equal(0);
      expect(result.isBanned).to.be.false;
    });

    it('should filter out expired penalties', async () => {
      const userId = 'user-101';

      const mockPenalties = [
        {
          id: 'penalty-1',
          penalty_type: 'rate_limit',
          is_active: true,
          expires_at: new Date(Date.now() - 3600000).toISOString() // Expired 1 hour ago
        },
        {
          id: 'penalty-2',
          penalty_type: 'warning',
          is_active: true,
          expires_at: new Date(Date.now() + 3600000).toISOString() // Expires in 1 hour
        }
      ];

      supabaseStub.data = mockPenalties;
      supabaseStub.error = null;

      const result = await penaltiesService.checkUserPenalties(userId);

      expect(result.hasActivePenalties).to.be.true;
      expect(result.penalties).to.have.length(1);
      expect(result.penalties[0].id).to.equal('penalty-2');
    });
  });

  describe('removePenalty', () => {
    it('should deactivate penalty', async () => {
      const penaltyId = 'penalty-123';
      const reason = 'Appeal approved';

      supabaseStub.single.resolves({
        data: {
          id: penaltyId,
          is_active: false,
          appeal_notes: reason
        },
        error: null
      });

      const result = await penaltiesService.removePenalty(penaltyId, reason);

      expect(result.success).to.be.true;
      expect(result.penaltyId).to.equal(penaltyId);
      expect(result.reason).to.equal(reason);
    });

    it('should handle non-existent penalty', async () => {
      const penaltyId = 'nonexistent';

      supabaseStub.single.resolves({
        data: null,
        error: null
      });

      const result = await penaltiesService.removePenalty(penaltyId, 'Test');

      expect(result.success).to.be.false;
      expect(result.error).to.include('not found');
    });
  });

  describe('getPenaltyHistory', () => {
    it('should return user penalty history', async () => {
      const userId = 'user-123';

      const mockHistory = [
        {
          id: 'penalty-1',
          penalty_type: 'warning',
          severity: 1,
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'penalty-2',
          penalty_type: 'rate_limit',
          severity: 2,
          created_at: '2024-01-02T00:00:00Z'
        }
      ];

      supabaseStub.data = mockHistory;
      supabaseStub.error = null;

      const result = await penaltiesService.getPenaltyHistory(userId);

      expect(result.history).to.have.length(2);
      expect(result.totalPenalties).to.equal(2);
      expect(result.escalationPattern).to.be.an('array');
    });

    it('should calculate escalation pattern', async () => {
      const userId = 'user-456';

      const mockHistory = [
        { penalty_type: 'warning', severity: 1 },
        { penalty_type: 'rate_limit', severity: 2 },
        { penalty_type: 'temporary_ban', severity: 3 }
      ];

      supabaseStub.data = mockHistory;
      supabaseStub.error = null;

      const result = await penaltiesService.getPenaltyHistory(userId);

      expect(result.escalationPattern).to.deep.equal(['warning', 'rate_limit', 'temporary_ban']);
      expect(result.isEscalating).to.be.true;
    });

    it('should handle pagination', async () => {
      const userId = 'user-789';
      const options = { page: 2, limit: 5 };

      supabaseStub.data = Array(5).fill().map((_, i) => ({
        id: `penalty-${i + 6}`,
        penalty_type: 'warning'
      }));
      supabaseStub.error = null;

      const result = await penaltiesService.getPenaltyHistory(userId, options);

      expect(result.pagination.page).to.equal(2);
      expect(result.pagination.limit).to.equal(5);
    });
  });

  describe('cleanupExpiredPenalties', () => {
    it('should deactivate expired penalties', async () => {
      supabaseStub.data = [
        { id: 'penalty-1' },
        { id: 'penalty-2' },
        { id: 'penalty-3' }
      ];
      supabaseStub.error = null;

      const result = await penaltiesService.cleanupExpiredPenalties();

      expect(result.deactivatedCount).to.equal(3);
    });

    it('should handle cleanup errors gracefully', async () => {
      supabaseStub.data = null;
      supabaseStub.error = { message: 'Cleanup failed' };

      try {
        await penaltiesService.cleanupExpiredPenalties();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to cleanup expired penalties');
      }
    });
  });

  describe('getPenaltyStatistics', () => {
    it('should return comprehensive penalty statistics', async () => {
      const mockStats = {
        total_penalties: 1000,
        active_penalties: 150,
        warnings: 600,
        rate_limits: 250,
        temporary_bans: 100,
        permanent_bans: 50
      };

      // Mock multiple database calls for stats
      supabaseStub.single
        .onCall(0).resolves({ data: { count: 1000 }, error: null })
        .onCall(1).resolves({ data: { count: 150 }, error: null });

      supabaseStub.data = [
        { penalty_type: 'warning', count: 600 },
        { penalty_type: 'rate_limit', count: 250 },
        { penalty_type: 'temporary_ban', count: 100 },
        { penalty_type: 'permanent_ban', count: 50 }
      ];
      supabaseStub.error = null;

      const result = await penaltiesService.getPenaltyStatistics();

      expect(result.totalPenalties).to.equal(1000);
      expect(result.activePenalties).to.equal(150);
      expect(result.penaltyTypeDistribution).to.have.length(4);
    });

    it('should calculate escalation rate', async () => {
      supabaseStub.single
        .onCall(0).resolves({ data: { count: 1000 }, error: null })
        .onCall(1).resolves({ data: { count: 150 }, error: null });

      supabaseStub.data = [
        { penalty_type: 'warning', count: 700 },
        { penalty_type: 'rate_limit', count: 200 },
        { penalty_type: 'temporary_ban', count: 80 },
        { penalty_type: 'permanent_ban', count: 20 }
      ];
      supabaseStub.error = null;

      const result = await penaltiesService.getPenaltyStatistics();

      expect(result.escalationRate).to.equal(30); // (300 non-warnings / 1000 total) * 100
    });
  });

  describe('bulkApplyPenalties', () => {
    it('should apply penalties to multiple users', async () => {
      const penalties = [
        { user_id: 'user-1', reason: 'Spam', severity: 1 },
        { user_id: 'user-2', reason: 'Spam', severity: 1 }
      ];

      supabaseStub.data = penalties.map((p, i) => ({
        id: `penalty-${i + 1}`,
        ...p,
        penalty_type: 'warning'
      }));
      supabaseStub.error = null;

      const result = await penaltiesService.bulkApplyPenalties(penalties);

      expect(result.success).to.be.true;
      expect(result.appliedCount).to.equal(2);
    });

    it('should validate bulk penalty data', async () => {
      const invalidPenalties = [
        { user_id: '', reason: 'Test', severity: 1 } // Empty user_id
      ];

      try {
        await penaltiesService.bulkApplyPenalties(invalidPenalties);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid user ID');
      }
    });
  });

  describe('getEscalationPath', () => {
    it('should return escalation path for user', async () => {
      const userId = 'user-123';

      // Mock penalty history
      supabaseStub.data = [
        { penalty_type: 'warning', severity: 1 },
        { penalty_type: 'rate_limit', severity: 2 }
      ];
      supabaseStub.error = null;

      const result = await penaltiesService.getEscalationPath(userId);

      expect(result.currentLevel).to.equal(2);
      expect(result.nextPenalty).to.equal('temporary_ban');
      expect(result.escalationHistory).to.have.length(2);
    });

    it('should handle users at maximum escalation', async () => {
      const userId = 'user-456';

      supabaseStub.data = [
        { penalty_type: 'permanent_ban', severity: 4 }
      ];
      supabaseStub.error = null;

      const result = await penaltiesService.getEscalationPath(userId);

      expect(result.currentLevel).to.equal(4);
      expect(result.nextPenalty).to.be.null;
      expect(result.atMaximum).to.be.true;
    });
  });

  describe('appealPenalty', () => {
    it('should submit penalty appeal', async () => {
      const penaltyId = 'penalty-123';
      const appealReason = 'This was a false positive';

      supabaseStub.single.resolves({
        data: {
          id: penaltyId,
          appeal_notes: appealReason,
          appeal_submitted_at: new Date().toISOString()
        },
        error: null
      });

      const result = await penaltiesService.appealPenalty(penaltyId, appealReason);

      expect(result.success).to.be.true;
      expect(result.penaltyId).to.equal(penaltyId);
      expect(result.appealReason).to.equal(appealReason);
    });

    it('should prevent duplicate appeals', async () => {
      const penaltyId = 'penalty-456';

      // Mock existing appeal
      supabaseStub.single.onFirstCall().resolves({
        data: {
          id: penaltyId,
          appeal_notes: 'Previous appeal'
        },
        error: null
      });

      const result = await penaltiesService.appealPenalty(penaltyId, 'New appeal');

      expect(result.success).to.be.false;
      expect(result.error).to.include('already been appealed');
    });
  });
});