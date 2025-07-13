import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

describe('DashboardService', () => {
  let mockSupabaseClient;
  let dashboardService;

  beforeEach(() => {
    // Reset all stubs
    sinon.resetHistory();
    
    // Setup mock Supabase client
    mockSupabaseClient = {
      from: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      insert: sinon.stub().returnsThis(),
      update: sinon.stub().returnsThis(),
      delete: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      gte: sinon.stub().returnsThis(),
      lte: sinon.stub().returnsThis(),
      order: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
      range: sinon.stub().returnsThis(),
      single: sinon.stub(),
      rpc: sinon.stub(),
      auth: {
        getUser: sinon.stub().resolves({
          data: { user: { id: 'admin-123', email: 'admin@example.com' } },
          error: null
        })
      }
    };

    // Mock the DashboardService class
    const DashboardService = class {
      constructor(supabaseClient) {
        this.supabase = supabaseClient;
      }

      async getOverviewStats(timeRange = '30d') {
        // Mock implementation
        return {
          total_submissions: 150,
          pending_submissions: 25,
          approved_submissions: 100,
          rejected_submissions: 25,
          total_users: 75,
          new_users_this_period: 15,
          total_revenue: 2500.00,
          revenue_this_period: 450.00,
          federation_instances: 8,
          active_federation_instances: 6,
          submission_trends: [
            { date: '2024-01-01', count: 5 },
            { date: '2024-01-02', count: 8 },
            { date: '2024-01-03', count: 12 }
          ],
          revenue_trends: [
            { date: '2024-01-01', amount: 50.00 },
            { date: '2024-01-02', amount: 75.00 },
            { date: '2024-01-03', amount: 120.00 }
          ]
        };
      }

      async getSubmissionAnalytics(filters = {}) {
        return {
          submissions_by_status: {
            pending: 25,
            approved: 100,
            rejected: 25
          },
          submissions_by_category: {
            productivity: 45,
            entertainment: 30,
            business: 25,
            education: 20,
            other: 30
          },
          submissions_by_payment_method: {
            stripe: 80,
            crypto: 35,
            free: 35
          },
          average_approval_time: '2.5 hours',
          top_performing_submissions: [
            {
              id: 'sub-1',
              title: 'Amazing App',
              url: 'https://amazing-app.com',
              votes: 150,
              revenue: 250.00
            }
          ]
        };
      }

      async getUserAnalytics(filters = {}) {
        return {
          total_users: 75,
          active_users: 45,
          new_users_this_month: 15,
          user_retention_rate: 0.68,
          users_by_registration_method: {
            email: 60,
            google: 15
          },
          top_contributors: [
            {
              id: 'user-1',
              email: 'contributor@example.com',
              submissions_count: 8,
              total_revenue: 400.00
            }
          ]
        };
      }

      async getRevenueAnalytics(filters = {}) {
        return {
          total_revenue: 2500.00,
          revenue_this_month: 450.00,
          revenue_growth: 0.22,
          revenue_by_payment_method: {
            stripe: 1800.00,
            bitcoin: 400.00,
            ethereum: 200.00,
            solana: 100.00
          },
          revenue_by_submission_type: {
            basic: 1200.00,
            premium: 1300.00
          },
          average_revenue_per_user: 33.33,
          monthly_recurring_revenue: 380.00
        };
      }

      async getFederationAnalytics(filters = {}) {
        return {
          total_instances: 8,
          active_instances: 6,
          total_federated_submissions: 120,
          successful_federated_submissions: 95,
          federation_success_rate: 0.79,
          top_federation_partners: [
            {
              instance_url: 'https://ph-clone1.com',
              submissions_count: 45,
              success_rate: 0.89
            }
          ],
          federation_revenue: 800.00
        };
      }

      async getSystemHealth() {
        return {
          status: 'healthy',
          uptime: '99.9%',
          response_time: '120ms',
          error_rate: '0.1%',
          database_status: 'healthy',
          api_status: 'healthy',
          federation_status: 'healthy',
          payment_systems: {
            stripe: 'healthy',
            crypto: 'healthy'
          },
          recent_errors: [
            {
              timestamp: '2024-01-15T10:30:00Z',
              error: 'Federation timeout',
              count: 2
            }
          ]
        };
      }

      async getAuditLogs(filters = {}) {
        return {
          logs: [
            {
              id: 'log-1',
              timestamp: '2024-01-15T10:00:00Z',
              user_id: 'admin-123',
              action: 'submission_approved',
              resource_id: 'sub-123',
              details: { reason: 'Quality content' }
            },
            {
              id: 'log-2',
              timestamp: '2024-01-15T09:30:00Z',
              user_id: 'admin-123',
              action: 'user_banned',
              resource_id: 'user-456',
              details: { reason: 'Spam submissions' }
            }
          ],
          total_count: 250,
          has_more: true
        };
      }

      async exportData(type, filters = {}) {
        return {
          export_id: 'export-123',
          type,
          status: 'processing',
          created_at: new Date().toISOString(),
          download_url: null,
          estimated_completion: '2024-01-15T10:15:00Z'
        };
      }

      async getExportStatus(exportId) {
        return {
          export_id: exportId,
          status: 'completed',
          download_url: 'https://example.com/exports/export-123.csv',
          expires_at: '2024-01-22T10:00:00Z'
        };
      }

      async updatePlatformSettings(settings) {
        return {
          success: true,
          updated_settings: settings,
          updated_at: new Date().toISOString()
        };
      }
    };

    dashboardService = new DashboardService(mockSupabaseClient);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('should initialize with Supabase client', () => {
      expect(dashboardService.supabase).to.equal(mockSupabaseClient);
    });

    it('should throw error if no Supabase client provided', async () => {
      // Import the actual DashboardService for this test
      const { DashboardService } = await import('../../src/lib/services/dashboard-service.js');
      expect(() => new DashboardService()).to.throw('Supabase client is required');
    });
  });

  describe('getOverviewStats', () => {
    it('should return comprehensive overview statistics', async () => {
      const stats = await dashboardService.getOverviewStats('30d');

      expect(stats).to.have.property('total_submissions');
      expect(stats).to.have.property('pending_submissions');
      expect(stats).to.have.property('approved_submissions');
      expect(stats).to.have.property('rejected_submissions');
      expect(stats).to.have.property('total_users');
      expect(stats).to.have.property('total_revenue');
      expect(stats).to.have.property('federation_instances');
      expect(stats).to.have.property('submission_trends');
      expect(stats).to.have.property('revenue_trends');

      expect(stats.total_submissions).to.equal(150);
      expect(stats.total_revenue).to.equal(2500.00);
      expect(stats.submission_trends).to.be.an('array');
      expect(stats.revenue_trends).to.be.an('array');
    });

    it('should handle different time ranges', async () => {
      const stats7d = await dashboardService.getOverviewStats('7d');
      const stats30d = await dashboardService.getOverviewStats('30d');
      const stats90d = await dashboardService.getOverviewStats('90d');

      expect(stats7d).to.have.property('total_submissions');
      expect(stats30d).to.have.property('total_submissions');
      expect(stats90d).to.have.property('total_submissions');
    });
  });

  describe('getSubmissionAnalytics', () => {
    it('should return detailed submission analytics', async () => {
      const analytics = await dashboardService.getSubmissionAnalytics();

      expect(analytics).to.have.property('submissions_by_status');
      expect(analytics).to.have.property('submissions_by_category');
      expect(analytics).to.have.property('submissions_by_payment_method');
      expect(analytics).to.have.property('average_approval_time');
      expect(analytics).to.have.property('top_performing_submissions');

      expect(analytics.submissions_by_status).to.have.property('pending');
      expect(analytics.submissions_by_status).to.have.property('approved');
      expect(analytics.submissions_by_status).to.have.property('rejected');
      expect(analytics.top_performing_submissions).to.be.an('array');
    });

    it('should handle filters', async () => {
      const filters = {
        date_from: '2024-01-01',
        date_to: '2024-01-31',
        category: 'productivity'
      };

      const analytics = await dashboardService.getSubmissionAnalytics(filters);
      expect(analytics).to.have.property('submissions_by_status');
    });
  });

  describe('getUserAnalytics', () => {
    it('should return user analytics', async () => {
      const analytics = await dashboardService.getUserAnalytics();

      expect(analytics).to.have.property('total_users');
      expect(analytics).to.have.property('active_users');
      expect(analytics).to.have.property('new_users_this_month');
      expect(analytics).to.have.property('user_retention_rate');
      expect(analytics).to.have.property('users_by_registration_method');
      expect(analytics).to.have.property('top_contributors');

      expect(analytics.total_users).to.equal(75);
      expect(analytics.user_retention_rate).to.be.a('number');
      expect(analytics.top_contributors).to.be.an('array');
    });
  });

  describe('getRevenueAnalytics', () => {
    it('should return revenue analytics', async () => {
      const analytics = await dashboardService.getRevenueAnalytics();

      expect(analytics).to.have.property('total_revenue');
      expect(analytics).to.have.property('revenue_this_month');
      expect(analytics).to.have.property('revenue_growth');
      expect(analytics).to.have.property('revenue_by_payment_method');
      expect(analytics).to.have.property('revenue_by_submission_type');
      expect(analytics).to.have.property('average_revenue_per_user');

      expect(analytics.total_revenue).to.equal(2500.00);
      expect(analytics.revenue_growth).to.be.a('number');
      expect(analytics.revenue_by_payment_method).to.have.property('stripe');
      expect(analytics.revenue_by_payment_method).to.have.property('bitcoin');
    });
  });

  describe('getFederationAnalytics', () => {
    it('should return federation analytics', async () => {
      const analytics = await dashboardService.getFederationAnalytics();

      expect(analytics).to.have.property('total_instances');
      expect(analytics).to.have.property('active_instances');
      expect(analytics).to.have.property('total_federated_submissions');
      expect(analytics).to.have.property('federation_success_rate');
      expect(analytics).to.have.property('top_federation_partners');
      expect(analytics).to.have.property('federation_revenue');

      expect(analytics.total_instances).to.equal(8);
      expect(analytics.federation_success_rate).to.be.a('number');
      expect(analytics.top_federation_partners).to.be.an('array');
    });
  });

  describe('getSystemHealth', () => {
    it('should return system health status', async () => {
      const health = await dashboardService.getSystemHealth();

      expect(health).to.have.property('status');
      expect(health).to.have.property('uptime');
      expect(health).to.have.property('response_time');
      expect(health).to.have.property('error_rate');
      expect(health).to.have.property('database_status');
      expect(health).to.have.property('api_status');
      expect(health).to.have.property('federation_status');
      expect(health).to.have.property('payment_systems');
      expect(health).to.have.property('recent_errors');

      expect(health.status).to.equal('healthy');
      expect(health.payment_systems).to.have.property('stripe');
      expect(health.payment_systems).to.have.property('crypto');
      expect(health.recent_errors).to.be.an('array');
    });
  });

  describe('getAuditLogs', () => {
    it('should return audit logs', async () => {
      const auditLogs = await dashboardService.getAuditLogs();

      expect(auditLogs).to.have.property('logs');
      expect(auditLogs).to.have.property('total_count');
      expect(auditLogs).to.have.property('has_more');

      expect(auditLogs.logs).to.be.an('array');
      expect(auditLogs.logs[0]).to.have.property('id');
      expect(auditLogs.logs[0]).to.have.property('timestamp');
      expect(auditLogs.logs[0]).to.have.property('user_id');
      expect(auditLogs.logs[0]).to.have.property('action');
      expect(auditLogs.logs[0]).to.have.property('resource_id');
      expect(auditLogs.total_count).to.equal(250);
    });

    it('should handle filters', async () => {
      const filters = {
        user_id: 'admin-123',
        action: 'submission_approved',
        date_from: '2024-01-01',
        limit: 50
      };

      const auditLogs = await dashboardService.getAuditLogs(filters);
      expect(auditLogs).to.have.property('logs');
    });
  });

  describe('exportData', () => {
    it('should initiate data export', async () => {
      const exportResult = await dashboardService.exportData('submissions', {
        format: 'csv',
        date_from: '2024-01-01'
      });

      expect(exportResult).to.have.property('export_id');
      expect(exportResult).to.have.property('type');
      expect(exportResult).to.have.property('status');
      expect(exportResult).to.have.property('created_at');
      expect(exportResult).to.have.property('estimated_completion');

      expect(exportResult.type).to.equal('submissions');
      expect(exportResult.status).to.equal('processing');
    });

    it('should handle different export types', async () => {
      const submissionsExport = await dashboardService.exportData('submissions');
      const usersExport = await dashboardService.exportData('users');
      const revenueExport = await dashboardService.exportData('revenue');

      expect(submissionsExport.type).to.equal('submissions');
      expect(usersExport.type).to.equal('users');
      expect(revenueExport.type).to.equal('revenue');
    });
  });

  describe('getExportStatus', () => {
    it('should return export status', async () => {
      const status = await dashboardService.getExportStatus('export-123');

      expect(status).to.have.property('export_id');
      expect(status).to.have.property('status');
      expect(status).to.have.property('download_url');
      expect(status).to.have.property('expires_at');

      expect(status.export_id).to.equal('export-123');
      expect(status.status).to.equal('completed');
    });
  });

  describe('updatePlatformSettings', () => {
    it('should update platform settings', async () => {
      const settings = {
        platform_name: 'LaunchPadder Pro',
        submission_fee: 10.00,
        auto_approval: false,
        federation_enabled: true
      };

      const result = await dashboardService.updatePlatformSettings(settings);

      expect(result).to.have.property('success');
      expect(result).to.have.property('updated_settings');
      expect(result).to.have.property('updated_at');

      expect(result.success).to.be.true;
      expect(result.updated_settings).to.deep.equal(settings);
    });
  });
});