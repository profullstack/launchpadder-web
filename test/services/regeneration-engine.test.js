// test/services/regeneration-engine.test.js
// Test suite for RegenerationEngine service using Mocha and Chai

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { RegenerationEngine } from '../../src/lib/services/regeneration-engine.js';

describe('RegenerationEngine', () => {
  let engine;
  let mockSupabase;
  let mockLogger;
  let mockMetadataFetcher;
  let mockContentFreshnessMonitor;
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

    // Create mock metadata fetcher
    mockMetadataFetcher = {
      fetchMetadata: sinon.stub(),
      fetchImages: sinon.stub(),
    };

    // Create mock content freshness monitor
    mockContentFreshnessMonitor = {
      checkFreshness: sinon.stub(),
      updateFreshnessStatus: sinon.stub(),
      createVersionSnapshot: sinon.stub(),
      recordRefreshHistory: sinon.stub(),
    };

    // Create engine instance
    engine = new RegenerationEngine(
      mockSupabase,
      mockLogger,
      mockMetadataFetcher,
      mockContentFreshnessMonitor
    );

    // Setup fake timers
    clock = sinon.useFakeTimers(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    sinon.restore();
    clock.restore();
  });

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(engine).to.be.instanceOf(RegenerationEngine);
      expect(engine.supabase).to.equal(mockSupabase);
      expect(engine.logger).to.equal(mockLogger);
      expect(engine.metadataFetcher).to.equal(mockMetadataFetcher);
      expect(engine.freshnessMonitor).to.equal(mockContentFreshnessMonitor);
    });

    it('should throw error if supabase client is not provided', () => {
      expect(() => new RegenerationEngine(null, mockLogger, mockMetadataFetcher, mockContentFreshnessMonitor))
        .to.throw('Supabase client is required');
    });

    it('should throw error if logger is not provided', () => {
      expect(() => new RegenerationEngine(mockSupabase, null, mockMetadataFetcher, mockContentFreshnessMonitor))
        .to.throw('Logger is required');
    });

    it('should throw error if metadata fetcher is not provided', () => {
      expect(() => new RegenerationEngine(mockSupabase, mockLogger, null, mockContentFreshnessMonitor))
        .to.throw('Metadata fetcher is required');
    });

    it('should throw error if freshness monitor is not provided', () => {
      expect(() => new RegenerationEngine(mockSupabase, mockLogger, mockMetadataFetcher, null))
        .to.throw('Freshness monitor is required');
    });
  });

  describe('regenerateSubmission', () => {
    const mockSubmissionId = 'test-submission-id';
    const mockSubmission = {
      id: mockSubmissionId,
      url: 'https://example.com',
      original_meta: { title: 'Old Title', description: 'Old Description' },
      rewritten_meta: { title: 'Old Rewritten Title' },
      images: { thumbnail: 'old-thumb.jpg' },
    };

    const mockNewMetadata = {
      title: 'New Title',
      description: 'New Description',
      image: 'new-image.jpg',
    };

    const mockNewImages = {
      thumbnail: 'new-thumb.jpg',
      original: 'new-original.jpg',
    };

    beforeEach(() => {
      mockSupabase.select.resolves({ data: [mockSubmission], error: null });
      mockMetadataFetcher.fetchMetadata.resolves(mockNewMetadata);
      mockMetadataFetcher.fetchImages.resolves(mockNewImages);
      mockSupabase.update.resolves({ data: [{ id: mockSubmissionId }], error: null });
    });

    it('should regenerate submission successfully with changes', async () => {
      const result = await engine.regenerateSubmission(mockSubmissionId);

      expect(mockSupabase.from).to.have.been.calledWith('submissions');
      expect(mockSupabase.select).to.have.been.called;
      expect(mockSupabase.eq).to.have.been.calledWith('id', mockSubmissionId);
      expect(mockMetadataFetcher.fetchMetadata).to.have.been.calledWith(mockSubmission.url);
      expect(mockMetadataFetcher.fetchImages).to.have.been.calledWith(mockSubmission.url);
      expect(result.success).to.be.true;
      expect(result.changesDetected).to.be.true;
    });

    it('should handle submission not found', async () => {
      mockSupabase.select.resolves({ data: [], error: null });

      await expect(engine.regenerateSubmission(mockSubmissionId))
        .to.be.rejectedWith('Submission not found');
    });

    it('should handle metadata fetch failure', async () => {
      mockMetadataFetcher.fetchMetadata.rejects(new Error('Fetch failed'));

      const result = await engine.regenerateSubmission(mockSubmissionId);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Fetch failed');
    });

    it('should detect no changes when content is identical', async () => {
      // Return identical metadata
      mockMetadataFetcher.fetchMetadata.resolves({
        title: 'Old Title',
        description: 'Old Description',
      });
      mockMetadataFetcher.fetchImages.resolves({
        thumbnail: 'old-thumb.jpg',
      });

      const result = await engine.regenerateSubmission(mockSubmissionId);

      expect(result.success).to.be.true;
      expect(result.changesDetected).to.be.false;
    });

    it('should handle database update failure', async () => {
      const dbError = new Error('Update failed');
      mockSupabase.update.resolves({ data: null, error: dbError });

      const result = await engine.regenerateSubmission(mockSubmissionId);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Update failed');
    });

    it('should log regeneration process', async () => {
      await engine.regenerateSubmission(mockSubmissionId);

      expect(mockLogger.info).to.have.been.calledWith(
        'Starting regeneration',
        { submissionId: mockSubmissionId }
      );
      expect(mockLogger.info).to.have.been.calledWith(
        'Regeneration completed',
        sinon.match({ submissionId: mockSubmissionId, success: true })
      );
    });
  });

  describe('detectChanges', () => {
    const oldMetadata = {
      title: 'Old Title',
      description: 'Old Description',
      author: 'Author',
    };

    const newMetadata = {
      title: 'New Title',
      description: 'Old Description',
      author: 'Author',
    };

    it('should detect changes in metadata', () => {
      const changes = engine.detectChanges(oldMetadata, newMetadata);

      expect(changes.hasChanges).to.be.true;
      expect(changes.changedFields).to.include('title');
      expect(changes.changeScore).to.be.greaterThan(0);
    });

    it('should detect no changes when metadata is identical', () => {
      const changes = engine.detectChanges(oldMetadata, oldMetadata);

      expect(changes.hasChanges).to.be.false;
      expect(changes.changedFields).to.be.empty;
      expect(changes.changeScore).to.equal(0);
    });

    it('should handle null/undefined metadata', () => {
      const changes = engine.detectChanges(null, newMetadata);

      expect(changes.hasChanges).to.be.true;
      expect(changes.changeScore).to.be.greaterThan(0);
    });

    it('should calculate change score based on field importance', () => {
      const titleChange = engine.detectChanges(
        { title: 'Old', description: 'Same' },
        { title: 'New', description: 'Same' }
      );

      const descriptionChange = engine.detectChanges(
        { title: 'Same', description: 'Old' },
        { title: 'Same', description: 'New' }
      );

      // Title changes should have higher score than description changes
      expect(titleChange.changeScore).to.be.greaterThan(descriptionChange.changeScore);
    });

    it('should handle nested object changes', () => {
      const oldData = {
        meta: { title: 'Old', tags: ['tag1', 'tag2'] },
        stats: { views: 100 },
      };

      const newData = {
        meta: { title: 'New', tags: ['tag1', 'tag3'] },
        stats: { views: 150 },
      };

      const changes = engine.detectChanges(oldData, newData);

      expect(changes.hasChanges).to.be.true;
      expect(changes.changeScore).to.be.greaterThan(0);
    });
  });

  describe('calculateChangeScore', () => {
    it('should calculate score based on field weights', () => {
      const changes = ['title', 'description'];
      const score = engine.calculateChangeScore(changes);

      expect(score).to.be.a('number');
      expect(score).to.be.greaterThan(0);
      expect(score).to.be.lessThanOrEqual(1);
    });

    it('should return higher score for more important fields', () => {
      const titleScore = engine.calculateChangeScore(['title']);
      const authorScore = engine.calculateChangeScore(['author']);

      expect(titleScore).to.be.greaterThan(authorScore);
    });

    it('should return 0 for empty changes', () => {
      const score = engine.calculateChangeScore([]);
      expect(score).to.equal(0);
    });

    it('should cap score at 1.0', () => {
      const manyChanges = ['title', 'description', 'author', 'image', 'url', 'tags'];
      const score = engine.calculateChangeScore(manyChanges);

      expect(score).to.be.lessThanOrEqual(1.0);
    });
  });

  describe('isSignificantChange', () => {
    it('should return true for significant changes', () => {
      const significantChanges = {
        hasChanges: true,
        changeScore: 0.8,
        changedFields: ['title', 'description'],
      };

      const result = engine.isSignificantChange(significantChanges);
      expect(result).to.be.true;
    });

    it('should return false for minor changes', () => {
      const minorChanges = {
        hasChanges: true,
        changeScore: 0.05,
        changedFields: ['lastModified'],
      };

      const result = engine.isSignificantChange(minorChanges);
      expect(result).to.be.false;
    });

    it('should return false when no changes detected', () => {
      const noChanges = {
        hasChanges: false,
        changeScore: 0,
        changedFields: [],
      };

      const result = engine.isSignificantChange(noChanges);
      expect(result).to.be.false;
    });

    it('should consider field importance in significance', () => {
      const titleChange = {
        hasChanges: true,
        changeScore: 0.3,
        changedFields: ['title'],
      };

      const timestampChange = {
        hasChanges: true,
        changeScore: 0.3,
        changedFields: ['lastModified'],
      };

      expect(engine.isSignificantChange(titleChange)).to.be.true;
      expect(engine.isSignificantChange(timestampChange)).to.be.false;
    });
  });

  describe('batchRegenerate', () => {
    const mockSubmissionIds = ['sub-1', 'sub-2', 'sub-3'];

    beforeEach(() => {
      sinon.stub(engine, 'regenerateSubmission').resolves({
        success: true,
        changesDetected: true,
        processingTime: 1000,
      });
    });

    it('should process submissions in batches', async () => {
      const result = await engine.batchRegenerate(mockSubmissionIds, 2);

      expect(engine.regenerateSubmission).to.have.been.calledThrice;
      expect(result.totalProcessed).to.equal(3);
      expect(result.successful).to.equal(3);
      expect(result.failed).to.equal(0);
    });

    it('should handle batch processing errors gracefully', async () => {
      engine.regenerateSubmission.onSecondCall().rejects(new Error('Processing failed'));

      const result = await engine.batchRegenerate(mockSubmissionIds, 2);

      expect(result.totalProcessed).to.equal(3);
      expect(result.successful).to.equal(2);
      expect(result.failed).to.equal(1);
    });

    it('should respect batch size limits', async () => {
      const largeList = Array.from({ length: 10 }, (_, i) => `sub-${i}`);
      
      await engine.batchRegenerate(largeList, 3);

      // Should process in batches of 3
      expect(engine.regenerateSubmission).to.have.callCount(10);
    });

    it('should provide progress tracking', async () => {
      const progressCallback = sinon.stub();
      
      await engine.batchRegenerate(mockSubmissionIds, 2, progressCallback);

      expect(progressCallback).to.have.been.called;
      expect(progressCallback.lastCall.args[0]).to.deep.include({
        processed: 3,
        total: 3,
      });
    });

    it('should handle empty submission list', async () => {
      const result = await engine.batchRegenerate([], 5);

      expect(result.totalProcessed).to.equal(0);
      expect(result.successful).to.equal(0);
      expect(result.failed).to.equal(0);
    });
  });

  describe('rollbackSubmission', () => {
    const mockSubmissionId = 'test-submission-id';
    const mockVersionData = {
      id: 'version-id',
      submission_id: mockSubmissionId,
      version_number: 2,
      original_meta_snapshot: { title: 'Previous Title' },
      rewritten_meta_snapshot: { title: 'Previous Rewritten' },
      images_snapshot: { thumbnail: 'previous-thumb.jpg' },
    };

    beforeEach(() => {
      mockSupabase.select.resolves({ data: [mockVersionData], error: null });
      mockSupabase.update.resolves({ data: [{ id: mockSubmissionId }], error: null });
    });

    it('should rollback to previous version successfully', async () => {
      const result = await engine.rollbackSubmission(mockSubmissionId, 2);

      expect(mockSupabase.from).to.have.been.calledWith('content_versions');
      expect(mockSupabase.select).to.have.been.called;
      expect(mockSupabase.update).to.have.been.called;
      expect(result.success).to.be.true;
    });

    it('should handle version not found', async () => {
      mockSupabase.select.resolves({ data: [], error: null });

      await expect(engine.rollbackSubmission(mockSubmissionId, 2))
        .to.be.rejectedWith('Version not found');
    });

    it('should handle rollback to latest version', async () => {
      await expect(engine.rollbackSubmission(mockSubmissionId, 1))
        .to.be.rejectedWith('Cannot rollback to current version');
    });

    it('should log rollback operation', async () => {
      await engine.rollbackSubmission(mockSubmissionId, 2);

      expect(mockLogger.info).to.have.been.calledWith(
        'Rolling back submission',
        { submissionId: mockSubmissionId, targetVersion: 2 }
      );
    });
  });

  describe('getRegenerationStats', () => {
    const mockStats = [
      { success: true, processing_duration_ms: 1000, changes_found: true },
      { success: true, processing_duration_ms: 1500, changes_found: false },
      { success: false, processing_duration_ms: 500, changes_found: false },
    ];

    beforeEach(() => {
      mockSupabase.select.resolves({ data: mockStats, error: null });
    });

    it('should calculate regeneration statistics', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-02');
      
      const stats = await engine.getRegenerationStats(startDate, endDate);

      expect(stats.totalRegenerations).to.equal(3);
      expect(stats.successfulRegenerations).to.equal(2);
      expect(stats.failedRegenerations).to.equal(1);
      expect(stats.changesDetected).to.equal(1);
      expect(stats.averageProcessingTime).to.equal(1000);
    });

    it('should handle empty statistics', async () => {
      mockSupabase.select.resolves({ data: [], error: null });

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-02');
      
      const stats = await engine.getRegenerationStats(startDate, endDate);

      expect(stats.totalRegenerations).to.equal(0);
      expect(stats.averageProcessingTime).to.equal(0);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Query failed');
      mockSupabase.select.resolves({ data: null, error: dbError });

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-02');

      await expect(engine.getRegenerationStats(startDate, endDate))
        .to.be.rejectedWith('Failed to get regeneration statistics: Query failed');
    });
  });
});