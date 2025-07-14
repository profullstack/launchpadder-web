import { json } from '@sveltejs/kit';
import { supabase } from '../../../../lib/config/supabase.js';
import { DashboardService } from '../../../../lib/services/dashboard-service.js';

/**
 * GET /api/dashboard/overview
 * Get dashboard overview statistics
 */
export async function GET({ request, url }) {
  try {
    // Create Supabase client
    // Use imported supabase client directly

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
    const timeRange = url.searchParams.get('time_range') || '30d';

    // Initialize dashboard service
    const dashboardService = new DashboardService(supabase);

    // Get overview statistics
    const overviewStats = await dashboardService.getOverviewStats(timeRange);

    return json({
      success: true,
      overview: overviewStats,
      time_range: timeRange
    });

  } catch (error) {
    console.error('Error getting dashboard overview:', error);
    return json(
      { 
        success: false, 
        error: `Failed to get dashboard overview: ${error.message}` 
      },
      { status: 500 }
    );
  }
}