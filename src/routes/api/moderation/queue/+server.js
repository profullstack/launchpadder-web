/**
 * Moderation Queue API
 * Handles fetching and managing the moderation queue
 */

import { json } from '@sveltejs/kit';
import { ModerationService } from '$lib/services/moderation-service.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const moderationService = new ModerationService({
  supabase
});

export async function GET({ url, cookies }) {
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
    
    // Get pagination parameters
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;
    
    // Get filter parameters
    const status = url.searchParams.get('status') || 'pending_review';
    const assignedOnly = url.searchParams.get('assigned') === 'true';
    
    let result;
    
    if (assignedOnly) {
      // Get submissions assigned to this moderator
      result = await moderationService.getModerationQueue(user.id, offset, limit);
    } else if (status === 'pending_review') {
      // Get all pending submissions
      result = await moderationService.getPendingSubmissions(offset, limit);
    } else {
      // Get submissions by status with filters
      const filters = {};
      if (assignedOnly) filters.moderatorId = user.id;
      
      result = await moderationService.getSubmissionsByStatus(status, filters, offset, limit);
    }
    
    return json({
      success: true,
      ...result,
      page,
      limit
    });
    
  } catch (error) {
    console.error('Moderation queue error:', error);
    
    return json({
      error: error.message || 'Failed to fetch moderation queue'
    }, { status: 500 });
  }
}

export async function POST({ request, cookies }) {
  try {
    const { action, submissionIds, moderatorId } = await request.json();
    
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
    
    // Check permissions based on action
    const { data: permissions } = await supabase
      .rpc('get_user_moderation_permissions', { user_uuid: user.id });
    
    if (!permissions?.can_moderate) {
      return json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    let result;
    
    switch (action) {
      case 'assign':
        if (!moderatorId) {
          return json({ error: 'Moderator ID is required' }, { status: 400 });
        }
        
        if (submissionIds.length === 1) {
          result = await moderationService.assignModerator(submissionIds[0], moderatorId);
        } else {
          // Use database function for bulk assignment
          const { data, error } = await supabase
            .rpc('bulk_assign_moderator', {
              submission_ids: submissionIds,
              moderator_uuid: moderatorId
            });
          
          if (error) {
            throw new Error(`Bulk assignment failed: ${error.message}`);
          }
          
          result = { updated: data };
        }
        break;
        
      case 'auto_assign':
        // Auto-assign submissions to moderators based on workload
        const assignments = [];
        for (const submissionId of submissionIds) {
          const { data: assignedModerator } = await supabase
            .rpc('auto_assign_moderator', { submission_uuid: submissionId });
          
          assignments.push({
            submissionId,
            assignedModerator
          });
        }
        
        result = { assignments };
        break;
        
      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
    
    return json({
      success: true,
      result
    });
    
  } catch (error) {
    console.error('Moderation queue action error:', error);
    
    return json({
      error: error.message || 'Failed to perform queue action'
    }, { status: 500 });
  }
}