/**
 * Moderation Review API
 * Handles submission reviews (approve/reject/escalate)
 */

import { json } from '@sveltejs/kit';
import { ModerationService } from '$lib/services/moderation-service.js';
import { EnhancedAIService } from '$lib/services/enhanced-ai-service.js';
import { supabase } from '../../../../lib/config/supabase.js';

// Initialize services lazily
let aiService;
let moderationService;

function getAIService() {
  if (!aiService) {
    aiService = new EnhancedAIService({
      openaiApiKey: process.env.OPENAI_API_KEY
    });
  }
  return aiService;
}

function getModerationService() {
  if (!moderationService) {
    moderationService = new ModerationService({
      supabase,
      aiService: getAIService()
    });
  }
  return moderationService;
}

export async function POST({ request, cookies }) {
  try {
    const { submissionId, decision, notes, escalationReason } = await request.json();
    
    if (!submissionId) {
      return json({ error: 'Submission ID is required' }, { status: 400 });
    }
    
    if (!decision) {
      return json({ error: 'Decision is required' }, { status: 400 });
    }
    
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
    
    let result;
    
    switch (decision) {
      case 'approved':
      case 'rejected':
        result = await getModerationService().reviewSubmission(
          submissionId,
          user.id,
          decision,
          notes || ''
        );
        break;
        
      case 'escalated':
        if (!escalationReason) {
          return json({ error: 'Escalation reason is required' }, { status: 400 });
        }
        
        result = await getModerationService().escalateSubmission(
          submissionId,
          escalationReason,
          user.id
        );
        break;
        
      default:
        return json({ error: 'Invalid decision' }, { status: 400 });
    }
    
    return json({
      success: true,
      submission: result
    });
    
  } catch (error) {
    console.error('Moderation review error:', error);
    
    return json({
      error: error.message || 'Failed to process review'
    }, { status: 500 });
  }
}

export async function GET({ url, cookies }) {
  try {
    const submissionId = url.searchParams.get('submissionId');
    
    if (!submissionId) {
      return json({ error: 'Submission ID is required' }, { status: 400 });
    }
    
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
    
    // Get detailed submission info for moderation
    const { data: submission, error } = await supabase
      .rpc('get_submission_for_moderation', { submission_uuid: submissionId });
    
    if (error) {
      throw new Error(`Failed to fetch submission: ${error.message}`);
    }
    
    if (!submission || submission.length === 0) {
      return json({ error: 'Submission not found' }, { status: 404 });
    }
    
    const submissionData = submission[0];
    
    // Get moderation history
    const history = await getModerationService().getModerationHistory(submissionId);
    
    return json({
      success: true,
      submission: {
        ...submissionData,
        moderationHistory: history
      }
    });
    
  } catch (error) {
    console.error('Get submission for review error:', error);
    
    return json({
      error: error.message || 'Failed to fetch submission'
    }, { status: 500 });
  }
}