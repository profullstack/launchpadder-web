import { json } from '@sveltejs/kit';
import { supabase } from '../../../../lib/config/supabase.js';
import { DashboardService } from '../../../../lib/services/dashboard-service.js';

/**
 * GET /api/dashboard/settings
 * Get platform settings
 */
export async function GET({ request }) {
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

    // Get platform settings
    const { data: settings, error: settingsError } = await supabase
      .from('platform_settings')
      .select('*')
      .single();

    if (settingsError) {
      throw settingsError;
    }

    return json({
      success: true,
      settings: settings || {}
    });

  } catch (error) {
    console.error('Error getting platform settings:', error);
    return json(
      { 
        success: false, 
        error: `Failed to get platform settings: ${error.message}` 
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/dashboard/settings
 * Update platform settings
 */
export async function PUT({ request }) {
  try {
    // Get request body
    const settings = await request.json();

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

    // Update platform settings
    const result = await dashboardService.updatePlatformSettings(settings);

    // Log the settings update
    await supabase
      .from('audit_logs')
      .insert({
        user_id: user.id,
        action: 'platform_settings_updated',
        resource_type: 'platform_settings',
        details: { updated_fields: Object.keys(settings) }
      });

    return json({
      success: true,
      settings: result.updated_settings,
      updated_at: result.updated_at
    });

  } catch (error) {
    console.error('Error updating platform settings:', error);
    return json(
      { 
        success: false, 
        error: `Failed to update platform settings: ${error.message}` 
      },
      { status: 500 }
    );
  }
}