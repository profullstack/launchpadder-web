import { json } from '@sveltejs/kit';
import { supabase } from '../../../lib/config/supabase.js';
import { FederationDiscoveryService } from '../../../lib/services/federation-discovery-service.js';
import { FederatedSubmissionService } from '../../../lib/services/federated-submission-service.js';

/**
 * POST /api/federated-submissions
 * Create a new federated submission with payment processing
 */
export async function POST({ request }) {
  try {
    // Get request body
    const { submission_id, directories, payment_method = 'stripe' } = await request.json();

    // Validate required fields
    if (!submission_id) {
      return json(
        { success: false, error: 'submission_id is required' },
        { status: 400 }
      );
    }

    if (!directories || !Array.isArray(directories) || directories.length === 0) {
      return json(
        { success: false, error: 'directories array is required and cannot be empty' },
        { status: 400 }
      );
    }

    // Create Supabase client
    // Use imported supabase client directly

    // Verify authentication
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

    // Verify user owns the submission
    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submission_id)
      .eq('user_id', user.id)
      .single();

    if (submissionError || !submission) {
      return json(
        { success: false, error: 'Submission not found or access denied' },
        { status: 404 }
      );
    }

    // Initialize services
    const federationDiscoveryService = new FederationDiscoveryService(supabase);
    const federatedSubmissionService = new FederatedSubmissionService(
      supabase,
      federationDiscoveryService
    );

    // Create federated submission
    const federatedSubmission = await federatedSubmissionService.createFederatedSubmission({
      submission_id,
      directories,
      payment_method,
      user_id: user.id
    });

    return json({
      success: true,
      federated_submission: federatedSubmission
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating federated submission:', error);
    
    // Handle specific validation errors
    if (error.message.includes('required') || error.message.includes('invalid')) {
      return json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return json(
      { 
        success: false, 
        error: `Failed to create federated submission: ${error.message}` 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/federated-submissions
 * List user's federated submissions
 */
export async function GET({ request, url }) {
  try {
    // Create Supabase client
    // Use imported supabase client directly

    // Verify authentication
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

    // Get query parameters
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const status = url.searchParams.get('status');

    // Build query
    let query = supabase
      .from('federated_submissions')
      .select(`
        *,
        submission:submissions(
          id,
          url,
          title,
          description,
          status
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: federatedSubmissions, error: queryError } = await query;

    if (queryError) {
      throw queryError;
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from('federated_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (countError) {
      throw countError;
    }

    return json({
      success: true,
      federated_submissions: federatedSubmissions || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (offset + limit) < (count || 0)
      }
    });

  } catch (error) {
    console.error('Error fetching federated submissions:', error);
    return json(
      { 
        success: false, 
        error: `Failed to fetch federated submissions: ${error.message}` 
      },
      { status: 500 }
    );
  }
}