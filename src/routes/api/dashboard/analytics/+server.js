import { json } from '@sveltejs/kit';
import { createSupabaseClient } from '../../../../lib/config/supabase.js';
import { DashboardService } from '../../../../lib/services/dashboard-service.js';

/**
 * GET /api/dashboard/analytics
 * Get detailed analytics based on type
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
    const type = url.searchParams.get('type') || 'submissions';
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const category = url.searchParams.get('category');
    const status = url.searchParams.get('status');

    const filters = {
      date_from: dateFrom,
      date_to: dateTo,
      category,
      status
    };

    // Initialize dashboard service
    const dashboardService = new DashboardService(supabase);

    let analytics;

    // Get analytics based on type
    switch (type) {
      case 'submissions':
        analytics = await dashboardService.getSubmissionAnalytics(filters);
        break;
      case 'users':
        analytics = await dashboardService.getUserAnalytics(filters);
        break;
      case 'revenue':
        analytics = await dashboardService.getRevenueAnalytics(filters);
        break;
      case 'federation':
        analytics = await dashboardService.getFederationAnalytics(filters);
        break;
      default:
        return json(
          { success: false, error: 'Invalid analytics type' },
          { status: 400 }
        );
    }

    return json({
      success: true,
      type,
      analytics,
      filters
    });

  } catch (error) {
    console.error('Error getting dashboard analytics:', error);
    return json(
      { 
        success: false, 
        error: `Failed to get analytics: ${error.message}` 
      },
      { status: 500 }
    );
  }
}