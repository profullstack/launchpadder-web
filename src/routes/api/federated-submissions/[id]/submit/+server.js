import { json } from '@sveltejs/kit';
import { createSupabaseClient } from '../../../../../lib/config/supabase.js';
import { FederationDiscoveryService } from '../../../../../lib/services/federation-discovery-service.js';
import { FederatedSubmissionService } from '../../../../../lib/services/federated-submission-service.js';

/**
 * POST /api/federated-submissions/[id]/submit
 * Submit to federated directories
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

    // Check if payment is required and completed
    if (federatedSubmission.total_cost > 0 && federatedSubmission.payment_status !== 'completed') {
      return json(
        { success: false, error: 'Payment required before submission' },
        { status: 402 }
      );
    }

    // Initialize services
    const federationDiscoveryService = new FederationDiscoveryService(supabase);
    const federatedSubmissionService = new FederatedSubmissionService(
      supabase,
      federationDiscoveryService
    );

    // Submit to federated directories
    const submissionResult = await federatedSubmissionService.submitToFederatedDirectories(id);

    // Determine response status based on results
    let responseStatus = 200;
    if (!submissionResult.success) {
      // Check if it's a partial failure (some succeeded, some failed)
      const hasSuccesses = submissionResult.results?.some(r => r.status === 'submitted');
      const hasFailures = submissionResult.results?.some(r => r.status === 'failed');
      
      if (hasSuccesses && hasFailures) {
        responseStatus = 207; // Multi-Status
      } else if (hasFailures) {
        responseStatus = 500; // All failed
      }
    }

    return json({
      success: submissionResult.success,
      results: submissionResult.results || [],
      summary: {
        total: submissionResult.results?.length || 0,
        successful: submissionResult.results?.filter(r => r.status === 'submitted').length || 0,
        failed: submissionResult.results?.filter(r => r.status === 'failed').length || 0
      }
    }, { status: responseStatus });

  } catch (error) {
    console.error('Error submitting to federated directories:', error);
    return json(
      { 
        success: false, 
        error: `Failed to submit to federated directories: ${error.message}` 
      },
      { status: 500 }
    );
  }
}