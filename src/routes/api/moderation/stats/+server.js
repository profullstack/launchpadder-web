/**
 * Moderation Statistics API
 * Provides moderation statistics and metrics
 */

import { json } from '@sveltejs/kit';
import { ModerationService } from '$lib/services/moderation-service.js';
import { supabase } from '../../../../lib/config/supabase.js';

// Initialize moderation service lazily
let moderationService;
function getModerationService() {
  if (!moderationService) {
    moderationService = new ModerationService({
      supabase
    });
  }
  return moderationService;
}

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
    
    // Check if user is a moderator
    const { data: permissions } = await supabase
      .rpc('get_user_moderation_permissions', { user_uuid: user.id });
    
    if (!permissions?.can_moderate) {
      return json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    // Get moderation statistics
    const stats = await getModerationService().getModerationStats();
    
    return json(stats);
    
  } catch (error) {
    console.error('Moderation stats error:', error);
    
    return json({
      error: error.message || 'Failed to fetch moderation stats'
    }, { status: 500 });
  }
}