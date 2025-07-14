/**
 * Moderation Permissions API
 * Provides user moderation permissions and roles
 */

import { json } from '@sveltejs/kit';
import { supabase } from '../../../../lib/config/supabase.js';

export async function GET({ cookies }) {
  try {
    // Get user from session
    const sessionToken = cookies.get('sb-access-token');
    if (!sessionToken) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }
    
    // Verify session and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(sessionToken);
    if (authError || !user) {
      return json({ error: 'Invalid session' }, { status: 401 });
    }
    
    // Get user moderation permissions
    const { data: permissions, error } = await supabase
      .rpc('get_user_moderation_permissions', { user_uuid: user.id });
    
    if (error) {
      throw new Error(`Failed to fetch permissions: ${error.message}`);
    }
    
    return json(permissions || {
      can_moderate: false,
      can_escalate: false,
      can_resolve_escalations: false,
      can_manage_roles: false,
      roles: []
    });
    
  } catch (error) {
    console.error('Moderation permissions error:', error);
    
    return json({
      error: error.message || 'Failed to fetch permissions'
    }, { status: 500 });
  }
}