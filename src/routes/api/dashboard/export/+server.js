import { json } from '@sveltejs/kit';
import { createSupabaseClient } from '../../../../lib/config/supabase.js';
import { DashboardService } from '../../../../lib/services/dashboard-service.js';

/**
 * POST /api/dashboard/export
 * Initiate data export
 */
export async function POST({ request }) {
  try {
    // Get request body
    const { type, filters = {} } = await request.json();

    // Validate required fields
    if (!type) {
      return json(
        { success: false, error: 'Export type is required' },
        { status: 400 }
      );
    }

    const validTypes = ['submissions', 'users', 'revenue', 'federation', 'audit_logs'];
    if (!validTypes.includes(type)) {
      return json(
        { success: false, error: 'Invalid export type' },
        { status: 400 }
      );
    }

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

    // Initiate export
    const exportJob = await dashboardService.exportData(type, filters);

    return json({
      success: true,
      export_job: exportJob
    }, { status: 201 });

  } catch (error) {
    console.error('Error initiating export:', error);
    return json(
      { 
        success: false, 
        error: `Failed to initiate export: ${error.message}` 
      },
      { status: 500 }
    );
  }
}