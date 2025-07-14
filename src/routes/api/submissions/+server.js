/**
 * Submissions API endpoint
 * Handles POST /api/submissions and GET /api/submissions
 */

import { json, error } from '@sveltejs/kit';
import { createSubmissionService } from '$lib/services/submission-service.js';
import { supabase } from '$lib/config/supabase.js';

// Initialize submission service lazily
let submissionService;
function getSubmissionService() {
  if (!submissionService) {
    submissionService = createSubmissionService({ supabase });
  }
  return submissionService;
}

/**
 * POST /api/submissions - Create a new submission
 */
export async function POST({ request, locals }) {
  try {
    // Get user from session (assuming auth middleware sets this)
    const user = locals.user;
    if (!user?.id) {
      throw error(401, 'Authentication required');
    }

    // Parse request body
    const body = await request.json();
    
    // Create submission
    const submission = await getSubmissionService().createSubmission(body, user.id);
    
    return json({
      success: true,
      data: submission
    }, { status: 201 });

  } catch (err) {
    console.error('Submission creation error:', err);
    
    // Handle specific error types
    if (err.message.includes('Authentication required')) {
      throw error(401, err.message);
    }
    
    if (err.message.includes('URL is required') || 
        err.message.includes('Invalid URL format') ||
        err.message.includes('already been submitted')) {
      throw error(400, err.message);
    }
    
    if (err.message.includes('Failed to fetch metadata')) {
      throw error(422, 'Unable to fetch metadata from the provided URL');
    }
    
    if (err.message.includes('AI service unavailable') ||
        err.message.includes('Failed to rewrite metadata')) {
      throw error(503, 'AI service temporarily unavailable');
    }
    
    // Generic server error
    throw error(500, 'Internal server error');
  }
}

/**
 * GET /api/submissions - Get submissions with filtering and pagination
 */
export async function GET({ url }) {
  try {
    // Parse query parameters
    const searchParams = url.searchParams;
    const options = {
      page: parseInt(searchParams.get('page') || '1'),
      limit: Math.min(parseInt(searchParams.get('limit') || '10'), 50), // Max 50 per page
      status: searchParams.get('status') || 'approved',
      search: searchParams.get('search') || '',
      sortBy: searchParams.get('sortBy') || 'created_at',
      sortOrder: searchParams.get('sortOrder') || 'desc'
    };

    // Handle tags parameter (comma-separated)
    const tagsParam = searchParams.get('tags');
    if (tagsParam) {
      options.tags = tagsParam.split(',').map(tag => tag.trim()).filter(Boolean);
    } else {
      options.tags = [];
    }

    // Validate sort parameters
    const allowedSortFields = ['created_at', 'published_at', 'votes_count', 'views_count', 'comments_count'];
    if (!allowedSortFields.includes(options.sortBy)) {
      options.sortBy = 'created_at';
    }

    if (!['asc', 'desc'].includes(options.sortOrder)) {
      options.sortOrder = 'desc';
    }

    // Get submissions
    const result = await getSubmissionService().getSubmissions(options);
    
    return json({
      success: true,
      ...result
    });

  } catch (err) {
    console.error('Submissions fetch error:', err);
    throw error(500, 'Failed to fetch submissions');
  }
}