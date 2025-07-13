/**
 * Dashboard Service
 * Provides comprehensive analytics and management capabilities for platform owners
 */
export class DashboardService {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error('Supabase client is required');
    }
    this.supabase = supabaseClient;
  }

  /**
   * Get overview statistics for the dashboard
   * @param {string} timeRange - Time range for statistics (7d, 30d, 90d, 1y)
   * @returns {Promise<Object>} Overview statistics
   */
  async getOverviewStats(timeRange = '30d') {
    try {
      const dateFilter = this._getDateFilter(timeRange);
      
      // Get submission statistics
      const { data: submissionStats } = await this.supabase
        .rpc('get_submission_stats', { date_filter: dateFilter });

      // Get user statistics
      const { data: userStats } = await this.supabase
        .rpc('get_user_stats', { date_filter: dateFilter });

      // Get revenue statistics
      const { data: revenueStats } = await this.supabase
        .rpc('get_revenue_stats', { date_filter: dateFilter });

      // Get federation statistics
      const { data: federationStats } = await this.supabase
        .rpc('get_federation_stats', { date_filter: dateFilter });

      // Get trends data
      const { data: submissionTrends } = await this.supabase
        .rpc('get_submission_trends', { date_filter: dateFilter });

      const { data: revenueTrends } = await this.supabase
        .rpc('get_revenue_trends', { date_filter: dateFilter });

      return {
        total_submissions: submissionStats?.total_submissions || 0,
        pending_submissions: submissionStats?.pending_submissions || 0,
        approved_submissions: submissionStats?.approved_submissions || 0,
        rejected_submissions: submissionStats?.rejected_submissions || 0,
        total_users: userStats?.total_users || 0,
        new_users_this_period: userStats?.new_users_this_period || 0,
        total_revenue: revenueStats?.total_revenue || 0,
        revenue_this_period: revenueStats?.revenue_this_period || 0,
        federation_instances: federationStats?.total_instances || 0,
        active_federation_instances: federationStats?.active_instances || 0,
        submission_trends: submissionTrends || [],
        revenue_trends: revenueTrends || []
      };
    } catch (error) {
      console.error('Error getting overview stats:', error);
      throw new Error(`Failed to get overview statistics: ${error.message}`);
    }
  }

  /**
   * Get detailed submission analytics
   * @param {Object} filters - Filters for analytics
   * @returns {Promise<Object>} Submission analytics
   */
  async getSubmissionAnalytics(filters = {}) {
    try {
      const { date_from, date_to, category, status } = filters;

      // Build query with filters
      let query = this.supabase
        .from('submissions')
        .select('*');

      if (date_from) {
        query = query.gte('created_at', date_from);
      }
      if (date_to) {
        query = query.lte('created_at', date_to);
      }
      if (category) {
        query = query.eq('category', category);
      }
      if (status) {
        query = query.eq('status', status);
      }

      const { data: submissions } = await query;

      // Calculate analytics
      const submissionsByStatus = this._groupBy(submissions, 'status');
      const submissionsByCategory = this._groupBy(submissions, 'category');
      const submissionsByPaymentMethod = this._groupBy(submissions, 'payment_method');

      // Get top performing submissions
      const { data: topPerforming } = await this.supabase
        .from('submissions')
        .select(`
          id,
          title,
          url,
          votes,
          revenue_generated
        `)
        .order('votes', { ascending: false })
        .limit(10);

      // Calculate average approval time
      const { data: approvalTimes } = await this.supabase
        .rpc('get_average_approval_time', { filters });

      return {
        submissions_by_status: this._countGroups(submissionsByStatus),
        submissions_by_category: this._countGroups(submissionsByCategory),
        submissions_by_payment_method: this._countGroups(submissionsByPaymentMethod),
        average_approval_time: approvalTimes?.average_hours ? `${approvalTimes.average_hours} hours` : 'N/A',
        top_performing_submissions: topPerforming?.map(sub => ({
          id: sub.id,
          title: sub.title,
          url: sub.url,
          votes: sub.votes || 0,
          revenue: sub.revenue_generated || 0
        })) || []
      };
    } catch (error) {
      console.error('Error getting submission analytics:', error);
      throw new Error(`Failed to get submission analytics: ${error.message}`);
    }
  }

  /**
   * Get user analytics
   * @param {Object} filters - Filters for analytics
   * @returns {Promise<Object>} User analytics
   */
  async getUserAnalytics(filters = {}) {
    try {
      const { date_from, date_to } = filters;

      // Get total users
      const { count: totalUsers } = await this.supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      // Get active users (users with activity in last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count: activeUsers } = await this.supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_sign_in_at', thirtyDaysAgo.toISOString());

      // Get new users this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count: newUsersThisMonth } = await this.supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString());

      // Get users by registration method
      const { data: users } = await this.supabase
        .from('users')
        .select('registration_method');

      const usersByMethod = this._groupBy(users, 'registration_method');

      // Get top contributors
      const { data: topContributors } = await this.supabase
        .from('users')
        .select(`
          id,
          email,
          submissions:submissions(count),
          total_revenue:payments(amount.sum())
        `)
        .order('submissions.count', { ascending: false })
        .limit(10);

      // Calculate retention rate (simplified)
      const retentionRate = totalUsers > 0 ? activeUsers / totalUsers : 0;

      return {
        total_users: totalUsers || 0,
        active_users: activeUsers || 0,
        new_users_this_month: newUsersThisMonth || 0,
        user_retention_rate: Math.round(retentionRate * 100) / 100,
        users_by_registration_method: this._countGroups(usersByMethod),
        top_contributors: topContributors?.map(user => ({
          id: user.id,
          email: user.email,
          submissions_count: user.submissions?.length || 0,
          total_revenue: user.total_revenue || 0
        })) || []
      };
    } catch (error) {
      console.error('Error getting user analytics:', error);
      throw new Error(`Failed to get user analytics: ${error.message}`);
    }
  }

  /**
   * Get revenue analytics
   * @param {Object} filters - Filters for analytics
   * @returns {Promise<Object>} Revenue analytics
   */
  async getRevenueAnalytics(filters = {}) {
    try {
      // Get total revenue
      const { data: totalRevenueData } = await this.supabase
        .rpc('get_total_revenue');

      // Get revenue this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: monthlyRevenueData } = await this.supabase
        .rpc('get_revenue_by_period', {
          start_date: startOfMonth.toISOString(),
          end_date: new Date().toISOString()
        });

      // Get revenue by payment method
      const { data: payments } = await this.supabase
        .from('payments')
        .select('payment_method, amount')
        .eq('status', 'completed');

      const revenueByMethod = {};
      payments?.forEach(payment => {
        const method = payment.payment_method || 'unknown';
        revenueByMethod[method] = (revenueByMethod[method] || 0) + (payment.amount || 0);
      });

      // Get revenue by submission type
      const { data: revenueByType } = await this.supabase
        .rpc('get_revenue_by_submission_type');

      // Calculate metrics
      const totalRevenue = totalRevenueData?.total || 0;
      const monthlyRevenue = monthlyRevenueData?.total || 0;
      const totalUsers = await this._getTotalUsers();
      const averageRevenuePerUser = totalUsers > 0 ? totalRevenue / totalUsers : 0;

      // Calculate growth (simplified - comparing to previous month)
      const previousMonth = new Date();
      previousMonth.setMonth(previousMonth.getMonth() - 1);
      previousMonth.setDate(1);
      const endOfPreviousMonth = new Date(startOfMonth);
      endOfPreviousMonth.setDate(0);

      const { data: previousMonthRevenue } = await this.supabase
        .rpc('get_revenue_by_period', {
          start_date: previousMonth.toISOString(),
          end_date: endOfPreviousMonth.toISOString()
        });

      const previousTotal = previousMonthRevenue?.total || 0;
      const revenueGrowth = previousTotal > 0 ? (monthlyRevenue - previousTotal) / previousTotal : 0;

      return {
        total_revenue: totalRevenue,
        revenue_this_month: monthlyRevenue,
        revenue_growth: Math.round(revenueGrowth * 100) / 100,
        revenue_by_payment_method: revenueByMethod,
        revenue_by_submission_type: revenueByType || {},
        average_revenue_per_user: Math.round(averageRevenuePerUser * 100) / 100,
        monthly_recurring_revenue: monthlyRevenue // Simplified MRR calculation
      };
    } catch (error) {
      console.error('Error getting revenue analytics:', error);
      throw new Error(`Failed to get revenue analytics: ${error.message}`);
    }
  }

  /**
   * Get federation analytics
   * @param {Object} filters - Filters for analytics
   * @returns {Promise<Object>} Federation analytics
   */
  async getFederationAnalytics(filters = {}) {
    try {
      // Get federation instances
      const { count: totalInstances } = await this.supabase
        .from('federation_instances')
        .select('*', { count: 'exact', head: true });

      const { count: activeInstances } = await this.supabase
        .from('federation_instances')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Get federated submissions
      const { count: totalFederatedSubmissions } = await this.supabase
        .from('federation_submission_results')
        .select('*', { count: 'exact', head: true });

      const { count: successfulSubmissions } = await this.supabase
        .from('federation_submission_results')
        .select('*', { count: 'exact', head: true })
        .in('status', ['submitted', 'approved']);

      // Get top federation partners
      const { data: partnerStats } = await this.supabase
        .from('federation_submission_results')
        .select(`
          instance_url,
          status
        `);

      const partnerGroups = this._groupBy(partnerStats, 'instance_url');
      const topPartners = Object.entries(partnerGroups)
        .map(([url, submissions]) => {
          const successful = submissions.filter(s => ['submitted', 'approved'].includes(s.status)).length;
          return {
            instance_url: url,
            submissions_count: submissions.length,
            success_rate: submissions.length > 0 ? Math.round((successful / submissions.length) * 100) / 100 : 0
          };
        })
        .sort((a, b) => b.submissions_count - a.submissions_count)
        .slice(0, 10);

      // Get federation revenue (simplified)
      const { data: federationRevenue } = await this.supabase
        .rpc('get_federation_revenue');

      const successRate = totalFederatedSubmissions > 0 ? successfulSubmissions / totalFederatedSubmissions : 0;

      return {
        total_instances: totalInstances || 0,
        active_instances: activeInstances || 0,
        total_federated_submissions: totalFederatedSubmissions || 0,
        successful_federated_submissions: successfulSubmissions || 0,
        federation_success_rate: Math.round(successRate * 100) / 100,
        top_federation_partners: topPartners,
        federation_revenue: federationRevenue?.total || 0
      };
    } catch (error) {
      console.error('Error getting federation analytics:', error);
      throw new Error(`Failed to get federation analytics: ${error.message}`);
    }
  }

  /**
   * Get system health status
   * @returns {Promise<Object>} System health information
   */
  async getSystemHealth() {
    try {
      // Check database connectivity
      const dbStart = Date.now();
      const { error: dbError } = await this.supabase
        .from('submissions')
        .select('id')
        .limit(1);
      const dbResponseTime = Date.now() - dbStart;

      // Get recent errors from logs (if available)
      const { data: recentErrors } = await this.supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      // Calculate uptime and error rates (simplified)
      const { data: healthMetrics } = await this.supabase
        .rpc('get_system_health_metrics');

      return {
        status: dbError ? 'unhealthy' : 'healthy',
        uptime: healthMetrics?.uptime || '99.9%',
        response_time: `${dbResponseTime}ms`,
        error_rate: healthMetrics?.error_rate || '0.1%',
        database_status: dbError ? 'unhealthy' : 'healthy',
        api_status: 'healthy', // Would need actual API monitoring
        federation_status: 'healthy', // Would need federation health checks
        payment_systems: {
          stripe: 'healthy', // Would need Stripe API health check
          crypto: 'healthy'  // Would need crypto service health check
        },
        recent_errors: recentErrors?.map(error => ({
          timestamp: error.created_at,
          error: error.error_message,
          count: error.occurrence_count || 1
        })) || []
      };
    } catch (error) {
      console.error('Error getting system health:', error);
      return {
        status: 'unhealthy',
        uptime: 'unknown',
        response_time: 'unknown',
        error_rate: 'unknown',
        database_status: 'unhealthy',
        api_status: 'unknown',
        federation_status: 'unknown',
        payment_systems: {
          stripe: 'unknown',
          crypto: 'unknown'
        },
        recent_errors: []
      };
    }
  }

  /**
   * Get audit logs
   * @param {Object} filters - Filters for logs
   * @returns {Promise<Object>} Audit logs
   */
  async getAuditLogs(filters = {}) {
    try {
      const { user_id, action, date_from, date_to, limit = 50, offset = 0 } = filters;

      let query = this.supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (user_id) {
        query = query.eq('user_id', user_id);
      }
      if (action) {
        query = query.eq('action', action);
      }
      if (date_from) {
        query = query.gte('created_at', date_from);
      }
      if (date_to) {
        query = query.lte('created_at', date_to);
      }

      const { data: logs, error } = await query;

      if (error) {
        throw error;
      }

      // Get total count
      const { count: totalCount } = await this.supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true });

      return {
        logs: logs || [],
        total_count: totalCount || 0,
        has_more: (offset + limit) < (totalCount || 0)
      };
    } catch (error) {
      console.error('Error getting audit logs:', error);
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }
  }

  /**
   * Export data
   * @param {string} type - Type of data to export
   * @param {Object} filters - Export filters
   * @returns {Promise<Object>} Export job information
   */
  async exportData(type, filters = {}) {
    try {
      const exportId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create export job record
      const { data: exportJob, error } = await this.supabase
        .from('export_jobs')
        .insert({
          id: exportId,
          type,
          filters,
          status: 'processing',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // In a real implementation, this would trigger a background job
      // For now, we'll simulate the export process
      setTimeout(async () => {
        try {
          await this._processExport(exportId, type, filters);
        } catch (error) {
          console.error('Export processing error:', error);
        }
      }, 1000);

      return {
        export_id: exportId,
        type,
        status: 'processing',
        created_at: exportJob.created_at,
        download_url: null,
        estimated_completion: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
      };
    } catch (error) {
      console.error('Error initiating export:', error);
      throw new Error(`Failed to initiate export: ${error.message}`);
    }
  }

  /**
   * Get export status
   * @param {string} exportId - Export job ID
   * @returns {Promise<Object>} Export status
   */
  async getExportStatus(exportId) {
    try {
      const { data: exportJob, error } = await this.supabase
        .from('export_jobs')
        .select('*')
        .eq('id', exportId)
        .single();

      if (error) {
        throw error;
      }

      return {
        export_id: exportId,
        status: exportJob.status,
        download_url: exportJob.download_url,
        expires_at: exportJob.expires_at
      };
    } catch (error) {
      console.error('Error getting export status:', error);
      throw new Error(`Failed to get export status: ${error.message}`);
    }
  }

  /**
   * Update platform settings
   * @param {Object} settings - Settings to update
   * @returns {Promise<Object>} Update result
   */
  async updatePlatformSettings(settings) {
    try {
      const { data: updatedSettings, error } = await this.supabase
        .from('platform_settings')
        .upsert({
          ...settings,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        success: true,
        updated_settings: updatedSettings,
        updated_at: updatedSettings.updated_at
      };
    } catch (error) {
      console.error('Error updating platform settings:', error);
      throw new Error(`Failed to update platform settings: ${error.message}`);
    }
  }

  // Helper methods

  /**
   * Get date filter for time range
   * @private
   */
  _getDateFilter(timeRange) {
    const now = new Date();
    const days = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    };

    const daysBack = days[timeRange] || 30;
    const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
    
    return startDate.toISOString();
  }

  /**
   * Group array by property
   * @private
   */
  _groupBy(array, property) {
    if (!array) return {};
    
    return array.reduce((groups, item) => {
      const key = item[property] || 'unknown';
      groups[key] = groups[key] || [];
      groups[key].push(item);
      return groups;
    }, {});
  }

  /**
   * Count items in groups
   * @private
   */
  _countGroups(groups) {
    const counts = {};
    Object.entries(groups).forEach(([key, items]) => {
      counts[key] = items.length;
    });
    return counts;
  }

  /**
   * Get total users count
   * @private
   */
  async _getTotalUsers() {
    try {
      const { count } = await this.supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
      return count || 0;
    } catch (error) {
      console.error('Error getting total users:', error);
      return 0;
    }
  }

  /**
   * Process export job (background task simulation)
   * @private
   */
  async _processExport(exportId, type, filters) {
    try {
      // Simulate export processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Generate download URL (in real implementation, this would be actual file generation)
      const downloadUrl = `https://example.com/exports/${exportId}.csv`;
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Update export job status
      await this.supabase
        .from('export_jobs')
        .update({
          status: 'completed',
          download_url: downloadUrl,
          expires_at: expiresAt.toISOString(),
          completed_at: new Date().toISOString()
        })
        .eq('id', exportId);

    } catch (error) {
      // Mark export as failed
      await this.supabase
        .from('export_jobs')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', exportId);
    }
  }
}