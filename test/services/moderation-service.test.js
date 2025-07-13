/**
 * Moderation Service Tests
 * Tests for content moderation, approval workflows, and admin management
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import { ModerationService } from '../../src/lib/services/moderation-service.js';

describe('ModerationService', () => {
  let moderationService;
  let mockSupabase;
  let mockAIService;
  
  beforeEach(() => {
    // Mock Supabase client
    mockSupabase = {
      from: sinon.stub(),
      rpc: sinon.stub()
    };
    
    // Mock AI Service for content analysis
    mockAIService = {
      analyzeContent: sinon.stub(),
      detectInappropriateContent: sinon.stub()
    };
    
    // Create service instance
    moderationService = new ModerationService({
      supabase: mockSupabase,
      aiService: mockAIService
    });
  });
  
  afterEach(() => {
    sinon.restore();
  });
  
  describe('constructor', () => {
    it('should create an instance with required dependencies', () => {
      expect(moderationService).to.be.instanceOf(ModerationService);
      expect(moderationService.supabase).to.equal(mockSupabase);
      expect(moderationService.aiService).to.equal(mockAIService);
    });
    
    it('should throw error if no Supabase client provided', () => {
      expect(() => new ModerationService({})).to.throw('Supabase client is required');
    });
    
    it('should work without AI service (optional)', () => {
      const service = new ModerationService({ supabase: mockSupabase });
      expect(service.aiService).to.be.null;
    });
  });
  
  describe('submitForReview', () => {
    it('should submit submission for moderation review', async () => {
      const submissionId = 'sub-123';
      const userId = 'user-456';
      
      const mockUpdate = {
        update: sinon.stub().returnsThis(),
        eq: sinon.stub().returnsThis(),
        select: sinon.stub().resolves({
          data: [{ id: submissionId, status: 'pending_review' }],
          error: null
        })
      };
      
      mockSupabase.from.withArgs('submissions').returns(mockUpdate);
      
      const result = await moderationService.submitForReview(submissionId, userId);
      
      expect(mockSupabase.from).to.have.been.calledWith('submissions');
      expect(mockUpdate.update).to.have.been.calledWith({
        status: 'pending_review',
        submitted_for_review_at: sinon.match.string,
        updated_at: sinon.match.string
      });
      expect(result.status).to.equal('pending_review');
    });
    
    it('should validate submission ID', async () => {
      await expect(moderationService.submitForReview('', 'user-123'))
        .to.be.rejectedWith('Submission ID is required');
    });
    
    it('should validate user ID', async () => {
      await expect(moderationService.submitForReview('sub-123', ''))
        .to.be.rejectedWith('User ID is required');
    });
  });
  
  describe('reviewSubmission', () => {
    it('should approve submission with moderator notes', async () => {
      const submissionId = 'sub-123';
      const moderatorId = 'mod-456';
      const decision = 'approved';
      const notes = 'Looks good, approved for publication';
      
      const mockUpdate = {
        update: sinon.stub().returnsThis(),
        eq: sinon.stub().returnsThis(),
        select: sinon.stub().resolves({
          data: [{ id: submissionId, status: 'approved' }],
          error: null
        })
      };
      
      const mockInsert = {
        insert: sinon.stub().resolves({ data: [{}], error: null })
      };
      
      mockSupabase.from.withArgs('submissions').returns(mockUpdate);
      mockSupabase.from.withArgs('moderation_reviews').returns(mockInsert);
      
      const result = await moderationService.reviewSubmission(
        submissionId,
        moderatorId,
        decision,
        notes
      );
      
      expect(mockUpdate.update).to.have.been.calledWith({
        status: 'approved',
        reviewed_by: moderatorId,
        reviewed_at: sinon.match.string,
        updated_at: sinon.match.string
      });
      
      expect(mockInsert.insert).to.have.been.calledWith({
        submission_id: submissionId,
        moderator_id: moderatorId,
        decision,
        notes,
        reviewed_at: sinon.match.string
      });
      
      expect(result.status).to.equal('approved');
    });
    
    it('should reject submission with reason', async () => {
      const submissionId = 'sub-123';
      const moderatorId = 'mod-456';
      const decision = 'rejected';
      const notes = 'Content violates community guidelines';
      
      const mockUpdate = {
        update: sinon.stub().returnsThis(),
        eq: sinon.stub().returnsThis(),
        select: sinon.stub().resolves({
          data: [{ id: submissionId, status: 'rejected' }],
          error: null
        })
      };
      
      const mockInsert = {
        insert: sinon.stub().resolves({ data: [{}], error: null })
      };
      
      mockSupabase.from.withArgs('submissions').returns(mockUpdate);
      mockSupabase.from.withArgs('moderation_reviews').returns(mockInsert);
      
      const result = await moderationService.reviewSubmission(
        submissionId,
        moderatorId,
        decision,
        notes
      );
      
      expect(result.status).to.equal('rejected');
    });
    
    it('should validate decision values', async () => {
      await expect(moderationService.reviewSubmission(
        'sub-123',
        'mod-456',
        'invalid',
        'notes'
      )).to.be.rejectedWith('Invalid decision');
    });
    
    it('should require notes for rejection', async () => {
      await expect(moderationService.reviewSubmission(
        'sub-123',
        'mod-456',
        'rejected',
        ''
      )).to.be.rejectedWith('Notes are required for rejection');
    });
  });
  
  describe('getPendingSubmissions', () => {
    it('should return paginated pending submissions', async () => {
      const mockSubmissions = [
        { id: 'sub-1', title: 'Test 1', status: 'pending_review' },
        { id: 'sub-2', title: 'Test 2', status: 'pending_review' }
      ];
      
      const mockQuery = {
        select: sinon.stub().returnsThis(),
        eq: sinon.stub().returnsThis(),
        order: sinon.stub().returnsThis(),
        range: sinon.stub().resolves({
          data: mockSubmissions,
          error: null,
          count: 2
        })
      };
      
      mockSupabase.from.withArgs('submissions').returns(mockQuery);
      
      const result = await moderationService.getPendingSubmissions(0, 10);
      
      expect(mockQuery.select).to.have.been.called;
      expect(mockQuery.eq).to.have.been.calledWith('status', 'pending_review');
      expect(mockQuery.order).to.have.been.calledWith('submitted_for_review_at', { ascending: true });
      expect(result.submissions).to.deep.equal(mockSubmissions);
      expect(result.total).to.equal(2);
    });
    
    it('should handle pagination parameters', async () => {
      const mockQuery = {
        select: sinon.stub().returnsThis(),
        eq: sinon.stub().returnsThis(),
        order: sinon.stub().returnsThis(),
        range: sinon.stub().resolves({ data: [], error: null, count: 0 })
      };
      
      mockSupabase.from.returns(mockQuery);
      
      await moderationService.getPendingSubmissions(20, 10);
      
      expect(mockQuery.range).to.have.been.calledWith(20, 29);
    });
  });
  
  describe('getModerationHistory', () => {
    it('should return moderation history for submission', async () => {
      const submissionId = 'sub-123';
      const mockHistory = [
        {
          id: 'review-1',
          decision: 'approved',
          notes: 'Good content',
          moderator_id: 'mod-1',
          reviewed_at: '2024-01-01T00:00:00Z'
        }
      ];
      
      const mockQuery = {
        select: sinon.stub().returnsThis(),
        eq: sinon.stub().returnsThis(),
        order: sinon.stub().resolves({
          data: mockHistory,
          error: null
        })
      };
      
      mockSupabase.from.withArgs('moderation_reviews').returns(mockQuery);
      
      const result = await moderationService.getModerationHistory(submissionId);
      
      expect(mockQuery.eq).to.have.been.calledWith('submission_id', submissionId);
      expect(result).to.deep.equal(mockHistory);
    });
  });
  
  describe('autoModerate', () => {
    it('should automatically moderate content using AI', async () => {
      const submission = {
        id: 'sub-123',
        title: 'Test Product',
        description: 'A great product for everyone',
        url: 'https://example.com'
      };
      
      mockAIService.detectInappropriateContent.resolves({
        isInappropriate: false,
        confidence: 0.95,
        categories: [],
        reasons: []
      });
      
      const result = await moderationService.autoModerate(submission);
      
      expect(mockAIService.detectInappropriateContent).to.have.been.calledWith({
        title: submission.title,
        description: submission.description,
        url: submission.url
      });
      
      expect(result.action).to.equal('approve');
      expect(result.confidence).to.equal(0.95);
    });
    
    it('should flag inappropriate content', async () => {
      const submission = {
        id: 'sub-123',
        title: 'Spam Product',
        description: 'Buy now! Limited time offer!',
        url: 'https://spam.com'
      };
      
      mockAIService.detectInappropriateContent.resolves({
        isInappropriate: true,
        confidence: 0.89,
        categories: ['spam', 'promotional'],
        reasons: ['Excessive promotional language', 'Suspicious URL']
      });
      
      const result = await moderationService.autoModerate(submission);
      
      expect(result.action).to.equal('flag');
      expect(result.categories).to.include('spam');
      expect(result.reasons).to.include('Excessive promotional language');
    });
    
    it('should handle AI service errors gracefully', async () => {
      const submission = { id: 'sub-123', title: 'Test', description: 'Test' };
      
      mockAIService.detectInappropriateContent.rejects(new Error('AI service unavailable'));
      
      const result = await moderationService.autoModerate(submission);
      
      expect(result.action).to.equal('manual_review');
      expect(result.error).to.include('AI service unavailable');
    });
    
    it('should work without AI service', async () => {
      const serviceWithoutAI = new ModerationService({ supabase: mockSupabase });
      const submission = { id: 'sub-123', title: 'Test', description: 'Test' };
      
      const result = await serviceWithoutAI.autoModerate(submission);
      
      expect(result.action).to.equal('manual_review');
      expect(result.reason).to.equal('AI service not available');
    });
  });
  
  describe('getModerationStats', () => {
    it('should return moderation statistics', async () => {
      const mockStats = {
        pending_count: 5,
        approved_today: 12,
        rejected_today: 3,
        avg_review_time_hours: 2.5
      };
      
      mockSupabase.rpc.withArgs('get_moderation_stats').resolves({
        data: mockStats,
        error: null
      });
      
      const result = await moderationService.getModerationStats();
      
      expect(result).to.deep.equal(mockStats);
    });
  });
  
  describe('assignModerator', () => {
    it('should assign moderator to submission', async () => {
      const submissionId = 'sub-123';
      const moderatorId = 'mod-456';
      
      const mockUpdate = {
        update: sinon.stub().returnsThis(),
        eq: sinon.stub().returnsThis(),
        select: sinon.stub().resolves({
          data: [{ id: submissionId, assigned_moderator: moderatorId }],
          error: null
        })
      };
      
      mockSupabase.from.withArgs('submissions').returns(mockUpdate);
      
      const result = await moderationService.assignModerator(submissionId, moderatorId);
      
      expect(mockUpdate.update).to.have.been.calledWith({
        assigned_moderator: moderatorId,
        assigned_at: sinon.match.string,
        updated_at: sinon.match.string
      });
      
      expect(result.assigned_moderator).to.equal(moderatorId);
    });
  });
  
  describe('escalateSubmission', () => {
    it('should escalate submission to senior moderator', async () => {
      const submissionId = 'sub-123';
      const reason = 'Complex content requiring senior review';
      const escalatedBy = 'mod-456';
      
      const mockUpdate = {
        update: sinon.stub().returnsThis(),
        eq: sinon.stub().returnsThis(),
        select: sinon.stub().resolves({
          data: [{ id: submissionId, status: 'escalated' }],
          error: null
        })
      };
      
      const mockInsert = {
        insert: sinon.stub().resolves({ data: [{}], error: null })
      };
      
      mockSupabase.from.withArgs('submissions').returns(mockUpdate);
      mockSupabase.from.withArgs('moderation_escalations').returns(mockInsert);
      
      const result = await moderationService.escalateSubmission(
        submissionId,
        reason,
        escalatedBy
      );
      
      expect(mockUpdate.update).to.have.been.calledWith({
        status: 'escalated',
        escalated_at: sinon.match.string,
        updated_at: sinon.match.string
      });
      
      expect(mockInsert.insert).to.have.been.calledWith({
        submission_id: submissionId,
        reason,
        escalated_by: escalatedBy,
        escalated_at: sinon.match.string
      });
      
      expect(result.status).to.equal('escalated');
    });
  });
  
  describe('bulkModerate', () => {
    it('should moderate multiple submissions at once', async () => {
      const submissionIds = ['sub-1', 'sub-2', 'sub-3'];
      const moderatorId = 'mod-456';
      const decision = 'approved';
      const notes = 'Bulk approval';
      
      const mockUpdate = {
        update: sinon.stub().returnsThis(),
        in: sinon.stub().returnsThis(),
        select: sinon.stub().resolves({
          data: submissionIds.map(id => ({ id, status: 'approved' })),
          error: null
        })
      };
      
      const mockInsert = {
        insert: sinon.stub().resolves({ data: [], error: null })
      };
      
      mockSupabase.from.withArgs('submissions').returns(mockUpdate);
      mockSupabase.from.withArgs('moderation_reviews').returns(mockInsert);
      
      const result = await moderationService.bulkModerate(
        submissionIds,
        moderatorId,
        decision,
        notes
      );
      
      expect(mockUpdate.in).to.have.been.calledWith('id', submissionIds);
      expect(result.updated).to.equal(3);
      expect(result.submissions).to.have.length(3);
    });
    
    it('should validate bulk operation limits', async () => {
      const tooManyIds = Array.from({ length: 101 }, (_, i) => `sub-${i}`);
      
      await expect(moderationService.bulkModerate(
        tooManyIds,
        'mod-456',
        'approved',
        'notes'
      )).to.be.rejectedWith('Cannot moderate more than 100 submissions at once');
    });
  });
  
  describe('getModeratorWorkload', () => {
    it('should return moderator workload statistics', async () => {
      const moderatorId = 'mod-456';
      const mockWorkload = {
        assigned_count: 5,
        completed_today: 8,
        avg_review_time_minutes: 15,
        pending_escalations: 2
      };
      
      mockSupabase.rpc.withArgs('get_moderator_workload').resolves({
        data: mockWorkload,
        error: null
      });
      
      const result = await moderationService.getModeratorWorkload(moderatorId);
      
      expect(mockSupabase.rpc).to.have.been.calledWith('get_moderator_workload', {
        moderator_uuid: moderatorId
      });
      expect(result).to.deep.equal(mockWorkload);
    });
  });
  
  describe('validateModerationDecision', () => {
    it('should validate approved decision', () => {
      expect(() => moderationService.validateModerationDecision('approved', 'Good content'))
        .to.not.throw();
    });
    
    it('should validate rejected decision with notes', () => {
      expect(() => moderationService.validateModerationDecision('rejected', 'Spam content'))
        .to.not.throw();
    });
    
    it('should reject invalid decision', () => {
      expect(() => moderationService.validateModerationDecision('invalid', 'notes'))
        .to.throw('Invalid decision');
    });
    
    it('should require notes for rejection', () => {
      expect(() => moderationService.validateModerationDecision('rejected', ''))
        .to.throw('Notes are required for rejection');
    });
  });
});