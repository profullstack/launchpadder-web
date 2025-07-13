import { json } from '@sveltejs/kit';
import { createSupabaseClient } from '../../../../lib/config/supabase.js';
import { DashboardService } from '../../../../lib/services/dashboard-service.js';

/**
 * GET /api/dashboard/audit-logs
 * Get audit logs with filtering
 */
export async function GET({ request, url }) {
  try {
    // Create Supabase client
    const supabase = createSupabaseClient();

    // Verify authentication and admin role
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user has admin or moderator role
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!userRole || !['admin', 'moderator'].includes(userRole.role)) {
      return json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Get query parameters
    const userId = url.searchParams.get('user_id');
    const action = url.searchParams.get('action');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const filters = {
      user_id: userId,
      action,
      date_from: dateFrom,
      date_to: dateTo,
      limit,
      offset
    };

    // Initialize dashboard service
    const dashboardService = new DashboardService(supabase);

    // Get audit logs
    const auditLogs = await dashboardService.getAuditLogs(filters);

    return json({
      success: true,
      audit_logs: auditLogs.logs,
      pagination: {
        total: auditLogs.total_count,
        limit,
        offset,
        has_more: auditLogs.has_more
      },
      filters
    });

  } catch (error) {
    console.error('Error getting audit logs:', error);
    return json(
      { 
        success: false, 
        error: `Failed to get audit logs: ${error.message}` 
      },
      { status: 500 }
    );
  }
}