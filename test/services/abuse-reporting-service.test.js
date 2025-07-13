/**
 * Abuse Reporting Service Tests
 * Tests for user reporting mechanisms and automated flagging
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { abuseReportingService } from '../../src/lib/services/abuse-reporting-service.js';

describe('Abuse Reporting Service', () => {
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
      in: sinon.stub().returnsThis(),
      gte: sinon.stub().returnsThis(),
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

  describe('submitReport', () => {
    it('should submit abuse report for submission', async () => {
      const reportData = {
        submission_id: 'sub-123',
        reported_by: 'user-456',
        report_type: 'spam',
        description: 'This submission contains spam content'
      };

      supabaseStub.single.resolves({
        data: {
          id: 'report-1',
          ...reportData,
          status: 'pending',
          priority: 2,
          created_at: new Date().toISOString()
        },
        error: null
      });

      const result = await abuseReportingService.submitReport(reportData);

      expect(result.success).to.be.true;
      expect(result.reportId).to.equal('report-1');
      expect(result.status).to.equal('pending');
      expect(result.priority).to.equal(2);
    });

    it('should handle different report types', async () => {
      const reportTypes = ['spam', 'inappropriate', 'copyright', 'harassment', 'other'];

      for (const reportType of reportTypes) {
        supabaseStub.single.resolves({
          data: {
            id: `report-${reportType}`,
            report_type: reportType,
            status: 'pending',
            priority: 1
          },
          error: null
        });

        const result = await abuseReportingService.submitReport({
          submission_id: 'sub-123',
          reported_by: 'user-456',
          report_type: reportType,
          description: `Test ${reportType} report`
        });

        expect(result.success).to.be.true;
        expect(result.reportType).to.equal(reportType);
      }
    });

    it('should calculate priority based on report type', async () => {
      const priorityTests = [
        { type: 'copyright', expectedPriority: 4 },
        { type: 'harassment', expectedPriority: 3 },
        { type: 'spam', expectedPriority: 2 },
        { type: 'inappropriate', expectedPriority: 2 },
        { type: 'other', expectedPriority: 1 }
      ];

      for (const test of priorityTests) {
        supabaseStub.single.resolves({
          data: {
            id: 'report-1',
            report_type: test.type,
            priority: test.expectedPriority,
            status: 'pending'
          },
          error: null
        });

        const result = await abuseReportingService.submitReport({
          submission_id: 'sub-123',
          reported_by: 'user-456',
          report_type: test.type,
          description: 'Test report'
        });

        expect(result.priority).to.equal(test.expectedPriority);
      }
    });

    it('should prevent duplicate reports from same user', async () => {
      // Mock existing report check
      supabaseStub.single.onFirstCall().resolves({
        data: {
          id: 'existing-report',
          submission_id: 'sub-123',
          reported_by: 'user-456'
        },
        error: null
      });

      const result = await abuseReportingService.submitReport({
        submission_id: 'sub-123',
        reported_by: 'user-456',
        report_type: 'spam',
        description: 'Duplicate report'
      });

      expect(result.success).to.be.false;
      expect(result.error).to.include('already reported');
    });

    it('should validate required fields', async () => {
      const invalidReports = [
        { submission_id: '', reported_by: 'user-456', report_type: 'spam', description: 'Test' },
        { submission_id: 'sub-123', reported_by: '', report_type: 'spam', description: 'Test' },
        { submission_id: 'sub-123', reported_by: 'user-456', report_type: '', description: 'Test' },
        { submission_id: 'sub-123', reported_by: 'user-456', report_type: 'spam', description: '' }
      ];

      for (const invalidReport of invalidReports) {
        try {
          await abuseReportingService.submitReport(invalidReport);
          expect.fail('Should have thrown validation error');
        } catch (error) {
          expect(error.message).to.include('required');
        }
      }
    });

    it('should handle database errors gracefully', async () => {
      supabaseStub.single.resolves({
        data: null,
        error: { message: 'Database connection failed' }
      });

      try {
        await abuseReportingService.submitReport({
          submission_id: 'sub-123',
          reported_by: 'user-456',
          report_type: 'spam',
          description: 'Test report'
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to submit abuse report');
      }
    });
  });

  describe('getReports', () => {
    it('should retrieve reports with filtering and pagination', async () => {
      const mockReports = [
        {
          id: 'report-1',
          submission_id: 'sub-123',
          report_type: 'spam',
          status: 'pending',
          priority: 2,
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'report-2',
          submission_id: 'sub-456',
          report_type: 'inappropriate',
          status: 'investigating',
          priority: 3,
          created_at: '2024-01-01T01:00:00Z'
        }
      ];

      supabaseStub.data = mockReports;
      supabaseStub.error = null;

      const result = await abuseReportingService.getReports({
        status: 'pending',
        page: 1,
        limit: 10
      });

      expect(result.reports).to.have.length(2);
      expect(result.reports[0].id).to.equal('report-1');
      expect(result.pagination.page).to.equal(1);
      expect(result.pagination.limit).to.equal(10);
    });

    it('should filter by status', async () => {
      const pendingReports = [
        { id: 'report-1', status: 'pending' },
        { id: 'report-2', status: 'pending' }
      ];

      supabaseStub.data = pendingReports;
      supabaseStub.error = null;

      const result = await abuseReportingService.getReports({ status: 'pending' });

      expect(result.reports).to.have.length(2);
      expect(result.reports.every(r => r.status === 'pending')).to.be.true;
    });

    it('should filter by priority', async () => {
      const highPriorityReports = [
        { id: 'report-1', priority: 4 },
        { id: 'report-2', priority: 3 }
      ];

      supabaseStub.data = highPriorityReports;
      supabaseStub.error = null;

      const result = await abuseReportingService.getReports({ minPriority: 3 });

      expect(result.reports).to.have.length(2);
      expect(result.reports.every(r => r.priority >= 3)).to.be.true;
    });

    it('should sort by creation date descending by default', async () => {
      const sortedReports = [
        { id: 'report-2', created_at: '2024-01-01T02:00:00Z' },
        { id: 'report-1', created_at: '2024-01-01T01:00:00Z' }
      ];

      supabaseStub.data = sortedReports;
      supabaseStub.error = null;

      const result = await abuseReportingService.getReports();

      expect(result.reports[0].id).to.equal('report-2');
      expect(result.reports[1].id).to.equal('report-1');
    });
  });

  describe('updateReportStatus', () => {
    it('should update report status and add resolution notes', async () => {
      const reportId = 'report-123';
      const updates = {
        status: 'resolved',
        resolution_notes: 'Content removed and user warned',
        assigned_to: 'moderator-456'
      };

      supabaseStub.single.resolves({
        data: {
          id: reportId,
          ...updates,
          resolved_at: new Date().toISOString()
        },
        error: null
      });

      const result = await abuseReportingService.updateReportStatus(reportId, updates);

      expect(result.status).to.equal('resolved');
      expect(result.resolution_notes).to.equal('Content removed and user warned');
      expect(result.resolved_at).to.be.a('string');
    });

    it('should validate status values', async () => {
      const reportId = 'report-123';
      const invalidStatus = 'invalid_status';

      try {
        await abuseReportingService.updateReportStatus(reportId, { status: invalidStatus });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid status');
      }
    });

    it('should validate priority values', async () => {
      const reportId = 'report-123';
      const invalidPriority = 5; // Priority should be 1-4

      try {
        await abuseReportingService.updateReportStatus(reportId, { priority: invalidPriority });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid priority');
      }
    });

    it('should automatically set resolved_at when status is resolved', async () => {
      const reportId = 'report-123';

      supabaseStub.single.resolves({
        data: {
          id: reportId,
          status: 'resolved',
          resolved_at: new Date().toISOString()
        },
        error: null
      });

      const result = await abuseReportingService.updateReportStatus(reportId, { status: 'resolved' });

      expect(result.status).to.equal('resolved');
      expect(result.resolved_at).to.be.a('string');
    });
  });

  describe('assignReport', () => {
    it('should assign report to moderator', async () => {
      const reportId = 'report-123';
      const moderatorId = 'mod-456';

      supabaseStub.single.resolves({
        data: {
          id: reportId,
          assigned_to: moderatorId,
          status: 'investigating'
        },
        error: null
      });

      const result = await abuseReportingService.assignReport(reportId, moderatorId);

      expect(result.success).to.be.true;
      expect(result.assignedTo).to.equal(moderatorId);
      expect(result.status).to.equal('investigating');
    });

    it('should handle assignment to non-existent moderator', async () => {
      const reportId = 'report-123';
      const invalidModeratorId = 'invalid-mod';

      supabaseStub.single.resolves({
        data: null,
        error: { message: 'Foreign key violation' }
      });

      try {
        await abuseReportingService.assignReport(reportId, invalidModeratorId);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Failed to assign report');
      }
    });
  });

  describe('getReportStatistics', () => {
    it('should return comprehensive report statistics', async () => {
      const mockStats = {
        total_reports: 1000,
        pending_reports: 150,
        investigating_reports: 50,
        resolved_reports: 750,
        dismissed_reports: 50
      };

      // Mock multiple database calls for stats
      supabaseStub.single
        .onCall(0).resolves({ data: { count: 1000 }, error: null })
        .onCall(1).resolves({ data: { count: 150 }, error: null })
        .onCall(2).resolves({ data: { count: 50 }, error: null })
        .onCall(3).resolves({ data: { count: 750 }, error: null })
        .onCall(4).resolves({ data: { count: 50 }, error: null });

      const result = await abuseReportingService.getReportStatistics();

      expect(result.totalReports).to.equal(1000);
      expect(result.pendingReports).to.equal(150);
      expect(result.investigatingReports).to.equal(50);
      expect(result.resolvedReports).to.equal(750);
      expect(result.dismissedReports).to.equal(50);
    });

    it('should calculate resolution rate', async () => {
      supabaseStub.single
        .onCall(0).resolves({ data: { count: 1000 }, error: null })
        .onCall(1).resolves({ data: { count: 150 }, error: null })
        .onCall(2).resolves({ data: { count: 50 }, error: null })
        .onCall(3).resolves({ data: { count: 750 }, error: null })
        .onCall(4).resolves({ data: { count: 50 }, error: null });

      const result = await abuseReportingService.getReportStatistics();

      expect(result.resolutionRate).to.equal(80); // (750 + 50) / 1000 * 100
    });

    it('should include report type distribution', async () => {
      const mockTypeStats = [
        { report_type: 'spam', count: 400 },
        { report_type: 'inappropriate', count: 300 },
        { report_type: 'copyright', count: 200 },
        { report_type: 'harassment', count: 100 }
      ];

      supabaseStub.data = mockTypeStats;
      supabaseStub.error = null;

      const result = await abuseReportingService.getReportStatistics();

      expect(result.reportTypeDistribution).to.have.length(4);
      expect(result.reportTypeDistribution[0].report_type).to.equal('spam');
      expect(result.reportTypeDistribution[0].count).to.equal(400);
    });
  });

  describe('autoFlagSubmission', () => {
    it('should automatically flag submission based on criteria', async () => {
      const submissionId = 'sub-123';
      const flaggingCriteria = {
        reason: 'High spam confidence score',
        confidence: 95,
        rule_triggered: 'spam_keywords'
      };

      supabaseStub.single.resolves({
        data: {
          id: 'auto-report-1',
          submission_id: submissionId,
          report_type: 'spam',
          status: 'pending',
          priority: 3,
          description: 'Automatically flagged: High spam confidence score'
        },
        error: null
      });

      const result = await abuseReportingService.autoFlagSubmission(submissionId, flaggingCriteria);

      expect(result.success).to.be.true;
      expect(result.reportId).to.equal('auto-report-1');
      expect(result.autoFlagged).to.be.true;
    });

    it('should set appropriate priority for auto-flagged content', async () => {
      const submissionId = 'sub-123';
      const highConfidenceCriteria = {
        reason: 'Extremely high spam score',
        confidence: 98
      };

      supabaseStub.single.resolves({
        data: {
          id: 'auto-report-1',
          priority: 4 // Should be high priority for high confidence
        },
        error: null
      });

      const result = await abuseReportingService.autoFlagSubmission(submissionId, highConfidenceCriteria);

      expect(result.priority).to.equal(4);
    });

    it('should prevent duplicate auto-flagging', async () => {
      const submissionId = 'sub-123';

      // Mock existing auto-flag check
      supabaseStub.single.onFirstCall().resolves({
        data: {
          id: 'existing-auto-report',
          submission_id: submissionId
        },
        error: null
      });

      const result = await abuseReportingService.autoFlagSubmission(submissionId, {
        reason: 'Test auto-flag'
      });

      expect(result.success).to.be.false;
      expect(result.error).to.include('already auto-flagged');
    });
  });

  describe('bulkUpdateReports', () => {
    it('should update multiple reports at once', async () => {
      const updates = [
        { id: 'report-1', status: 'resolved' },
        { id: 'report-2', status: 'dismissed' }
      ];

      supabaseStub.data = updates.map(update => ({
        ...update,
        updated_at: new Date().toISOString()
      }));
      supabaseStub.error = null;

      const result = await abuseReportingService.bulkUpdateReports(updates);

      expect(result.success).to.be.true;
      expect(result.updatedCount).to.equal(2);
    });

    it('should validate bulk update data', async () => {
      const invalidUpdates = [
        { id: 'report-1', status: 'invalid_status' }
      ];

      try {
        await abuseReportingService.bulkUpdateReports(invalidUpdates);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).to.include('Invalid status');
      }
    });
  });

  describe('getReportsBySubmission', () => {
    it('should retrieve all reports for a specific submission', async () => {
      const submissionId = 'sub-123';
      const mockReports = [
        {
          id: 'report-1',
          submission_id: submissionId,
          report_type: 'spam',
          reported_by: 'user-1'
        },
        {
          id: 'report-2',
          submission_id: submissionId,
          report_type: 'inappropriate',
          reported_by: 'user-2'
        }
      ];

      supabaseStub.data = mockReports;
      supabaseStub.error = null;

      const result = await abuseReportingService.getReportsBySubmission(submissionId);

      expect(result).to.have.length(2);
      expect(result.every(r => r.submission_id === submissionId)).to.be.true;
    });
  });

  describe('getModerationQueue', () => {
    it('should return prioritized moderation queue', async () => {
      const mockQueue = [
        {
          id: 'report-1',
          priority: 4,
          status: 'pending',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'report-2',
          priority: 3,
          status: 'investigating',
          created_at: '2024-01-01T01:00:00Z'
        }
      ];

      supabaseStub.data = mockQueue;
      supabaseStub.error = null;

      const result = await abuseReportingService.getModerationQueue();

      expect(result.queue).to.have.length(2);
      expect(result.queue[0].priority).to.be.greaterThanOrEqual(result.queue[1].priority);
    });

    it('should include queue statistics', async () => {
      supabaseStub.data = [
        { priority: 4, count: 5 },
        { priority: 3, count: 10 },
        { priority: 2, count: 20 },
        { priority: 1, count: 15 }
      ];
      supabaseStub.error = null;

      const result = await abuseReportingService.getModerationQueue();

      expect(result.statistics.totalItems).to.equal(50);
      expect(result.statistics.criticalItems).to.equal(5);
      expect(result.statistics.highPriorityItems).to.equal(10);
    });
  });
});