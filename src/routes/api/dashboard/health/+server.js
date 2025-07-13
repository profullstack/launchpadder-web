import { json } from '@sveltejs/kit';
import { createSupabaseClient } from '../../../../lib/config/supabase.js';
import { DashboardService } from '../../../../lib/services/dashboard-service.js';

/**
 * GET /api/dashboard/health
 * Get system health status
 */
export async function GET({ request }) {
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

    // Check if user has admin role
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!userRole || userRole.role !== 'admin') {
      return json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Initialize dashboard service
    const dashboardService = new DashboardService(supabase);

    // Get system health
    const health = await dashboardService.getSystemHealth();

    return json({
      success: true,
      health
    });

  } catch (error) {
    console.error('Error getting system health:', error);
    return json(
      { 
        success: false, 
        error: `Failed to get system health: ${error.message}` 
      },
      { status: 500 }
    );
  }
}