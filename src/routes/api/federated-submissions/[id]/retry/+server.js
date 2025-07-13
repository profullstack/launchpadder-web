import { json } from '@sveltejs/kit';
import { createSupabaseClient } from '../../../../../lib/config/supabase.js';
import { FederationDiscoveryService } from '../../../../../lib/services/federation-discovery-service.js';
import { FederatedSubmissionService } from '../../../../../lib/services/federated-submission-service.js';

/**
 * POST /api/federated-submissions/[id]/retry
 * Retry failed federated submissions
 */
export async function POST({ request, params }) {
  try {
    const { id } = params;

    if (!id) {
      return json(
        { success: false, error: 'Federated submission ID is required' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const supabase = createSupabaseClient();

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

    // Verify user owns the federated submission
    const { data: federatedSubmission, error: submissionError } = await supabase
      .from('federated_submissions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (submissionError || !federatedSubmission) {
      return json(
        { success: false, error: 'Federated submission not found or access denied' },
        { status: 404 }
      );
    }

    // Initialize services
    const federationDiscoveryService = new FederationDiscoveryService(supabase);
    const federatedSubmissionService = new FederatedSubmissionService(
      supabase,
      federationDiscoveryService
    );

    // Retry failed submissions
    const retryResult = await federatedSubmissionService.retryFailedSubmissions(id);

    return json({
      success: retryResult.success,
      retried_count: retryResult.retried_count || 0,
      results: retryResult.results || [],
      message: retryResult.retried_count > 0 
        ? `Retried ${retryResult.retried_count} failed submission(s)`
        : 'No failed submissions to retry'
    });

  } catch (error) {
    console.error('Error retrying federated submissions:', error);
    return json(
      { 
        success: false, 
        error: `Failed to retry submissions: ${error.message}` 
      },
      { status: 500 }
    );
  }
}