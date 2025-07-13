// test/services/content-freshness-monitor.test.js
// Test suite for ContentFreshnessMonitor service using Mocha and Chai

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { ContentFreshnessMonitor } from '../../src/lib/services/content-freshness-monitor.js';

describe('ContentFreshnessMonitor', () => {
  let monitor;
  let mockSupabase;
  let mockLogger;
  let clock;

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabase = {
      from: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      insert: sinon.stub().returnsThis(),
      update: sinon.stub().returnsThis(),
      delete: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      lt: sinon.stub().returnsThis(),
      gte: sinon.stub().returnsThis(),
      order: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
      single: sinon.stub().returnsThis(),
      rpc: sinon.stub().returnsThis(),
    };

    // Create mock logger
    mockLogger = {
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      debug: sinon.stub(),
    };

    // Create monitor instance
    monitor = new ContentFreshnessMonitor(mockSupabase, mockLogger);

    // Setup fake timers
    clock = sinon.useFakeTimers(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    sinon.restore();
    clock.restore();
  });

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(monitor).to.be.instanceOf(ContentFreshnessMonitor);
      expect(monitor.supabase).to.equal(mockSupabase);
      expect(monitor.logger).to.equal(mockLogger);
    });

    it('should throw error if supabase client is not provided', () => {
      expect(() => new ContentFreshnessMonitor(null, mockLogger)).to.throw(
        'Supabase client is required'
      );
    });

    it('should throw error if logger is not provided', () => {
      expect(() => new ContentFreshnessMonitor(mockSupabase, null)).to.throw(
        'Logger is required'
      );
    });
  });

  describe('checkFreshness', () => {
    const mockSubmissionId = 'test-submission-id';
    const mockFreshnessData = {
      id: 'freshness-id',
      submission_id: mockSubmissionId,
      status: 'fresh',
      last_checked_at: '2024-12-31T00:00:00Z',
      staleness_score: 25.5,
      freshness_threshold_hours: 24,
      priority: 'normal',
    };

    beforeEach(() => {
      mockSupabase.select.resolves({ data: [mockFreshnessData], error: null });
    });

    it('should retrieve freshness data for a submission', async () => {
      const result = await monitor.checkFreshness(mockSubmissionId);

      expect(mockSupabase.from).to.have.been.calledWith('content_freshness');
      expect(mockSupabase.select).to.have.been.called;
      expect(mockSupabase.eq).to.have.been.calledWith('submission_id', mockSubmissionId);
      expect(result).to.deep.equal(mockFreshnessData);
    });

    it('should return null if no freshness data found', async () => {
      mockSupabase.select.resolves({ data: [], error: null });

      const result = await monitor.checkFreshness(mockSubmissionId);

      expect(result).to.be.null;
    });

    it('should throw error if database query fails', async () => {
      const dbError = new Error('Database connection failed');
      mockSupabase.select.resolves({ data: null, error: dbError });

      await expect(monitor.checkFreshness(mockSubmissionId)).to.be.rejectedWith(
        'Failed to check freshness: Database connection failed'
      );
    });

    it('should log debug information', async () => {
      await monitor.checkFreshness(mockSubmissionId);

      expect(mockLogger.debug).to.have.been.calledWith(
        'Checking freshness for submission',
        { submissionId: mockSubmissionId }
      );
    });
  });

  describe('calculateStalenessScore', () => {
    it('should calculate staleness score based on time elapsed', () => {
      const lastChecked = new Date('2024-12-31T12:00:00Z'); // 12 hours ago
      const thresholdHours = 24;
      const priority = 'normal';

      const score = monitor.calculateStalenessScore(lastChecked, thresholdHours, priority);

      expect(score).to.equal(50.0); // 12/24 * 100 = 50%
    });

    it('should apply priority multipliers correctly', () => {
      const lastChecked = new Date('2024-12-31T12:00:00Z'); // 12 hours ago
      const thresholdHours = 24;

      const normalScore = monitor.calculateStalenessScore(lastChecked, thresholdHours, 'normal');
      const highScore = monitor.calculateStalenessScore(lastChecked, thresholdHours, 'high');
      const criticalScore = monitor.calculateStalenessScore(lastChecked, thresholdHours, 'critical');
      const lowScore = monitor.calculateStalenessScore(lastChecked, thresholdHours, 'low');

      expect(normalScore).to.equal(50.0);
      expect(highScore).to.equal(60.0); // 50 * 1.2
      expect(criticalScore).to.equal(75.0); // 50 * 1.5
      expect(lowScore).to.equal(40.0); // 50 * 0.8
    });

    it('should cap staleness score at 100', () => {
      const lastChecked = new Date('2024-12-29T00:00:00Z'); // 48 hours ago
      const thresholdHours = 24;
      const priority = 'normal';

      const score = monitor.calculateStalenessScore(lastChecked, thresholdHours, priority);

      expect(score).to.equal(100.0);
    });

    it('should handle edge case of zero threshold', () => {
      const lastChecked = new Date('2024-12-31T23:59:59Z');
      const thresholdHours = 0;
      const priority = 'normal';

      const score = monitor.calculateStalenessScore(lastChecked, thresholdHours, priority);

      expect(score).to.equal(100.0);
    });
  });

  describe('updateFreshnessStatus', () => {
    const mockSubmissionId = 'test-submission-id';
    const mockUpdateData = {
      status: 'stale',
      staleness_score: 75.5,
      last_checked_at: new Date().toISOString(),
    };

    beforeEach(() => {
      mockSupabase.update.resolves({ data: [{ id: 'freshness-id' }], error: null });
    });

    it('should update freshness status successfully', async () => {
      const result = await monitor.updateFreshnessStatus(mockSubmissionId, mockUpdateData);

      expect(mockSupabase.from).to.have.been.calledWith('content_freshness');
      expect(mockSupabase.update).to.have.been.calledWith(mockUpdateData);
      expect(mockSupabase.eq).to.have.been.calledWith('submission_id', mockSubmissionId);
      expect(result).to.be.true;
    });

    it('should throw error if update fails', async () => {
      const dbError = new Error('Update failed');
      mockSupabase.update.resolves({ data: null, error: dbError });

      await expect(
        monitor.updateFreshnessStatus(mockSubmissionId, mockUpdateData)
      ).to.be.rejectedWith('Failed to update freshness status: Update failed');
    });

    it('should log update operation', async () => {
      await monitor.updateFreshnessStatus(mockSubmissionId, mockUpdateData);

      expect(mockLogger.info).to.have.been.calledWith(
        'Updated freshness status',
        { submissionId: mockSubmissionId, status: mockUpdateData.status }
      );
    });
  });

  describe('getStaleSubmissions', () => {
    const mockStaleSubmissions = [
      {
        id: 'freshness-1',
        submission_id: 'sub-1',
        status: 'stale',
        staleness_score: 80.0,
        priority: 'high',
      },
      {
        id: 'freshness-2',
        submission_id: 'sub-2',
        status: 'stale',
        staleness_score: 65.0,
        priority: 'normal',
      },
    ];

    beforeEach(() => {
      mockSupabase.select.resolves({ data: mockStaleSubmissions, error: null });
    });

    it('should retrieve stale submissions with default parameters', async () => {
      const result = await monitor.getStaleSubmissions();

      expect(mockSupabase.from).to.have.been.calledWith('content_freshness');
      expect(mockSupabase.select).to.have.been.called;
      expect(mockSupabase.gte).to.have.been.calledWith('staleness_score', 50);
      expect(mockSupabase.order).to.have.been.calledWith('staleness_score', { ascending: false });
      expect(mockSupabase.limit).to.have.been.calledWith(100);
      expect(result).to.deep.equal(mockStaleSubmissions);
    });

    it('should accept custom threshold and limit parameters', async () => {
      const customThreshold = 75;
      const customLimit = 50;

      await monitor.getStaleSubmissions(customThreshold, customLimit);

      expect(mockSupabase.gte).to.have.been.calledWith('staleness_score', customThreshold);
      expect(mockSupabase.limit).to.have.been.calledWith(customLimit);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Query failed');
      mockSupabase.select.resolves({ data: null, error: dbError });

      await expect(monitor.getStaleSubmissions()).to.be.rejectedWith(
        'Failed to get stale submissions: Query failed'
      );
    });
  });

  describe('scheduleRefresh', () => {
    const mockSubmissionId = 'test-submission-id';
    const mockScheduleData = {
      submission_id: mockSubmissionId,
      freshness_id: 'freshness-id',
      priority: 'normal',
      scheduled_at: new Date().toISOString(),
    };

    beforeEach(() => {
      mockSupabase.insert.resolves({ data: [{ id: 'queue-id' }], error: null });
    });

    it('should schedule refresh successfully', async () => {
      const result = await monitor.scheduleRefresh(mockSubmissionId, 'freshness-id', 'normal');

      expect(mockSupabase.from).to.have.been.calledWith('refresh_queue');
      expect(mockSupabase.insert).to.have.been.calledWith(
        sinon.match({
          submission_id: mockSubmissionId,
          freshness_id: 'freshness-id',
          priority: 'normal',
        })
      );
      expect(result).to.be.true;
    });

    it('should use default priority if not specified', async () => {
      await monitor.scheduleRefresh(mockSubmissionId, 'freshness-id');

      expect(mockSupabase.insert).to.have.been.calledWith(
        sinon.match({
          priority: 'normal',
        })
      );
    });

    it('should handle scheduling errors', async () => {
      const dbError = new Error('Insert failed');
      mockSupabase.insert.resolves({ data: null, error: dbError });

      await expect(
        monitor.scheduleRefresh(mockSubmissionId, 'freshness-id', 'high')
      ).to.be.rejectedWith('Failed to schedule refresh: Insert failed');
    });

    it('should log scheduling operation', async () => {
      await monitor.scheduleRefresh(mockSubmissionId, 'freshness-id', 'high');

      expect(mockLogger.info).to.have.been.calledWith(
        'Scheduled refresh',
        { submissionId: mockSubmissionId, priority: 'high' }
      );
    });
  });

  describe('getRefreshQueue', () => {
    const mockQueueItems = [
      {
        id: 'queue-1',
        submission_id: 'sub-1',
        priority: 'high',
        status: 'pending',
        scheduled_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'queue-2',
        submission_id: 'sub-2',
        priority: 'normal',
        status: 'pending',
        scheduled_at: '2025-01-01T01:00:00Z',
      },
    ];

    beforeEach(() => {
      mockSupabase.select.resolves({ data: mockQueueItems, error: null });
    });

    it('should retrieve pending queue items with default limit', async () => {
      const result = await monitor.getRefreshQueue();

      expect(mockSupabase.from).to.have.been.calledWith('refresh_queue');
      expect(mockSupabase.select).to.have.been.called;
      expect(mockSupabase.eq).to.have.been.calledWith('status', 'pending');
      expect(mockSupabase.order).to.have.been.calledWith('scheduled_at', { ascending: true });
      expect(mockSupabase.limit).to.have.been.calledWith(50);
      expect(result).to.deep.equal(mockQueueItems);
    });

    it('should accept custom limit parameter', async () => {
      const customLimit = 25;

      await monitor.getRefreshQueue(customLimit);

      expect(mockSupabase.limit).to.have.been.calledWith(customLimit);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Queue query failed');
      mockSupabase.select.resolves({ data: null, error: dbError });

      await expect(monitor.getRefreshQueue()).to.be.rejectedWith(
        'Failed to get refresh queue: Queue query failed'
      );
    });
  });

  describe('updateRefreshQueueStatus', () => {
    const mockQueueId = 'queue-id';
    const mockStatus = 'processing';
    const mockWorkerId = 'worker-123';

    beforeEach(() => {
      mockSupabase.update.resolves({ data: [{ id: mockQueueId }], error: null });
    });

    it('should update queue item status successfully', async () => {
      const result = await monitor.updateRefreshQueueStatus(mockQueueId, mockStatus, mockWorkerId);

      expect(mockSupabase.from).to.have.been.calledWith('refresh_queue');
      expect(mockSupabase.update).to.have.been.calledWith({
        status: mockStatus,
        worker_id: mockWorkerId,
        started_at: sinon.match.string,
      });
      expect(mockSupabase.eq).to.have.been.calledWith('id', mockQueueId);
      expect(result).to.be.true;
    });

    it('should handle completion status with completed_at timestamp', async () => {
      await monitor.updateRefreshQueueStatus(mockQueueId, 'completed', mockWorkerId);

      expect(mockSupabase.update).to.have.been.calledWith({
        status: 'completed',
        worker_id: mockWorkerId,
        completed_at: sinon.match.string,
      });
    });

    it('should handle failed status with error information', async () => {
      const errorMessage = 'Processing failed';
      const errorDetails = { code: 'NETWORK_ERROR' };

      await monitor.updateRefreshQueueStatus(
        mockQueueId,
        'failed',
        mockWorkerId,
        errorMessage,
        errorDetails
      );

      expect(mockSupabase.update).to.have.been.calledWith({
        status: 'failed',
        worker_id: mockWorkerId,
        completed_at: sinon.match.string,
        error_message: errorMessage,
        error_details: errorDetails,
      });
    });

    it('should throw error if update fails', async () => {
      const dbError = new Error('Update failed');
      mockSupabase.update.resolves({ data: null, error: dbError });

      await expect(
        monitor.updateRefreshQueueStatus(mockQueueId, mockStatus, mockWorkerId)
      ).to.be.rejectedWith('Failed to update refresh queue status: Update failed');
    });
  });

  describe('createVersionSnapshot', () => {
    const mockSubmissionId = 'test-submission-id';
    const mockFreshnessId = 'freshness-id';
    const mockVersionData = {
      submission_id: mockSubmissionId,
      freshness_id: mockFreshnessId,
      version_number: 2,
      content_hash: 'new-hash',
      metadata_hash: 'new-meta-hash',
      changes_detected: { title: 'changed', description: 'changed' },
      change_summary: 'Title and description updated',
      change_score: 0.75,
      original_meta_snapshot: { title: 'New Title' },
      detection_method: 'content_hash',
    };

    beforeEach(() => {
      mockSupabase.insert.resolves({ data: [{ id: 'version-id' }], error: null });
    });

    it('should create version snapshot successfully', async () => {
      const result = await monitor.createVersionSnapshot(mockVersionData);

      expect(mockSupabase.from).to.have.been.calledWith('content_versions');
      expect(mockSupabase.insert).to.have.been.calledWith(mockVersionData);
      expect(result).to.be.true;
    });

    it('should handle creation errors', async () => {
      const dbError = new Error('Insert failed');
      mockSupabase.insert.resolves({ data: null, error: dbError });

      await expect(monitor.createVersionSnapshot(mockVersionData)).to.be.rejectedWith(
        'Failed to create version snapshot: Insert failed'
      );
    });

    it('should log version creation', async () => {
      await monitor.createVersionSnapshot(mockVersionData);

      expect(mockLogger.info).to.have.been.calledWith(
        'Created version snapshot',
        {
          submissionId: mockSubmissionId,
          version: mockVersionData.version_number,
          changeScore: mockVersionData.change_score,
        }
      );
    });
  });

  describe('getVersionHistory', () => {
    const mockSubmissionId = 'test-submission-id';
    const mockVersions = [
      {
        id: 'version-1',
        submission_id: mockSubmissionId,
        version_number: 2,
        content_hash: 'hash-2',
        created_at: '2025-01-01T01:00:00Z',
      },
      {
        id: 'version-2',
        submission_id: mockSubmissionId,
        version_number: 1,
        content_hash: 'hash-1',
        created_at: '2025-01-01T00:00:00Z',
      },
    ];

    beforeEach(() => {
      mockSupabase.select.resolves({ data: mockVersions, error: null });
    });

    it('should retrieve version history with default limit', async () => {
      const result = await monitor.getVersionHistory(mockSubmissionId);

      expect(mockSupabase.from).to.have.been.calledWith('content_versions');
      expect(mockSupabase.select).to.have.been.called;
      expect(mockSupabase.eq).to.have.been.calledWith('submission_id', mockSubmissionId);
      expect(mockSupabase.order).to.have.been.calledWith('version_number', { ascending: false });
      expect(mockSupabase.limit).to.have.been.calledWith(10);
      expect(result).to.deep.equal(mockVersions);
    });

    it('should accept custom limit parameter', async () => {
      const customLimit = 5;

      await monitor.getVersionHistory(mockSubmissionId, customLimit);

      expect(mockSupabase.limit).to.have.been.calledWith(customLimit);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('History query failed');
      mockSupabase.select.resolves({ data: null, error: dbError });

      await expect(monitor.getVersionHistory(mockSubmissionId)).to.be.rejectedWith(
        'Failed to get version history: History query failed'
      );
    });
  });

  describe('recordRefreshHistory', () => {
    const mockHistoryData = {
      submission_id: 'test-submission-id',
      freshness_id: 'freshness-id',
      queue_id: 'queue-id',
      refresh_type: 'scheduled',
      success: true,
      changes_found: true,
      processing_duration_ms: 1500,
      started_at: '2025-01-01T00:00:00Z',
      completed_at: '2025-01-01T00:01:30Z',
    };

    beforeEach(() => {
      mockSupabase.insert.resolves({ data: [{ id: 'history-id' }], error: null });
    });

    it('should record refresh history successfully', async () => {
      const result = await monitor.recordRefreshHistory(mockHistoryData);

      expect(mockSupabase.from).to.have.been.calledWith('refresh_history');
      expect(mockSupabase.insert).to.have.been.calledWith(mockHistoryData);
      expect(result).to.be.true;
    });

    it('should handle recording errors', async () => {
      const dbError = new Error('History insert failed');
      mockSupabase.insert.resolves({ data: null, error: dbError });

      await expect(monitor.recordRefreshHistory(mockHistoryData)).to.be.rejectedWith(
        'Failed to record refresh history: History insert failed'
      );
    });

    it('should log history recording', async () => {
      await monitor.recordRefreshHistory(mockHistoryData);

      expect(mockLogger.debug).to.have.been.calledWith(
        'Recorded refresh history',
        {
          submissionId: mockHistoryData.submission_id,
          success: mockHistoryData.success,
          duration: mockHistoryData.processing_duration_ms,
        }
      );
    });
  });
});