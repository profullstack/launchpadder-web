/**
 * Submissions API endpoint
 * Handles POST /api/submissions and GET /api/submissions
 */

import { json, error } from '@sveltejs/kit';
import { createSubmissionService } from '$lib/services/submission-service.js';
import { supabase } from '$lib/config/supabase.js';
import { createClient } from '@supabase/supabase-js';

// Initialize submission service lazily
let submissionService;
function getSubmissionService() {
  if (!submissionService) {
    submissionService = createSubmissionService({
      supabase,
      useEnhancedAI: false, // Disable AI for free submissions to avoid OpenAI API key requirement
      aiRewriter: null, // Explicitly disable AI rewriter
      enhancedAIService: null // Explicitly disable enhanced AI service
    });
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
    const session = locals.session;
    if (!user?.id || !session) {
      throw error(401, 'Authentication required');
    }

    // Create authenticated Supabase client with user session
    const authenticatedSupabase = createClient(
      process.env.PUBLIC_SUPABASE_URL,
      process.env.PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        global: {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        }
      }
    );

    // Parse request body
    const body = await request.json();
    
    // Handle free tier submissions
    if (body.submission_type === 'free') {
      // Check if user is admin using the database function
      const { data: adminCheck, error: userError } = await authenticatedSupabase
        .rpc('is_admin', { user_id: user.id });

      if (userError) {
        console.warn('Error checking admin status:', userError);
      }

      const isAdmin = adminCheck || false;

      if (!isAdmin) {
        // Check daily limit for non-admin users
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

        const { data: todaySubmissions, error: countError } = await authenticatedSupabase
          .from('submissions')
          .select('id')
          .eq('submitted_by', user.id)
          .gte('created_at', startOfDay.toISOString())
          .lt('created_at', endOfDay.toISOString());

        if (countError) {
          console.error('Error checking daily submissions:', countError);
          throw error(500, 'Failed to check daily submission limit');
        }

        if (todaySubmissions && todaySubmissions.length >= 1) {
          throw error(429, 'Daily free submission limit reached. Please try again tomorrow or choose a paid option.');
        }
      }

      // Set free tier specific options
      body.payment_intent = 0;
      body.payment_status = 'completed'; // Free submissions don't need payment
    }
    
    // Create submission service with authenticated client
    const submissionService = createSubmissionService({
      supabase: authenticatedSupabase,
      useEnhancedAI: false, // Disable AI for free submissions to avoid OpenAI API key requirement
      aiRewriter: null, // Explicitly disable AI rewriter
      enhancedAIService: null // Explicitly disable enhanced AI service
    });
    
    // Create submission
    const submission = await submissionService.createSubmission(body, user.id);
    
    return json({
      success: true,
      data: submission
    }, { status: 201 });

  } catch (err) {
    console.error('Submission creation error:', err);
    
    // Get error message safely
    const errorMessage = err?.message || err?.toString() || 'Unknown error';
    
    // Handle specific error types
    if (errorMessage.includes('Authentication required')) {
      throw error(401, errorMessage);
    }
    
    if (errorMessage.includes('Daily free submission limit reached')) {
      throw error(429, errorMessage);
    }
    
    if (errorMessage.includes('URL is required') ||
        errorMessage.includes('Invalid URL format') ||
        errorMessage.includes('already been submitted')) {
      throw error(400, errorMessage);
    }
    
    if (errorMessage.includes('Failed to fetch metadata')) {
      throw error(422, 'Unable to fetch metadata from the provided URL');
    }
    
    if (errorMessage.includes('AI service unavailable') ||
        errorMessage.includes('Failed to rewrite metadata')) {
      throw error(503, 'AI service temporarily unavailable');
    }
    
    // Generic server error
    throw error(500, 'Internal server error');
  }
}

/**
 * GET /api/submissions - Get submissions with filtering and pagination
 */
export async function GET({ url, locals }) {
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

    // Check if user wants their own submissions
    const mySubmissions = searchParams.get('my') === 'true';
    let submissionService;
    
    if (mySubmissions) {
      // Require authentication for user-specific submissions
      const user = locals.user;
      const session = locals.session;
      if (!user?.id || !session) {
        throw error(401, 'Authentication required');
      }
      
      // Create authenticated Supabase client for user-specific queries
      const authenticatedSupabase = createClient(
        process.env.PUBLIC_SUPABASE_URL,
        process.env.PUBLIC_SUPABASE_ANON_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          },
          global: {
            headers: {
              Authorization: `Bearer ${session.access_token}`
            }
          }
        }
      );
      
      submissionService = createSubmissionService({
        supabase: authenticatedSupabase,
        useEnhancedAI: false,
        aiRewriter: null,
        enhancedAIService: null
      });
      
      // Filter by user and include all statuses for their own submissions
      options.submitted_by = user.id;
      options.status = searchParams.get('status') || 'all'; // Default to all statuses for user's own submissions
    } else {
      // Use default service for public submissions
      submissionService = getSubmissionService();
    }

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
    const result = await submissionService.getSubmissions(options);
    
    return json({
      success: true,
      ...result
    });

  } catch (err) {
    console.error('Submissions fetch error:', err);
    
    // Get error message safely
    const errorMessage = err?.message || err?.toString() || 'Unknown error';
    
    // Handle specific error types
    if (errorMessage.includes('Authentication required')) {
      throw error(401, errorMessage);
    }
    
    throw error(500, 'Failed to fetch submissions');
  }
}