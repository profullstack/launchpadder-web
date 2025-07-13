/**
 * Content Freshness Monitor Service Tests
 * Tests for the content freshness monitoring system that tracks
 * submission freshness, schedules updates, and manages content lifecycle
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { ContentFreshnessMonitor } from '../../src/lib/services/content-freshness-monitor.js';

describe('ContentFreshnessMonitor', () => {
  let monitor;
  let mockSupabase;
  let clock;

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabase = {
      from: sinon.stub(),
      rpc: sinon.stub()
    };

    // Create mock query builder
    const mockQuery = {
      select: sinon.stub().returnsThis(),
      insert: sinon.stub().returnsThis(),
      update: sinon.stub().returnsThis(),
      delete: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      lt: sinon.stub().returnsThis(),
      gt: sinon.stub().returnsThis(),
      is: sinon.stub().returnsThis(),
      order: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
      single: sinon.stub(),
      then: sinon.stub()
    };

    mockSupabase.from.returns(mockQuery);

    monitor = new ContentFreshnessMonitor({
      supabase: mockSupabase,
      defaultPolicy: 'default',
      batchSize: 10
    });

    // Use fake timers for consistent testing
    clock = sinon.useFakeTimers(new Date('2024-01-15T10:00:00Z'));
  });

  afterEach(() => {
    sinon.restore();
    clock.restore();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultMonitor = new ContentFreshnessMonitor({ supabase: mockSupabase });
      
      expect(defaultMonitor.supabase).to.equal(mockSupabase);
      expect(defaultMonitor.defaultPolicy).to.equal('default');
      expect(defaultMonitor.batchSize).to.equal(50);
      expect(defaultMonitor.maxConcurrency).to.equal(5);
    });

    it('should initialize with custom options', () => {
      const customMonitor = new ContentFreshnessMonitor({
        supabase: mockSupabase,
        defaultPolicy: 'high_priority',
        batchSize: 25,
        maxConcurrency: 10
      });

      expect(customMonitor.defaultPolicy).to.equal('high_priority');
      expect(customMonitor.batchSize).to.equal(25);
      expect(customMonitor.maxConcurrency).to.equal(10);
    });
  });

  describe('checkSubmissionFreshness', () => {
    it('should check freshness for a single submission', async () => {
      const submissionId = 'test-submission-id';
      const mockSubmission = {
        id: submissionId,
        url: 'https://example.com',
        last_metadata_check: '2024-01-14T10:00:00Z',
        content_freshness_score: 85
      };

      mockSupabase.from().select().eq().single.resolves({ data: mockSubmission, error: null });
      mockSupabase.from().update().eq.resolves({ data: null, error: null });

      const result = await monitor.checkSubmissionFreshness(submissionId);

      expect(result).to.have.property('submissionId', submissionId);
      expect(result).to.have.property('previousScore', 85);
      expect(result).to.have.property('newScore');
      expect(result).to.have.property('needsUpdate');
      expect(mockSupabase.from).to.have.been.calledWith('submissions');
    });

    it('should handle submission not found', async () => {
      const submissionId = 'non-existent-id';
      
      mockSupabase.from().select().eq().single.resolves({ data: null, error: { code: 'PGRST116' } });

      await expect(monitor.checkSubmissionFreshness(submissionId))
        .to.be.rejectedWith('Submission not found');
    });

    it('should handle database errors gracefully', async () => {
      const submissionId = 'test-submission-id';
      
      mockSupabase.from().select().eq().single.resolves({ 
        data: null, 
        error: { message: 'Database connection failed' } 
      });

      await expect(monitor.checkSubmissionFreshness(submissionId))
        .to.be.rejectedWith('Failed to check submission freshness: Database connection failed');
    });
  });

  describe('calculateFreshnessScore', () => {
    it('should calculate score for fresh content', () => {
      const submission = {
        last_metadata_check: '2024-01-15T09:00:00Z', // 1 hour ago
        last_metadata_update: '2024-01-15T08:00:00Z', // 2 hours ago
        url_status_code: 200
      };

      const policy = {
        max_age_hours: 168, // 7 days
        stale_threshold_hours: 720 // 30 days
      };

      const score = monitor.calculateFreshnessScore(submission, policy);
      
      expect(score).to.be.at.least(90);
    });

    it('should calculate lower score for old content', () => {
      const submission = {
        last_metadata_check: '2024-01-08T10:00:00Z', // 7 days ago
        last_metadata_update: '2024-01-01T10:00:00Z', // 14 days ago
        url_status_code: 200
      };

      const policy = {
        max_age_hours: 168, // 7 days
        stale_threshold_hours: 720 // 30 days
      };

      const score = monitor.calculateFreshnessScore(submission, policy);
      
      expect(score).to.be.below(80);
    });

    it('should penalize failed URL checks', () => {
      const submission = {
        last_metadata_check: '2024-01-15T09:00:00Z',
        last_metadata_update: '2024-01-15T08:00:00Z',
        url_status_code: 404
      };

      const policy = {
        max_age_hours: 168,
        stale_threshold_hours: 720
      };

      const score = monitor.calculateFreshnessScore(submission, policy);
      
      expect(score).to.be.below(70);
    });

    it('should handle missing timestamps', () => {
      const submission = {
        last_metadata_check: null,
        last_metadata_update: null,
        url_status_code: 200
      };

      const policy = {
        max_age_hours: 168,
        stale_threshold_hours: 720
      };

      const score = monitor.calculateFreshnessScore(submission, policy);
      
      expect(score).to.be.a('number');
      expect(score).to.be.at.least(0);
      expect(score).to.be.at.most(100);
    });
  });

  describe('getStaleSubmissions', () => {
    it('should return submissions that need freshness checks', async () => {
      const mockSubmissions = [
        {
          id: 'submission-1',
          url: 'https://example1.com',
          last_metadata_check: '2024-01-14T10:00:00Z',
          content_freshness_score: 45
        },
        {
          id: 'submission-2',
          url: 'https://example2.com',
          last_metadata_check: '2024-01-13T10:00:00Z',
          content_freshness_score: 30
        }
      ];

      mockSupabase.from().select().lt().is().order().limit.resolves({ 
        data: mockSubmissions, 
        error: null 
      });

      const result = await monitor.getStaleSubmissions(10);

      expect(result).to.be.an('array');
      expect(result).to.have.length(2);
      expect(result[0]).to.have.property('id', 'submission-1');
      expect(mockSupabase.from).to.have.been.calledWith('submissions');
    });

    it('should handle empty results', async () => {
      mockSupabase.from().select().lt().is().order().limit.resolves({ 
        data: [], 
        error: null 
      });

      const result = await monitor.getStaleSubmissions(10);

      expect(result).to.be.an('array');
      expect(result).to.have.length(0);
    });

    it('should handle database errors', async () => {
      mockSupabase.from().select().lt().is().order().limit.resolves({ 
        data: null, 
        error: { message: 'Query failed' } 
      });

      await expect(monitor.getStaleSubmissions(10))
        .to.be.rejectedWith('Failed to get stale submissions: Query failed');
    });
  });

  describe('scheduleRefresh', () => {
    it('should schedule a refresh job for a submission', async () => {
      const submissionId = 'test-submission-id';
      const refreshType = 'metadata';
      const priority = 5;

      mockSupabase.from().insert.resolves({ data: null, error: null });

      const result = await monitor.scheduleRefresh(submissionId, refreshType, priority);

      expect(result).to.have.property('submissionId', submissionId);
      expect(result).to.have.property('refreshType', refreshType);
      expect(result).to.have.property('priority', priority);
      expect(result).to.have.property('scheduledAt');
      expect(mockSupabase.from).to.have.been.calledWith('content_refresh_queue');
    });

    it('should handle scheduling errors', async () => {
      const submissionId = 'test-submission-id';
      
      mockSupabase.from().insert.resolves({ 
        data: null, 
        error: { message: 'Insert failed' } 
      });

      await expect(monitor.scheduleRefresh(submissionId, 'metadata'))
        .to.be.rejectedWith('Failed to schedule refresh: Insert failed');
    });

    it('should validate refresh type', async () => {
      const submissionId = 'test-submission-id';
      const invalidRefreshType = 'invalid_type';

      await expect(monitor.scheduleRefresh(submissionId, invalidRefreshType))
        .to.be.rejectedWith('Invalid refresh type');
    });
  });

  describe('runFreshnessCheck', () => {
    it('should run freshness check for multiple submissions', async () => {
      const mockSubmissions = [
        { id: 'sub-1', url: 'https://example1.com' },
        { id: 'sub-2', url: 'https://example2.com' }
      ];

      sinon.stub(monitor, 'getStaleSubmissions').resolves(mockSubmissions);
      sinon.stub(monitor, 'checkSubmissionFreshness')
        .onFirstCall().resolves({ submissionId: 'sub-1', needsUpdate: true })
        .onSecondCall().resolves({ submissionId: 'sub-2', needsUpdate: false });
      sinon.stub(monitor, 'scheduleRefresh').resolves({});

      const result = await monitor.runFreshnessCheck();

      expect(result).to.have.property('checked', 2);
      expect(result).to.have.property('scheduled', 1);
      expect(result).to.have.property('errors', 0);
      expect(monitor.scheduleRefresh).to.have.been.calledOnce;
    });

    it('should handle errors during batch processing', async () => {
      const mockSubmissions = [
        { id: 'sub-1', url: 'https://example1.com' },
        { id: 'sub-2', url: 'https://example2.com' }
      ];

      sinon.stub(monitor, 'getStaleSubmissions').resolves(mockSubmissions);
      sinon.stub(monitor, 'checkSubmissionFreshness')
        .onFirstCall().resolves({ submissionId: 'sub-1', needsUpdate: true })
        .onSecondCall().rejects(new Error('Check failed'));
      sinon.stub(monitor, 'scheduleRefresh').resolves({});

      const result = await monitor.runFreshnessCheck();

      expect(result).to.have.property('checked', 1);
      expect(result).to.have.property('scheduled', 1);
      expect(result).to.have.property('errors', 1);
    });
  });

  describe('getFreshnessPolicy', () => {
    it('should return default policy when no specific policy found', async () => {
      const defaultPolicy = {
        name: 'default',
        max_age_hours: 168,
        stale_threshold_hours: 720,
        check_frequency_hours: 24
      };

      mockSupabase.from().select().eq().single.resolves({ 
        data: defaultPolicy, 
        error: null 
      });

      const result = await monitor.getFreshnessPolicy();

      expect(result).to.deep.equal(defaultPolicy);
      expect(mockSupabase.from).to.have.been.calledWith('content_freshness_policies');
    });

    it('should return specific policy when requested', async () => {
      const highPriorityPolicy = {
        name: 'high_priority',
        max_age_hours: 72,
        stale_threshold_hours: 336,
        check_frequency_hours: 12
      };

      mockSupabase.from().select().eq().single.resolves({ 
        data: highPriorityPolicy, 
        error: null 
      });

      const result = await monitor.getFreshnessPolicy('high_priority');

      expect(result).to.deep.equal(highPriorityPolicy);
    });

    it('should handle policy not found', async () => {
      mockSupabase.from().select().eq().single.resolves({ 
        data: null, 
        error: { code: 'PGRST116' } 
      });

      await expect(monitor.getFreshnessPolicy('non_existent'))
        .to.be.rejectedWith('Freshness policy not found');
    });
  });

  describe('updateFreshnessMetrics', () => {
    it('should update daily freshness metrics', async () => {
      mockSupabase.rpc.resolves({ data: null, error: null });

      const result = await monitor.updateFreshnessMetrics();

      expect(result).to.have.property('date');
      expect(result).to.have.property('success', true);
      expect(mockSupabase.rpc).to.have.been.calledWith('generate_daily_freshness_metrics');
    });

    it('should handle metrics update errors', async () => {
      mockSupabase.rpc.resolves({ 
        data: null, 
        error: { message: 'Function failed' } 
      });

      await expect(monitor.updateFreshnessMetrics())
        .to.be.rejectedWith('Failed to update freshness metrics: Function failed');
    });
  });

  describe('archiveStaleSubmissions', () => {
    it('should archive submissions based on policy', async () => {
      mockSupabase.rpc.resolves({ data: 5, error: null });

      const result = await monitor.archiveStaleSubmissions(720);

      expect(result).to.have.property('archivedCount', 5);
      expect(result).to.have.property('thresholdHours', 720);
      expect(mockSupabase.rpc).to.have.been.calledWith('archive_stale_submissions', { stale_threshold_hours: 720 });
    });

    it('should handle archival errors', async () => {
      mockSupabase.rpc.resolves({ 
        data: null, 
        error: { message: 'Archive failed' } 
      });

      await expect(monitor.archiveStaleSubmissions(720))
        .to.be.rejectedWith('Failed to archive stale submissions: Archive failed');
    });
  });
});